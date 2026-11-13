import { gerarEscala, type Alocacao } from "@/lib/escala/escala-motor";

export const DEMO_STORE = "Supermercado Aurora";
export const DEMO_YEAR = 2026;
export const DEMO_DEFAULT_MONTH = 10;
export const DEPARTMENTS = ["Mercearia", "Açougue", "Hortifruti", "Padaria", "Frios e Laticínios", "Bebidas", "Limpeza", "Perfumaria"];
export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export type DemoProduct = { id: string; name: string; department: string; unit: string; cost: number; price: number; club: number; competitor: number; stock: number; purchased: number; salesQty: number; lastEntry: string; description2: string; notes: string };
export type DemoEntry = { id: string; date: string; name: string; account: string; value: number; status: string };
export type DemoEmployee = { id: string; name: string; department: string; start: string; end: string; interval: number; active: boolean };
export type DemoTask = { id: string; title: string; department: string; owner: string; status: string; date: string };
export type DemoReceipt = { id: string; supplier: string; number: string; date: string; value: number; status: string; counted: number };
export type DemoCampaign = { id: string; title: string; date: string; end: string; status: string };
export type DemoEquipment = { id: string; name: string; department: string; temperature: number; minimum: number; maximum: number; date: string };
export type DemoUser = { id: string; name: string; email: string; role: string; status: string };
export type DemoState = {
  version: 1; products: DemoProduct[]; entries: DemoEntry[]; employees: DemoEmployee[];
  tasks: DemoTask[]; receipts: DemoReceipt[]; campaigns: DemoCampaign[]; equipment: DemoEquipment[];
  users: DemoUser[]; goals: Record<string, number>; checklist: Record<string, boolean>;
  allocations: Alocacao[]; scheduleStatus: "rascunho" | "publicada";
  flyer: string[]; flyerTitle: string; tvTitles: string[]; syncAt: string;
};
const PRODUCT_SEEDS: [string, string, string, number, number][] = [
  ["Arroz Aurora Tipo 1 5 kg", "Mercearia", "UN", 18.4, 25.9], ["Feijão Carioca 1 kg", "Mercearia", "UN", 5.7, 8.99],
  ["Açúcar Refinado 1 kg", "Mercearia", "UN", 2.65, 3.89], ["Óleo de Soja 900 ml", "Mercearia", "UN", 5.4, 7.99],
  ["Café Tradicional 500 g", "Mercearia", "UN", 12.5, 17.99], ["Macarrão Espaguete 500 g", "Mercearia", "UN", 2.6, 3.99],
  ["Alcatra Bovina", "Açougue", "KG", 29.8, 42.9], ["Patinho Bovino", "Açougue", "KG", 27.5, 39.9],
  ["Acém Bovino", "Açougue", "KG", 19.8, 29.9], ["Peito de Frango", "Açougue", "KG", 10.9, 16.9],
  ["Pernil Suíno", "Açougue", "KG", 12.4, 18.9], ["Costela Suína", "Açougue", "KG", 16.8, 24.9],
  ["Banana Prata", "Hortifruti", "KG", 3.4, 5.99], ["Tomate Italiano", "Hortifruti", "KG", 3.8, 6.99],
  ["Batata Lavada", "Hortifruti", "KG", 2.8, 4.99], ["Maçã Gala", "Hortifruti", "KG", 5.1, 8.99],
  ["Pão Francês", "Padaria", "KG", 6.3, 12.99], ["Bolo de Cenoura", "Padaria", "UN", 9.4, 18.9],
  ["Pão de Queijo", "Padaria", "KG", 15.9, 29.9], ["Rosca Doce", "Padaria", "UN", 4.8, 9.99],
  ["Leite Integral 1 L", "Frios e Laticínios", "UN", 3.35, 4.99], ["Queijo Mussarela", "Frios e Laticínios", "KG", 25.9, 39.9],
  ["Iogurte Natural 170 g", "Frios e Laticínios", "UN", 1.85, 2.99], ["Manteiga 200 g", "Frios e Laticínios", "UN", 5.3, 7.99],
  ["Refrigerante 2 L", "Bebidas", "UN", 5.7, 8.99], ["Suco de Uva 1 L", "Bebidas", "UN", 7.1, 10.99],
  ["Água Mineral 1,5 L", "Bebidas", "UN", 1.1, 2.49], ["Cerveja Pilsen 350 ml", "Bebidas", "UN", 2.2, 3.49],
  ["Sabão em Pó 800 g", "Limpeza", "UN", 6.5, 9.99], ["Detergente 500 ml", "Limpeza", "UN", 1.35, 2.19],
  ["Água Sanitária 1 L", "Limpeza", "UN", 1.85, 2.99], ["Amaciante 2 L", "Limpeza", "UN", 5.3, 8.49],
  ["Sabonete 85 g", "Perfumaria", "UN", 1.4, 2.49], ["Shampoo 350 ml", "Perfumaria", "UN", 8.6, 13.99],
  ["Creme Dental 90 g", "Perfumaria", "UN", 2.3, 3.99], ["Papel Higiênico 12 rolos", "Perfumaria", "UN", 10.8, 16.99],
];
export const cents = (value: number) => Math.round(value * 100) / 100;
export const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const number = (value: number, digits = 0) => value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const margin = (price: number, cost: number) => price > 0 ? (price - cost) / price * 100 : 0;
export const uid = () => crypto.randomUUID();
export function createDemoState(): DemoState {
  const names = ["Ana Costa", "Bruno Lima", "Camila Alves", "Diego Santos", "Elisa Rocha", "Felipe Dias", "Gabriela Melo", "Henrique Silva", "Isabela Pinto", "João Martins", "Larissa Souza", "Marcos Oliveira", "Nádia Ribeiro", "Otávio Pereira", "Paula Gomes", "Rafael Mendes"];
  const products = PRODUCT_SEEDS.map(([name, department, unit, cost, price], i) => ({ id: String(10001 + i), name, department, unit, cost, price, club: cents(price * 0.95), competitor: cents(price * (1.02 + (i % 4) * 0.01)), stock: 80 + i * 13, purchased: 150 + i * 19, salesQty: 900 + i * 97, lastEntry: "2026-10-" + String(2 + i % 24).padStart(2, "0"), description2: "", notes: "" }));
  const state: DemoState = {
    version: 1, products,
    entries: [
      { id: "e1", date: "2026-10-05", name: "Distribuidora Horizonte", account: "Pagamento de Fornecedores", value: 58420.35, status: "Pago" },
      { id: "e2", date: "2026-10-07", name: "Folha de pagamento", account: "Salário Líquido", value: 86120.9, status: "Pago" },
      { id: "e3", date: "2026-10-10", name: "DARF PIS", account: "PIS", value: 7382.4, status: "Pago" },
      { id: "e4", date: "2026-10-10", name: "DARF COFINS", account: "COFINS", value: 34072.6, status: "Pago" },
      { id: "e5", date: "2026-10-15", name: "Energia elétrica", account: "Energia Elétrica", value: 18340.25, status: "Pago" },
      { id: "e6", date: "2026-10-20", name: "Aluguel da loja", account: "Aluguel", value: 15000, status: "Pago" },
      { id: "e7", date: "2026-10-22", name: "Frigorífico Campos", account: "Pagamento de Fornecedores", value: 41280.6, status: "Pendente" },
      { id: "e8", date: "2026-10-25", name: "Serviços de manutenção", account: "Manutenção", value: 2800.5, status: "Pendente" },
      { id: "e9", date: "2026-10-28", name: "Marketing e divulgação", account: "Marketing", value: 3450, status: "Pendente" },
    ],
    employees: names.map((name, i) => ({ id: `f${i + 1}`, name, department: DEPARTMENTS[i % 8], start: i % 2 ? "12:00" : "06:00", end: i % 2 ? "20:00" : "14:00", interval: 60, active: true })),
    tasks: ["Conferir abertura do setor", "Revisar validade dos produtos", "Repor gôndolas", "Conferir preços e etiquetas", "Higienizar bancadas", "Conferir estoque", "Fechar caixa", "Revisar indicadores do dia"].map((title, i) => ({ id: `t${i}`, title, department: DEPARTMENTS[i], owner: names[i], status: i < 4 ? "Concluída" : i < 6 ? "Em andamento" : "A fazer", date: "2026-10-30" })),
    receipts: [{ id: "nf1", supplier: "Distribuidora Horizonte", number: "000012845", date: "2026-10-30", value: 5840.35, status: "A conferir", counted: 0 }, { id: "nf2", supplier: "Frigorífico Campos", number: "000008621", date: "2026-10-29", value: 9280.6, status: "Conferido", counted: 150 }, { id: "nf3", supplier: "Horti Vale", number: "000004032", date: "2026-10-28", value: 2180.4, status: "Divergência", counted: 145 }],
    campaigns: [{ id: "c1", title: "Festival de economia", date: "2026-10-01", end: "2026-10-07", status: "Concluída" }, { id: "c2", title: "Semana do açougue", date: "2026-10-12", end: "2026-10-18", status: "Concluída" }, { id: "c3", title: "Ofertas do fim de semana", date: "2026-10-30", end: "2026-11-01", status: "Publicada" }],
    equipment: [{ id: "q1", name: "Câmara de carnes", department: "Açougue", temperature: 2.8, minimum: 0, maximum: 4, date: "2026-10-30" }, { id: "q2", name: "Balcão de laticínios", department: "Frios e Laticínios", temperature: 4.1, minimum: 0, maximum: 8, date: "2026-10-30" }, { id: "q3", name: "Freezer de congelados", department: "Mercearia", temperature: -18.5, minimum: -25, maximum: -15, date: "2026-10-30" }],
    users: [{ id: "u1", name: "Gestor Aurora", email: "gestor@aurora.example", role: "Administrador", status: "Ativo" }, { id: "u2", name: "Comprador Aurora", email: "compras@aurora.example", role: "Supervisor", status: "Ativo" }, { id: "u3", name: "Operador Aurora", email: "operacao@aurora.example", role: "Usuário", status: "Ativo" }],
    goals: Object.fromEntries(DEPARTMENTS.map((d, i) => [d, [540000, 450000, 240000, 190000, 230000, 220000, 150000, 80000][i]])),
    checklist: Object.fromEntries(DEPARTMENTS.flatMap(d => Array.from({ length: 4 }, (_, i) => [`${d}:${i}`, true]))), allocations: [], scheduleStatus: "rascunho", flyer: products.slice(0, 12).map(p => p.id), flyerTitle: "Festival de economia", tvTitles: ["Bovinos", "Suínos", "Aves"], syncAt: "2026-10-31T22:00:00.000Z",
  };
  // Populate every month before the first visit, using the supplied unchanged scheduling engine.
  for (let month = 1; month <= 12; month++) {
    const result = gerarEscala({ ano: DEMO_YEAR, mes: month, funcionarios: state.employees.map(e => ({ id: e.id, nome: e.name, departamento: e.department, ativo: true, turno_padrao_id: `turn-${e.id}`, carga_semanal_contratual: 42 })), turnos: state.employees.map(e => ({ id: `turn-${e.id}`, codigo: `${e.start} - ${e.end}`, inicio: e.start, fim: e.end, intervalo_min: e.interval })), config: { regime: "5x2", intervalo_min_minutos: 60 }, marcos: [{ vigencia_inicio: "1900-01-01", horas_semanais: 42, folgas_semanais: 2, rotulo: "Parâmetros ilustrativos Aurora" }] });
    state.allocations.push(...result.alocacoes);
  }
  const baseEntries = [...state.entries], baseReceipts = [...state.receipts], baseCampaigns = [...state.campaigns];
  const shift = (date: string, month: number) => `${DEMO_YEAR}-${String(month).padStart(2, "0")}-${String(Math.min(Number(date.slice(-2)), new Date(DEMO_YEAR, month, 0).getDate())).padStart(2, "0")}`;
  for (let month = 1; month <= 12; month++) {
    if (month === DEMO_DEFAULT_MONTH) continue;
    state.entries.push(...baseEntries.map(e => ({ ...e, id: `${e.id}-${month}`, date: shift(e.date, month), value: cents(e.value * (0.85 + month * 0.015)) })));
    state.receipts.push(...baseReceipts.map(r => ({ ...r, id: `${r.id}-${month}`, date: shift(r.date, month), number: `${r.number}-${month}` })));
    state.campaigns.push(...baseCampaigns.map(c => ({ ...c, id: `${c.id}-${month}`, date: shift(c.date, month), end: shift(c.end, month) })));
  }
  return state;
}
export function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<DemoState>;
  return data.version === 1 && [data.products, data.entries, data.employees, data.tasks, data.receipts, data.campaigns, data.equipment, data.users, data.allocations, data.flyer, data.tvTitles].every(Array.isArray) && !!data.goals && typeof data.goals === "object" && !!data.checklist && typeof data.checklist === "object" && typeof data.syncAt === "string";
}
export type DemoFilters = { month: number; year: number; department: string; search: string };
export function filterProducts(state: DemoState, filters: DemoFilters) {
  const search = filters.search.toLocaleLowerCase("pt-BR");
  return state.products.filter(p => (!filters.department || p.department === filters.department) && `${p.id} ${p.name} ${p.description2}`.toLocaleLowerCase("pt-BR").includes(search));
}
export function productSales(p: DemoProduct, month: number, year: number) {
  const factor = (0.82 + month * 0.018) * (1 + (year - DEMO_YEAR) * 0.06);
  const quantity = cents(p.salesQty * factor);
  return { quantity, sales: cents(quantity * p.price), cost: cents(quantity * p.cost) };
}
export function departmentMetrics(state: DemoState, filters: DemoFilters) {
  return DEPARTMENTS.filter(d => !filters.department || filters.department === d).map(department => {
    const products = filterProducts(state, { ...filters, department });
    const totals = products.reduce((a, p) => { const s = productSales(p, filters.month, filters.year); return { sales: cents(a.sales + s.sales), cost: cents(a.cost + s.cost), quantity: cents(a.quantity + s.quantity), purchases: cents(a.purchases + p.purchased * p.cost) }; }, { sales: 0, cost: 0, quantity: 0, purchases: 0 });
    return { department, ...totals, profit: cents(totals.sales - totals.cost), margin: margin(totals.sales, totals.cost), goal: state.goals[department] ?? 0, products: products.length };
  });
}
export function demoTotals(state: DemoState, filters: DemoFilters) {
  const rows = departmentMetrics(state, filters);
  return rows.reduce((a, r) => ({ sales: cents(a.sales + r.sales), cost: cents(a.cost + r.cost), quantity: cents(a.quantity + r.quantity), purchases: cents(a.purchases + r.purchases), profit: cents(a.profit + r.profit), goal: cents(a.goal + r.goal) }), { sales: 0, cost: 0, quantity: 0, purchases: 0, profit: 0, goal: 0 });
}