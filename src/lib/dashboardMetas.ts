import { supabase } from "@/integrations/supabase/client";
import { canonDept, inferirDepartamento } from "@/hooks/useVrRealizado";
import { mercadologicoNivel1 } from "@/lib/mercadologico";
import { diasEntre, leituraCompleta } from "@/lib/hubDiario";
import { num, pick } from "@/lib/vrReport";
import { ultimoMesFechado } from "@/lib/metasSugestao";
import {
  intervalo12MesesFechados,
  mesesDoPeriodo,
  ratearMetasLoja,
  type LinhaMetaDashboard,
} from "@/lib/dashboardMetasRateio";

interface OpcoesBusca {
  storeId: string;
  inicio: string;
  fim: string;
  departamento?: string | null;
  restrito?: boolean;
  permiteDept?: (dep: string) => boolean;
}

export interface ResultadoMetasDashboard {
  linhas: any[];
  rateada: boolean;
  mesesBase: number;
}

interface RegistroHistorico {
  relatorio: string;
  params: Record<string, unknown>;
  dados: unknown;
  atualizado_em: string;
}

const normalizar = (s: string) => String(s || "")
  .toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

function linhasValidas(registro: RegistroHistorico): any[] | null {
  if (!Array.isArray(registro.dados) || !leituraCompleta(registro.params, registro.atualizado_em)) return null;
  const limite = Number(registro.params.limite) || 0;
  if (limite > 0 && registro.dados.length >= limite) return null;
  return registro.dados;
}

/** Participação das vendas salvas no Hub; nunca dispara consulta ao ERP. */
async function buscarParticipacoes(storeId: string, ano: number, mes: number) {
  const periodo = intervalo12MesesFechados(ano, mes, ultimoMesFechado());
  const [{ data: mapas }, { data: registros, error }] = await Promise.all([
    supabase.from("vr_secao_departamento").select("secao_vr, department").eq("store_id", storeId),
    supabase.from("relatorio_cache")
      .select("relatorio, params, dados, atualizado_em")
      .eq("store_id", storeId)
      .in("relatorio", ["vendas_secao_periodo", "vendas_secao_dia"])
      .gte("params->>fim", periodo.inicio)
      .lte("params->>inicio", periodo.fim)
      .order("atualizado_em", { ascending: false })
      .limit(5000),
  ]);
  if (error) throw error;

  const mapa = new Map<string, string>();
  for (const m of mapas ?? []) mapa.set(normalizar(m.secao_vr), m.department);
  const todos = (registros ?? []) as RegistroHistorico[];
  const escolhidos: RegistroHistorico[] = [];

  for (const mesFechado of mesesDoPeriodo(periodo)) {
    const mensal = todos.find((r) =>
      r.params.inicio === mesFechado.inicio && r.params.fim === mesFechado.fim && linhasValidas(r) !== null,
    );
    if (mensal) {
      escolhidos.push(mensal);
      continue;
    }
    for (const dia of diasEntre(mesFechado.inicio, mesFechado.fim)) {
      const diario = todos.find((r) => r.params.inicio === dia && r.params.fim === dia && linhasValidas(r) !== null);
      if (diario) escolhidos.push(diario);
    }
  }

  const vendas = new Map<string, number>();
  for (const registro of escolhidos) {
    for (const linha of linhasValidas(registro) ?? []) {
      const secao = mercadologicoNivel1(linha);
      const dep = canonDept(mapa.get(normalizar(secao)) ?? inferirDepartamento(secao, secao) ?? secao);
      const valor = num(pick(linha, "total_vendido", "venda", "vendas", "faturamento"));
      if (!dep || dep === "LOJA" || dep === "OUTROS" || valor <= 0) continue;
      vendas.set(dep, (vendas.get(dep) ?? 0) + valor);
    }
  }
  const total = [...vendas.values()].reduce((s, v) => s + v, 0);
  const participacoes = total > 0
    ? Object.fromEntries([...vendas.entries()].map(([dep, valor]) => [dep, valor / total]))
    : {};
  const mesesBase = new Set(escolhidos.map((r) => String(r.params.inicio).slice(0, 7))).size;
  return { participacoes, mesesBase };
}

