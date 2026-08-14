export const APP_MODULES = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard" },
  { key: "controladoria", label: "Controladoria", path: "/controladoria" },
  { key: "analise_anual", label: "Análise Anual", path: "/analise-anual" },
  { key: "compras", label: "Compras", path: "/compras" },
  { key: "pic", label: "PIC", path: "/pic" },
  { key: "pic_percentual", label: "PIC: somente % (visualizador)", path: "/pic" },
  { key: "pic_padaria", label: "Dashboard Padaria", path: "/pic/padaria" },
  { key: "admin_padaria_import", label: "Admin: Import Padaria", path: "/admin/padaria-import" },
  { key: "repricing", label: "Re-PRICING", path: "/repricing" },
  { key: "checklist", label: "Checklist", path: "/checklist" },
  { key: "catalogo", label: "Catálogo de Produtos", path: "/catalogo" },
  { key: "consulta_preco", label: "Consulta de Preços", path: "/consulta-preco" },
  { key: "admin_stores", label: "Admin: Lojas", path: "/admin/stores" },
  { key: "admin_pic_departamentos", label: "Admin: Departamentos do PIC", path: "/admin/pic-departamentos" },
  { key: "admin_metas", label: "Admin: Metas", path: "/admin/metas" },
  { key: "metas_gerador", label: "Gerador de Metas", path: "/metas-gerador" },
  { key: "admin_questions", label: "Admin: Perguntas", path: "/admin/questions" },
  { key: "admin_users", label: "Admin: Usuários", path: "/admin/users" },
  { key: "admin_conexoes", label: "Admin: Gestão de Conexão", path: "/admin/conexoes" },
  { key: "admin_site", label: "Admin: Página Inicial", path: "/admin/site" },
  { key: "vtex_collector", label: "Coletor VTEX", path: "/vtex-collector" },
  { key: "websac_sync", label: "Sync WebSac", path: "/websac-sync" },
  { key: "produtos", label: "Produtos", path: "/produtos" },
  { key: "encartes", label: "Meus Encartes", path: "/encartes" },
  { key: "encarte_editor", label: "Editor de Encarte", path: "/encartes/editor" },
] as const;

export type ModuleKey = typeof APP_MODULES[number]["key"];

import { supabase } from "@/integrations/supabase/client";

// Returns the set of allowed modules, or null when the user has no restrictions.
export async function getAllowedModules(userId: string): Promise<Set<string> | null> {
  const { data } = await supabase
    .from("user_module_access")
    .select("module, allowed")
    .eq("user_id", userId);

  const rows = data || [];
  if (rows.length === 0) return null;
  return new Set(rows.filter((r) => r.allowed).map((r) => r.module));
}

// Distinct routes the user can reach.
export function allowedPaths(allowed: Set<string>): string[] {
  return Array.from(new Set(APP_MODULES.filter((m) => allowed.has(m.key)).map((m) => m.path)));
}

// Returns the first module the user is allowed to see, following APP_MODULES order.
// Falls back to /dashboard when the user has no explicit restrictions.
export async function getLandingPath(userId: string): Promise<string> {
  const allowed = await getAllowedModules(userId);
  if (allowed === null || allowed.size === 0) return "/dashboard";
  const paths = allowedPaths(allowed);
  return paths[0] ?? "/dashboard";
}


