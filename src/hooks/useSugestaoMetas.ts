import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick, num, lucroDaLinha } from "@/lib/vrReport";
import {
  DiaVenda, MesSerie, serieMensal, ontemSP, ym,
} from "@/lib/metasSugestao";

export const LOJA = "LOJA";
export const OUTROS = "OUTROS";

const norm = (s: string) =>
  (s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export interface DeptHistorico {
  departamento: string;
  dias: DiaVenda[];        // todos os dias dos dois ranges
  serie: MesSerie[];       // serie mensal (ate 24 meses)
  ytdAtual: number;
  ytdAnterior: number;
}

export interface SugestaoMetasData {
  departamentos: string[];
  porDept: Record<string, DeptHistorico>;
  /** mesma estrutura, porem agregada por categoria (secao mercadologica bruta) */
  categorias: string[];
  porCategoria: Record<string, DeptHistorico>;
  aviso: string | null;
  rangeA: { inicio: string; fim: string };
  rangeB: { inicio: string; fim: string };
}

async function carregar(storeId: string, anoAlvo: number): Promise<SugestaoMetasData> {
  const ontem = ontemSP();
  const anoCorrente = Number(ontem.slice(0, 4));
  const anoAnterior = anoCorrente - 1;

  const rangeA = { inicio: `${anoAnterior}-01-01`, fim: `${anoAnterior}-12-31` };
  const rangeB = { inicio: `${anoCorrente}-01-01`, fim: ontem };

  const semMix = { dados: [] as any[] };
  const [{ data: mapas }, rA, rB, mA, mB] = await Promise.all([
    supabase.from("vr_secao_departamento").select("secao_vr, department").eq("store_id", storeId),
    chamarRelatorio(storeId, "vendas_secao_periodo", rangeA),
    chamarRelatorio(storeId, "vendas_secao_periodo", rangeB),
    chamarRelatorio(storeId, "mix_positivacao_periodo", rangeA).catch(() => semMix as any),
    chamarRelatorio(storeId, "mix_positivacao_periodo", rangeB).catch(() => semMix as any),
  ]);

  const mapa = new Map<string, string>();
  for (const m of mapas ?? []) mapa.set(norm(m.secao_vr), m.department);

  const aviso = avisoRelatorio(rA) ?? avisoRelatorio(rB);

  // acumula por departamento x data (e, em paralelo, por categoria x data)
  const acc = new Map<string, Map<string, DiaVenda>>();
  const accCat = new Map<string, Map<string, DiaVenda>>();
  const somar = (alvo: Map<string, Map<string, DiaVenda>>, chave: string, d: DiaVenda) => {
    let m = alvo.get(chave);
    if (!m) { m = new Map(); alvo.set(chave, m); }
    const cur = m.get(d.date) ?? { date: d.date, vendas: 0, lucro: 0, volume: 0, mix: 0 };
    cur.vendas += d.vendas;
    cur.lucro += d.lucro;
    cur.volume += d.volume;
    cur.mix = (cur.mix ?? 0) + (d.mix ?? 0);
    m.set(d.date, cur);
  };
  const add = (dep: string, d: DiaVenda) => somar(acc, dep, d);

  for (const linha of [...rA.dados, ...rB.dados]) {
    const date = String(pick(linha, "data", "dia") ?? "").slice(0, 10);
    if (!date) continue;
    const vendas = num(pick(linha, "total_vendido", "venda", "vendas"));
    const item: DiaVenda = {
      date,
      vendas,
      lucro: lucroDaLinha(linha, vendas),
      volume: num(pick(linha, "volume", "qtde", "quantidade")),
      mix: 0,
    };
    const secao = String(pick(linha, "secao", "departamento") ?? "");
    const categoria = String(pick(linha, "categoria") ?? secao).trim() || OUTROS;
    const dep = mapa.get(norm(secao)) ?? OUTROS;
    add(LOJA, item);
    if (dep !== LOJA) add(dep, item);
    somar(accCat, categoria.toUpperCase(), item);
  }

  // Mix (positivacao) — relatorio opcional; quando ausente o mix fica zerado.
  for (const linha of [...(mA?.dados ?? []), ...(mB?.dados ?? [])]) {
    const date = String(pick(linha, "data", "dia") ?? "").slice(0, 10);
    if (!date) continue;
    const item: DiaVenda = {
      date, vendas: 0, lucro: 0, volume: 0,
      mix: num(pick(linha, "mix", "produtos", "itens")),
    };
    if (!item.mix) continue;
    const secao = String(pick(linha, "secao", "departamento", "categoria") ?? "");
    const categoria = String(pick(linha, "categoria") ?? secao).trim() || OUTROS;
    const dep = mapa.get(norm(secao)) ?? OUTROS;
    add(LOJA, item);
    if (dep !== LOJA) add(dep, item);
    somar(accCat, categoria.toUpperCase(), item);
  }

  const construir = (origem: Map<string, Map<string, DiaVenda>>) => {
  const porDept: Record<string, DeptHistorico> = {};
  for (const [dep, m] of origem) {
    const dias = [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
    const serie = serieMensal(dias).slice(-24);
    // YTD: 01/01 ate ontem no ano corrente; mesmo intervalo no ano anterior
    const corteMD = ontem.slice(5);
    let ytdAtual = 0, ytdAnterior = 0;
    for (const d of dias) {
      const ano = Number(d.date.slice(0, 4));
      const md = d.date.slice(5);
      if (md > corteMD) continue;
      if (ano === anoCorrente) ytdAtual += d.vendas;
      else if (ano === anoAnterior) ytdAnterior += d.vendas;
    }
    porDept[dep] = { departamento: dep, dias, serie, ytdAtual, ytdAnterior };
  }
  const nomes = Object.keys(porDept).sort((a, b) => {
    if (a === LOJA) return -1;
    if (b === LOJA) return 1;
    return a.localeCompare(b, "pt-BR");
  });
  return { nomes, porDept };
  };

  const dept = construir(acc);
  const cat = construir(accCat);

  return {
    departamentos: dept.nomes,
    porDept: dept.porDept,
    categorias: cat.nomes,
    porCategoria: cat.porDept,
    aviso, rangeA, rangeB,
  };
}

export function useSugestaoMetas(storeId: string, mesAlvo: { ano: number; mes: number }) {
  return useQuery({
    queryKey: ["sugestao-metas", storeId, ym(mesAlvo.ano, mesAlvo.mes)],
    queryFn: () => carregar(storeId, mesAlvo.ano),
    enabled: !!storeId,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
