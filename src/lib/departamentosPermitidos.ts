import { supabase } from "@/integrations/supabase/client";

/**
 * Restricao de departamentos por usuario (tabela user_department_access).
 * - Admin global: ve tudo.
 * - Usuario sem nenhuma linha cadastrada: ve tudo.
 * - Usuario com linhas: ve somente esses departamentos.
 *
 * A normalizacao e a mesma logica de canonDept (duplicada aqui para evitar
 * dependencia circular com useVrRealizado).
 */
const norm = (s: string) =>
  (s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function chaveDept(s: string): string {
  const t = norm(s);
  if (!t) return "";
  if (t === "LOJA" || t === "GERAL" || t === "TOTAL") return "LOJA";
  if (t.includes("/")) return chaveDept(t.split("/")[0]);
  if (/^ACOUGUE|CARNE|AVES/.test(t)) return "ACOUGUE";
  if (/^HORTI|FLV/.test(t)) return "HORTIFRUTI";
  if (/^PADARIA|PANIFIC|CONFEITAR/.test(t)) return "PADARIA";
  if (/^MERCEARIA/.test(t)) return "MERCEARIA";
  if (/^BAZAR/.test(t)) return "BAZAR";
  if (/^PERECIVE/.test(t)) return "PERECIVEIS";
  if (/^BEBIDA/.test(t)) return "BEBIDAS";
  if (/^LIMPEZA/.test(t)) return "LIMPEZA";
  if (/^PERFUMARIA|HIGIENE/.test(t)) return "PERFUMARIA";
  if (/^ELETRO/.test(t)) return "ELETRO";
  if (/^FRIOS|LATICIN/.test(t)) return "FRIOS E LATICINIOS";
  return t;
}

/** null = sem restricao (ve todos os departamentos) */
export async function carregarDepartamentosPermitidos(
  userId: string | undefined,
  isGlobalAdmin: boolean,
): Promise<string[] | null> {
  if (!userId || isGlobalAdmin) return null;
  const { data } = await supabase
    .from("user_department_access")
    .select("department")
    .eq("user_id", userId);
  const lista = (data || []).map((d) => chaveDept(String(d.department))).filter(Boolean);
  return lista.length ? Array.from(new Set(lista)) : null;
}

export function permiteDept(permitidos: string[] | null, dep: string | null | undefined) {
  if (!permitidos) return true;
  const k = chaveDept(String(dep ?? ""));
  if (!k) return false;
  return permitidos.includes(k);
}
