/** Telas que podem ser enviadas como print pelo WhatsApp. */
export interface RelatorioWhatsapp { id: string; nome: string; rota: string; aba?: string; personalizado?: boolean }

export const RELATORIOS_WHATSAPP: RelatorioWhatsapp[] = [
  { id: "pic", nome: "PIC", rota: "/pic" },
  { id: "compras_vendas", nome: "Compras × Vendas", rota: "/compras", aba: "Compras × Vendas" },
  { id: "dashboard", nome: "Dashboard", rota: "/dashboard" },
  { id: "produtos_sem_venda", nome: "Produtos sem venda no mês", rota: "/produtos-sem-venda" },
  { id: "margem_baixa", nome: "Margem baixa", rota: "/margem-baixa" },
];

/** Páginas do sistema que podem virar um print personalizado. */
export const PAGINAS_SISTEMA: { rota: string; nome: string }[] = [
  { rota: "/admin/conexoes", nome: "Conexões" },
  { rota: "/admin/diagnostico", nome: "Diagnóstico do Sistema" },
  { rota: "/admin/escala", nome: "Regras e Turnos" },
  { rota: "/admin/jornada", nome: "Admin da Jornada" },
  { rota: "/admin/metas", nome: "Metas" },
  { rota: "/admin/parametrizacoes", nome: "Parametrizações Gerais" },
  { rota: "/admin/pic-departamentos", nome: "Parametrizações Pic" },
  { rota: "/admin/questions", nome: "Perguntas" },
  { rota: "/admin/rede", nome: "Visão da Rede" },
  { rota: "/admin/site", nome: "Página Inicial" },
  { rota: "/admin/sites-concorrentes", nome: "Catálogo de Sites" },
  { rota: "/admin/stores", nome: "Lojas" },
  { rota: "/admin/tv", nome: "Gerenciador de TV" },
  { rota: "/admin/users", nome: "Usuários" },
  { rota: "/admin/whatsapp", nome: "Mensagens WhatsApp" },
  { rota: "/analise-anual", nome: "Análise Anual" },
  { rota: "/calendario-promocional", nome: "Calendário Promocional" },
  { rota: "/capilaridade-mix", nome: "Capilaridade de Mix" },
  { rota: "/catalogo", nome: "Catálogo" },
  { rota: "/checklist", nome: "Checklist" },
  { rota: "/checklist-temperatura", nome: "Temperaturas" },
  { rota: "/comparativo-produtos", nome: "Comparativo por Produto" },
  { rota: "/compras", nome: "Compras" },
  { rota: "/compras/analise", nome: "Análise de Compras" },
  { rota: "/consulta-preco", nome: "Consulta de Preços" },
  { rota: "/controladoria", nome: "Controladoria" },
  { rota: "/dashboard", nome: "Dashboard" },
  { rota: "/dashboard-financeiro", nome: "Dashboard" },
  { rota: "/encarte-sugestao", nome: "Sugestão de Encarte" },
  { rota: "/encartes", nome: "Meus Encartes" },
  { rota: "/escala", nome: "Escala do Mês" },
  { rota: "/escala/dimensionamento", nome: "Dimensionamento" },
  { rota: "/escala/funcionarios", nome: "Funcionários" },
  { rota: "/estoque-dinamico", nome: "Estoque Dinâmico" },
  { rota: "/jornada", nome: "Minha Jornada" },
  { rota: "/jornada/execucoes", nome: "Execuções" },
  { rota: "/margem-baixa", nome: "Margem Baixa" },
  { rota: "/metas/cadastradas", nome: "Metas Cadastradas" },
  { rota: "/metas/compradores/config", nome: "Metas Compradores" },
  { rota: "/metas/premiacao", nome: "Pagamento de Metas" },
  { rota: "/metas/premiacao/compradores", nome: "Pagamento Compradores" },
  { rota: "/metas/premiacao/config", nome: "Parametrização Pagamento" },
  { rota: "/metas/realizado", nome: "Metas vs Realizado" },
  { rota: "/metas/sugestao", nome: "Sugestão Analítica" },
  { rota: "/painel-analitico", nome: "Painel Analítico" },
  { rota: "/painel-comparativo", nome: "Comparativo" },
  { rota: "/pic", nome: "PIC" },
  { rota: "/precificacao/pricing", nome: "Pricing" },
  { rota: "/produtos-sem-venda", nome: "Produtos sem venda" },
  { rota: "/recebimento", nome: "Recebimento de NF-e" },
  { rota: "/relatorios", nome: "Relatórios" },
  { rota: "/repricing", nome: "Re-Pricing" },
  { rota: "/vtex-collector", nome: "Coletor de Preços" },
  { rota: "/websac-sync", nome: "Sync WebSac" },
];

/** Junta as telas fixas com os prints personalizados salvos (linhas com rota). */
export function catalogoPrints(cfgs: any[] | null | undefined): RelatorioWhatsapp[] {
  const extras = (cfgs || []).filter((c) => c.rota).map((c) => ({ id: c.relatorio_id, nome: c.nome || c.rota, rota: c.rota, aba: c.aba || undefined, personalizado: true }));
  return [...RELATORIOS_WHATSAPP, ...extras];
}

export const nomeRelatorio = (id: string, lista: RelatorioWhatsapp[] = RELATORIOS_WHATSAPP) => lista.find((r) => r.id === id)?.nome ?? id;
