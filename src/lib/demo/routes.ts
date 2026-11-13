export type DemoDomain = "dashboard" | "finance" | "commercial" | "marketing" | "workforce" | "operations" | "admin";
export function demoDomain(path: string): DemoDomain {
  if (/^\/(escala|jornada)|^\/admin\/(escala|jornada)/.test(path)) return "workforce";
  if (/^\/(checklist|recebimento)|^\/admin\/(questions|recebimento)/.test(path)) return "operations";
  if (/^\/(encarte|calendario-promocional|tv)|^\/admin\/tv/.test(path)) return "marketing";
  if (/^\/(controladoria|dashboard-financeiro)/.test(path)) return "finance";
  if (/^\/(compras|estoque|margem-baixa|repricing|precificacao|catalogo|consulta-preco|produtos|vtex)/.test(path)) return "commercial";
  if (/^\/admin\/(users|stores|rede|conexoes|diagnostico|site|sites|parametrizacoes|padaria)|^\/websac/.test(path)) return "admin";
  return "dashboard";
}
export const DEMO_EXTRA_ROUTES: Record<string, string> = {
  "/metas/sugestao": "Sugestão Analítica", "/metas/premiacao": "Pagamento de Metas", "/metas/premiacao/config": "Parametrização de Pagamento", "/metas/premiacao/compradores": "Pagamento dos Compradores", "/metas/compradores/config": "Metas dos Compradores", "/metas/realizado": "Metas vs. Realizado", "/pic/tv": "PIC TV", "/pic/tv-canal": "PIC TV · Canal", "/recebimento/painel": "Painel de Recebimento", "/admin/recebimento": "Parâmetros de Recebimento", "/admin/sites-concorrentes": "Sites Concorrentes",
};