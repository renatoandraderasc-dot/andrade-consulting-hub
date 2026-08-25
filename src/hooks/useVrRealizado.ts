import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lucroDaLinha } from "@/lib/vrReport";

// ============================================================
// Leitura AO VIVO do realizado do VR (nada e gravado no banco).
// Consulta a edge function vr-proxy com o relatorio
// vendas_secao_periodo e agrega no front por departamento
// usando o mapeamento de vr_secao_departamento.
// Secoes sem mapeamento somam apenas no total da loja (LOJA).
// O filtro por categoria (mercadologico nivel 1) e feito no front,
// sobre as mesmas linhas, sem nova chamada a API.
// Cache leve de 60s por (loja + periodo).
// ============================================================

export const LOJA = "LOJA";

export interface VrDia {
  date: string;
  day: number;
  vendas: number;
  lucro: number;
  volume: number;
  mix: number;
  margemPct: number;
}

export type VrRealizado = Record<string, VrDia[]>;

export interface VrLinha {
  date: string;
  secao: string;
  categoria: string;
  grupo: string;
  vendas: number;
  lucro: number;
  volume: number;
  mix: number;
}

interface RawResult {
  linhas: VrLinha[];
  // Positivacao: produtos distintos vendidos pela 1a vez no dia (mix continuo)
  mixLinhas: VrLinha[];
  mapa: Record<string, string>;
}