const cacheParticipacoes = new Map<string, { at: number; promise: ReturnType<typeof buscarParticipacoes> }>();
function participacoesComCache(storeId: string, ano: number, mes: number) {
  const chave = `${storeId}|${ano}|${mes}`;
  const atual = cacheParticipacoes.get(chave);
  if (atual && Date.now() - atual.at < 30 * 60_000) return atual.promise;
  const promise = buscarParticipacoes(storeId, ano, mes);
  cacheParticipacoes.set(chave, { at: Date.now(), promise });
  promise.catch(() => cacheParticipacoes.delete(chave));
  return promise;
}

function agregarPorDia(linhas: any[]): any[] {
  const porDia = new Map<string, any>();
  for (const l of linhas) {
    const atual = porDia.get(l.date) ?? {
      date: l.date,
      tipo_dia: l.tipo_dia,
      meta_vendas: 0,
      meta_lucro: 0,
      meta_volume: 0,
      projecao_vendas: 0,
      projecao_lucro: 0,
      projecao_volume: 0,
      __meta_rateada_dashboard: !!l.__meta_rateada_dashboard,
    };
    for (const campo of ["meta_vendas", "meta_lucro", "meta_volume", "projecao_vendas", "projecao_lucro", "projecao_volume"]) {
      atual[campo] += Number(l[campo]) || 0;
    }
    porDia.set(l.date, atual);
  }
  return [...porDia.values()].map((d) => ({
    ...d,
    meta_margem_pct: d.meta_vendas > 0 ? (d.meta_lucro / d.meta_vendas) * 100 : 0,
    projecao_margem_pct: d.projecao_vendas > 0 ? (d.projecao_lucro / d.projecao_vendas) * 100 : 0,
  }));
}

/** Leitura compartilhada pelos dois blocos do Dashboard; não grava metas. */
export async function buscarMetasDashboard({
  storeId, inicio, fim, departamento, restrito = false, permiteDept = () => true,
}: OpcoesBusca): Promise<ResultadoMetasDashboard> {
  const { data, error } = await supabase.from("store_daily_metrics")
    .select("date, tipo_dia, meta_vendas, meta_lucro, meta_margem_pct, meta_volume, projecao_vendas, projecao_lucro, projecao_margem_pct, projecao_volume, department")
    .eq("store_id", storeId)
    .gte("date", inicio)
    .lte("date", fim)
    .order("date");
  if (error) throw error;

  const alvo = departamento ? canonDept(departamento) : "LOJA";
  const precisaDepartamentos = alvo !== "LOJA" || (restrito && !departamento);
  let linhas = (data ?? []) as LinhaMetaDashboard[];
  let rateada = false;
  let mesesBase = 0;

  if (precisaDepartamentos && !linhas.some((l) => canonDept(l.department) !== "LOJA")) {
    const historico = await participacoesComCache(storeId, Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)));
    const resultado = ratearMetasLoja(linhas, historico.participacoes);
    linhas = resultado.linhas;
    rateada = resultado.rateada;
    mesesBase = historico.mesesBase;
  }

  if (alvo === "LOJA" && !(restrito && !departamento)) {
    linhas = linhas.filter((l) => canonDept(l.department) === "LOJA");
  } else if (alvo !== "LOJA") {
    linhas = linhas.filter((l) => canonDept(l.department) === alvo);
  }

  if (restrito) {
    const permitidas = linhas.filter((l) => permiteDept(String(l.department || "")));
    linhas = permitidas.length ? permitidas : linhas.filter((l) => canonDept(l.department) === "LOJA");
  }

  const agregar = alvo !== "LOJA" || (restrito && !departamento);
  return { linhas: agregar ? agregarPorDia(linhas) : linhas, rateada: rateada && alvo !== "LOJA", mesesBase };
}
