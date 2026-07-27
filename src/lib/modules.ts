export const APP_MODULES = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard" },
  { key: "controladoria", label: "Controladoria", path: "/controladoria" },
  { key: "compras", label: "Compras", path: "/compras" },
  { key: "pic", label: "PIC", path: "/pic" },
  { key: "pic_padaria", label: "Dashboard Padaria", path: "/pic/padaria" },
  { key: "admin_padaria_import", label: "Admin: Import Padaria", path: "/admin/padaria-import" },
  { key: "repricing", label: "Re-PRICING", path: "/repricing" },
  { key: "checklist", label: "Checklist", path: "/checklist" },
  { key: "admin_stores", label: "Admin: Lojas", path: "/admin/stores" },
  { key: "admin_metas", label: "Admin: Metas", path: "/admin/metas" },
  { key: "metas_gerador", label: "Gerador de Metas", path: "/metas-gerador" },
  { key: "admin_questions", label: "Admin: Perguntas", path: "/admin/questions" },
  { key: "admin_users", label: "Admin: Usuários", path: "/admin/users" },
  { key: "vtex_collector", label: "Coletor VTEX", path: "/vtex-collector" },
  { key: "websac_sync", label: "Sync WebSac", path: "/websac-sync" },
  { key: "produtos", label: "Produtos", path: "/produtos" },
  { key: "encartes", label: "Meus Encartes", path: "/encartes" },
  { key: "encarte_editor", label: "Editor de Encarte", path: "/encartes/editor" },
] as const;

export type ModuleKey = typeof APP_MODULES[number]["key"];