interface CacheEntry {
  at: number;
  promise: Promise<RawResult>;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

const norm = (s: string) =>
  (s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Fallback: quando nao existe mapeamento cadastrado para a loja,
// deduz o departamento pelo texto da secao/categoria.
function inferirDepartamento(secao: string, categoria: string): string | null {
  const t = `${norm(categoria)} ${norm(secao)}`;
  if (/\bACOUGUE\b|CARNE|AVES|SUINO|BOVIN|FRIGORIFIC/.test(t)) return "AÇOUGUE";
  if (/HORTIFRUTI|HORTI|FLV|FRUTA|VERDURA|LEGUME/.test(t)) return "HORTIFRUTI";
  if (/PADARIA|PANIFIC|CONFEITAR/.test(t)) return "PADARIA";
  return null;
}

async function loadRaw(storeId: string, inicio: string, fim: string): Promise<RawResult> {
  const [{ data: mapas }, { data: proxy, error }, posv] = await Promise.all([
    supabase.from("vr_secao_departamento").select("secao_vr, department").eq("store_id", storeId),
    supabase.functions.invoke("vr-proxy", {
      body: { store_id: storeId, relatorio: "vendas_secao_periodo", params: { inicio, fim } },
    }),
    // Positivacao de mix: produtos distintos vendidos pela primeira vez no dia.
    // Somados no mes dao a quantidade de produtos diferentes vendidos (mix continuo).
    supabase.functions
      .invoke("vr-proxy", {
        body: { store_id: storeId, relatorio: "mix_positivacao_periodo", params: { inicio, fim } },
      })
      .catch(() => ({ data: null, error: null })),
  ]);

  const mapa: Record<string, string> = {};
  for (const m of mapas ?? []) mapa[norm(m.secao_vr)] = m.department;

  if (error) {
    // Le o corpo do erro para diferenciar "loja sem VR" de falha real
    let corpo: any = null;
    try {
      corpo = await (error as any)?.context?.json?.();
    } catch {
      corpo = null;
    }
    const msg = String(corpo?.erro ?? "");
    if (/sem conexao vr/i.test(msg)) return { linhas: [], mixLinhas: [], mapa };
    throw new Error(msg || error.message);
  }
  if (!proxy || (proxy as any).erro) {
    const msg = String((proxy as any)?.erro ?? "");
    if (/sem conexao vr/i.test(msg)) return { linhas: [], mixLinhas: [], mapa };
    throw new Error(msg || "Sem resposta do VR");
  }

  const brutas: any[] = Array.isArray((proxy as any).dados) ? (proxy as any).dados : [];

  // Os conectores retornam as colunas em caixa alta (ORACLE/VR) ou baixa (WebSac).
  const pick = (o: any, ...keys: string[]) => {
    for (const k of keys) {
      if (o[k] !== undefined && o[k] !== null) return o[k];
      const up = k.toUpperCase();
      if (o[up] !== undefined && o[up] !== null) return o[up];
      const lo = k.toLowerCase();
      if (o[lo] !== undefined && o[lo] !== null) return o[lo];
    }
    return undefined;
  };
  const numOf = (v: unknown) => parseFloat(String(v ?? "")) || 0;

  const linhas: VrLinha[] = [];
  for (const l of brutas) {
    const date = String(pick(l, "data", "dia") ?? "").slice(0, 10);
    if (!date) continue;
    linhas.push({
      date,
      secao: String(pick(l, "secao", "departamento") ?? ""),
      categoria: String(pick(l, "categoria", "secao") ?? "").trim(),
      grupo: String(pick(l, "grupo") ?? ""),
      vendas: numOf(pick(l, "total_vendido", "venda", "vendas")),
      // Margem = (Venda - Custo com imposto) / Venda.
      lucro: lucroDaLinha(l, numOf(pick(l, "total_vendido", "venda", "vendas"))),
      volume: numOf(pick(l, "volume", "qtde", "quantidade")),
      mix: numOf(pick(l, "mix")),
    });
  }

  const mixBrutas: any[] = Array.isArray((posv as any)?.data?.dados) ? (posv as any).data.dados : [];
  const mixLinhas: VrLinha[] = [];
  for (const l of mixBrutas) {
    // Alguns conectores retornam o mix agregado do periodo (sem data).
    const date = String(pick(l, "data", "dia") ?? "").slice(0, 10) || inicio;
    mixLinhas.push({
      date,
      secao: String(pick(l, "secao", "departamento", "categoria") ?? ""),
      categoria: String(pick(l, "categoria", "departamento") ?? "").trim(),
      grupo: "",
      vendas: 0,
      lucro: 0,
      volume: 0,
      mix: numOf(pick(l, "mix")),
    });
  }


  return { linhas, mixLinhas, mapa };
}

function agregar(raw: RawResult, categoria?: string | null): VrRealizado {
  const acc = new Map<string, { date: string; vendas: number; lucro: number; volume: number; mix: number }>();
  const add = (dep: string, date: string, vendas: number, lucro: number, volume: number, mix: number) => {
    const k = `${dep}|${date}`;
    const cur = acc.get(k) ?? { date, vendas: 0, lucro: 0, volume: 0, mix: 0 };
    cur.vendas += vendas;
    cur.lucro += lucro;
    cur.volume += volume;
    cur.mix += mix;
    acc.set(k, cur);
  };

  // Quando ha positivacao real, o mix das linhas de venda (distintos por dia)
  // e ignorado para nao contar o mesmo produto varias vezes no mes.
  const temPositivacao = raw.mixLinhas.length > 0;

  for (const l of raw.linhas) {
    if (categoria && l.categoria !== categoria) continue;
    const dep = raw.mapa[norm(l.secao)] ?? inferirDepartamento(l.secao, l.categoria);
    const mix = temPositivacao ? 0 : l.mix;
    add(LOJA, l.date, l.vendas, l.lucro, l.volume, mix);
    if (dep && dep !== LOJA) add(dep, l.date, l.vendas, l.lucro, l.volume, mix);
  }

  for (const l of raw.mixLinhas) {
    if (categoria && l.categoria !== categoria) continue;
    const dep = raw.mapa[norm(l.secao)] ?? inferirDepartamento(l.secao, l.categoria);
    add(LOJA, l.date, 0, 0, 0, l.mix);
    if (dep && dep !== LOJA) add(dep, l.date, 0, 0, 0, l.mix);
  }



  const out: VrRealizado = {};
  for (const [k, v] of acc) {
    const dep = k.split("|")[0];
    (out[dep] ||= []).push({
      date: v.date,
      day: Number(v.date.slice(8, 10)),
      vendas: v.vendas,
      lucro: v.lucro,
      volume: v.volume,
      mix: v.mix,
      margemPct: v.vendas > 0 ? (v.lucro / v.vendas) * 100 : 0,
    });
  }
  for (const dep of Object.keys(out)) out[dep].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export function useVrRealizado(
  storeId: string,
  inicio: string,
  fim: string,
  categoria?: string | null,
) {
  const [raw, setRaw] = useState<RawResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const reqRef = useRef(0);

  const run = useCallback(
    async (force: boolean) => {
      if (!storeId || !inicio || !fim) return;
      const key = `${storeId}|${inicio}|${fim}`;
      const cached = cache.get(key);
      const fresh = cached && Date.now() - cached.at < TTL_MS && !force;
      const entry: CacheEntry = fresh
        ? cached!
        : { at: Date.now(), promise: loadRaw(storeId, inicio, fim) };
      cache.set(key, entry);

      const id = ++reqRef.current;
      setLoading(true);
      try {
        const result = await entry.promise;
        if (id !== reqRef.current) return;
        setRaw(result);
        setOffline(false);
        setErrorMsg(null);
        setUpdatedAt(new Date(entry.at));
      } catch (e) {
        cache.delete(key);
        if (id !== reqRef.current) return;
        setRaw(null);
        setOffline(true);
        setErrorMsg(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    },
    [storeId, inicio, fim],
  );

  useEffect(() => {
    run(false);
  }, [run]);

  const refresh = useCallback(() => run(true), [run]);

  const data = useMemo(() => (raw ? agregar(raw, categoria) : null), [raw, categoria]);

  // Categorias do proprio resultado, ordenadas por faturamento decrescente
  const categorias = useMemo(() => {
    if (!raw) return [] as { name: string; total: number }[];
    const m = new Map<string, number>();
    for (const l of raw.linhas) {
      if (!l.categoria) continue;
      m.set(l.categoria, (m.get(l.categoria) ?? 0) + l.vendas);
    }
    return [...m.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [raw]);

  return { data, categorias, loading, offline, errorMsg, updatedAt, refresh };
}

export function VrOfflineMessage(): string {
  return "Sem conexão com o VR";
}
