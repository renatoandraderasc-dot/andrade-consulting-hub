/** Telas que podem ser enviadas como print pelo WhatsApp. */
export interface RelatorioWhatsapp { id: string; nome: string; rota: string; aba?: string }

export const RELATORIOS_WHATSAPP: RelatorioWhatsapp[] = [
  { id: "pic", nome: "PIC", rota: "/pic" },
  { id: "compras_vendas", nome: "Compras × Vendas", rota: "/compras", aba: "Compras × Vendas" },
  { id: "dashboard", nome: "Dashboard", rota: "/dashboard" },
  { id: "produtos_sem_venda", nome: "Produtos sem venda no mês", rota: "/produtos-sem-venda" },
  { id: "margem_baixa", nome: "Margem baixa", rota: "/margem-baixa" },
];

export const nomeRelatorio = (id: string) => RELATORIOS_WHATSAPP.find((r) => r.id === id)?.nome ?? id;
