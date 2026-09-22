import { supabase } from "@/integrations/supabase/client";

/**
 * Departamentos disponiveis para uma loja.
 * Une o que esta mapeado no sistema da loja (vr_secao_departamento) com o que
 * ja existe nas metas (store_daily_metrics) e com os departamentos padrao.
 */
export const DEPARTAMENTOS_PADRAO = ["PADARIA", "AÇOUGUE", "HORTIFRUTI"];

const semAcento = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

/** Mantem o rotulo com acento quando for um dos padroes conhecidos */
const rotulo = (s: string) => {
  const n = semAcento(s);
  const padrao = DEPARTAMENTOS_PADRAO.find((d) => semAcento(d) === n);
  return padrao ?? s.toUpperCase().trim();
};

export async function carregarDepartamentosLoja(storeId: string): Promise<string[]> {
  if (!storeId) return [...DEPARTAMENTOS_PADRAO];
  const [{ data: mapas }, { data: metas }, { data: compras }, { data: historico }] = await Promise.all([
    supabase.from("vr_secao_departamento").select("department").eq("store_id", storeId),
    supabase.from("store_daily_metrics").select("department").eq("store_id", storeId).limit(5000),
    supabase.from("compras_departamento").select("departamento").eq("store_id", storeId).eq("ativo", true),
    supabase.from("compras_historico").select("departamento").eq("store_id", storeId).limit(5000),
  ]);

  const vistos = new Map<string, string>();
  const add = (d: string | null | undefined) => {
    const nome = rotulo(String(d ?? ""));
    const chave = semAcento(nome);
    if (!chave || chave === "LOJA" || chave === "TOTAL" || chave === "GERAL") return;
    if (!vistos.has(chave)) vistos.set(chave, nome);
  };

  for (const d of DEPARTAMENTOS_PADRAO) add(d);
  for (const m of mapas ?? []) add(m.department as string);
  for (const m of metas ?? []) add(m.department as string);
  for (const m of compras ?? []) add(m.departamento as string);
  for (const m of historico ?? []) add(m.departamento as string);

  const lista = [...vistos.values()];
  const padrao = lista.filter((d) => DEPARTAMENTOS_PADRAO.includes(d));
  const extras = lista
    .filter((d) => !DEPARTAMENTOS_PADRAO.includes(d))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...padrao, ...extras];
}
