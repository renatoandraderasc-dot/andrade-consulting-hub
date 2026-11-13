import { supabase } from "@/integrations/supabase/client";
import { RELATORIOS_DIARIOS, diasEntre, juntarDias } from "../../supabase/functions/_shared/hubDados";
export { RELATORIOS_DIARIOS, diasEntre, agregarDias } from "../../supabase/functions/_shared/hubDados";

// ============================================================
// Hub diario: relatorios pesados guardados DIA A DIA no banco
// (o sync-diario-d1 grava o dia de ontem toda manha). Um periodo
// passado com todos os dias guardados e montado aqui, sem consultar
// a maquina do cliente.
// ============================================================

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
  return { dados: juntarDias(relatorio, linhas), atualizadoEm };
}
