// ============================================================
// cacheRelatorio — camada de cache para lojas em modo_sync = 'diario_d1'
//
// Regra: a loja nunca e consultada ao vivo durante o dia.
//  - `fim` acima de ontem e recortado para ontem (D-1); `inicio` > ontem devolve vazio
//  - cache hit (qualquer idade) -> devolve o cache, sem tocar na ponte
//  - cache miss -> consulta a ponte UMA vez, grava e devolve
//  - forcar = true (botao Atualizar) -> consulta a ponte e sobrescreve
// O job sync-diario-d1 renova, as 08:00, tudo que esta no cache.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja, type ConfigLoja, type ResultadoConsulta } from "./consultaLoja.ts";

export interface ConfigLojaCache extends ConfigLoja {
  modo_sync?: string | null;
}

export interface ResultadoCache extends ResultadoConsulta {
  /** origem dos dados: 'cache' | 'ponte' */
  origem?: "cache" | "ponte";
  /** timestamp da gravacao do cache */
  cache_em?: string;
  /** true quando a data final pedida foi recortada para D-1 */
  recortado_d1?: boolean;
}

const FUSO = "America/Sao_Paulo";

export function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

export function ontemBrasilia(): string {
  const hoje = new Date(`${hojeBrasilia()}T12:00:00Z`);
  hoje.setUTCDate(hoje.getUTCDate() - 1);
  return hoje.toISOString().slice(0, 10);
}

function normalizarData(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return s;
}

/** Recorta o periodo para D-1. Retorna null quando o periodo fica vazio. */
export function recortarParaD1(params: Record<string, unknown>): { params: Record<string, unknown>; recortado: boolean; fim: string | null } | null {
  const ontem = ontemBrasilia();
  const p: Record<string, unknown> = { ...params };
  let recortado = false;

  // relatorios de um dia so (param `data`)
  if (p.data !== undefined) {
    const d = normalizarData(p.data);
    if (d && d > ontem) { p.data = ontem; recortado = true; }
    return { params: p, recortado, fim: normalizarData(p.data) };
  }

  const inicio = normalizarData(p.inicio);
  let fim = normalizarData(p.fim);
  if (fim && fim > ontem) { fim = ontem; p.fim = ontem; recortado = true; }
  if (inicio && inicio > ontem) return null;
  return { params: p, recortado, fim };
}

export function chaveParams(params: Record<string, unknown>): string {
  const limpo: Record<string, string> = {};
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === null || v === "") continue;
    if (k === "chave") continue;
    limpo[k] = String(v);
  }
  return JSON.stringify(limpo);
}

export async function consultarComCache(opts: {
  supabaseUrl: string;
  serviceKey: string;
  storeId: string;
  relatorio: string;
  params?: Record<string, unknown>;
  cfg: ConfigLojaCache;
  forcar?: boolean;
  origem?: "proxy" | "job" | "manual";
  timeoutMs?: number;
}): Promise<ResultadoCache> {
  const { supabaseUrl, serviceKey, storeId, relatorio, cfg, forcar = false, origem = "proxy" } = opts;
  const service = createClient(supabaseUrl, serviceKey);

  const rec = recortarParaD1(opts.params ?? {});
  if (!rec) return { ok: true, dados: [], origem: "cache", recortado_d1: true };
  const chave = chaveParams(rec.params);

  if (!forcar) {
    const { data } = await service
      .from("relatorio_cache")
      .select("dados, atualizado_em")
      .eq("store_id", storeId)
      .eq("relatorio", relatorio)
      .eq("params_chave", chave)
      .maybeSingle();
    if (data) {
      return {
        ok: true,
        dados: (data.dados as Record<string, unknown>[]) ?? [],
        origem: "cache",
        cache_em: data.atualizado_em as string,
        recortado_d1: rec.recortado,
      };
    }
  }

  const r = await consultarRelatorioLoja({
    supabaseUrl, serviceKey, storeId, relatorio,
    params: rec.params, cfg, timeoutMs: opts.timeoutMs ?? 120000,
  });
  if (!r.ok) return { ...r, origem: "ponte", recortado_d1: rec.recortado };

  const agora = new Date().toISOString();
  await service.from("relatorio_cache").upsert({
    store_id: storeId,
    relatorio,
    params_chave: chave,
    params: rec.params,
    fim: rec.fim,
    dados: r.dados,
    linhas: r.dados.length,
    origem,
    atualizado_em: agora,
  }, { onConflict: "store_id,relatorio,params_chave" });

  return { ...r, origem: "ponte", cache_em: agora, recortado_d1: rec.recortado };
}
