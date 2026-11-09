import { supabase } from "@/integrations/supabase/client";

// ============================================================
// Hub diario: relatorios pesados guardados DIA A DIA no banco
// (o sync-diario-d1 grava o dia de ontem toda manha). Um periodo
// passado com todos os dias guardados e montado aqui, sem consultar
// a maquina do cliente.
// ============================================================

export const RELATORIOS_DIARIOS = ["ranking_produtos", "compras_vendas_periodo"] as const;

// Colunas que identificam a linha (nunca somadas)
const IDENT = /^(codigo|barras|ean|cod_.*|id_.*|data|mes|loja)$/i;
// Colunas numericas que nao se somam entre dias
const NAO_SOMA = /(_pct|percent|preco|mix|^margem)/i;

export function agregarDias(dias: any[][]): any[] {
  const mapa = new Map<string, any>();
  for (const linhas of dias) {
    for (const l of linhas || []) {
      if (!l || typeof l !== "object") continue;
      const ident: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(l)) {
        if (IDENT.test(k) || typeof v !== "number") ident[k] = v;
      }
      const chave = JSON.stringify(Object.keys(ident).sort().map((k) => [k, ident[k]]));
      const acc = mapa.get(chave);
      if (!acc) { mapa.set(chave, { ...l }); continue; }
      for (const [k, v] of Object.entries(l)) {
        if (typeof v === "number" && !IDENT.test(k) && !NAO_SOMA.test(k)) acc[k] = (Number(acc[k]) || 0) + v;
      }
    }
  }
  const out = [...mapa.values()];
  for (const o of out) {
    const venda = Number(o.vendas ?? o.total_venda ?? o.faturamento);
    const lucro = Number(o.lucro);
    if ("margem_pct" in o && venda) o.margem_pct = Math.round((lucro / venda) * 10000) / 100;
  }
  return out;
}

export function diasEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  const d = new Date(`${inicio}T12:00:00Z`);
  const f = new Date(`${fim}T12:00:00Z`);
  while (d <= f && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

function ontemIso() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monta o periodo a partir dos dias guardados; null se faltar algum dia. */
export async function montarDoHub(storeId: string, relatorio: string, params: Record<string, unknown>) {
  if (!(RELATORIOS_DIARIOS as readonly string[]).includes(relatorio)) return null;
  const inicio = String(params.inicio ?? ""), fim = String(params.fim ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || fim > ontemIso()) return null;
  const extras = Object.keys(params).filter((k) => !["inicio", "fim", "limite"].includes(k));
  if (extras.length) return null;
  const dias = diasEntre(inicio, fim);
  if (dias.length < 2) return null;
  const chaves = dias.map((d) => JSON.stringify({ fim: d, inicio: d }));
  const { data, error } = await supabase.from("relatorio_cache")
    .select("params_chave, dados, atualizado_em")
    .eq("store_id", storeId).eq("relatorio", relatorio).in("params_chave", chaves);
  if (error || !data || data.length < dias.length) return null;
  const linhas = (data as any[]).map((r) => (Array.isArray(r.dados) ? r.dados : []));
  const atualizadoEm = (data as any[]).map((r) => r.atualizado_em).sort().pop() ?? null;
  return { dados: agregarDias(linhas), atualizadoEm };
}
