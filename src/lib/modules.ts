export const APP_MODULES = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard" },
  { key: "controladoria", label: "Controladoria", path: "/controladoria" },
  { key: "pic", label: "PIC", path: "/pic" },
  { key: "repricing", label: "Re-PRICING", path: "/repricing" },
  { key: "checklist", label: "Checklist", path: "/checklist" },
  { key: "admin_stores", label: "Admin: Lojas", path: "/admin/stores" },
  { key: "admin_metas", label: "Admin: Metas", path: "/admin/metas" },
  { key: "admin_questions", label: "Admin: Perguntas", path: "/admin/questions" },
  { key: "admin_users", label: "Admin: Usuários", path: "/admin/users" },
  { key: "vtex_collector", label: "Coletor VTEX", path: "/vtex-collector" },
  { key: "websac_sync", label: "Sync WebSac", path: "/websac-sync" },
] as const;

export type ModuleKey = typeof APP_MODULES[number]["key"];
