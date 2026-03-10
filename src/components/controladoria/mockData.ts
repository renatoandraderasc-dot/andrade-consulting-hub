// ==================== CLASSIFICAÇÃO ====================
export interface Classificacao {
  id: string;
  entradaOriginal: string;
  classificacaoGerencial: string;
  status: "classificado" | "pendente";
  updatedAt: string;
}

export const classificacoesMock: Classificacao[] = [
  { id: "1", entradaOriginal: "COMPRA DE MERCADORIAS", classificacaoGerencial: "COMPRA DO MÊS", status: "classificado", updatedAt: "2026-03-08" },
  { id: "2", entradaOriginal: "AGUA E ESGOTO", classificacaoGerencial: "ÁGUA E ESGOTO", status: "classificado", updatedAt: "2026-03-07" },
  { id: "3", entradaOriginal: "ASSESSORIA CONTABIL", classificacaoGerencial: "CONTABILIDADE", status: "classificado", updatedAt: "2026-03-06" },
  { id: "4", entradaOriginal: "TARIFAS", classificacaoGerencial: "TARIFAS/MANUTENÇÃO DE CONTA", status: "classificado", updatedAt: "2026-03-05" },
  { id: "5", entradaOriginal: "VALE GAS", classificacaoGerencial: "GÁS", status: "classificado", updatedAt: "2026-03-04" },
  { id: "6", entradaOriginal: "FOLHA PAGAMENTO", classificacaoGerencial: "DESPESAS DE PESSOAL", status: "classificado", updatedAt: "2026-03-04" },
  { id: "7", entradaOriginal: "ALUGUEL LOJA CENTRO", classificacaoGerencial: "ALUGUEL", status: "classificado", updatedAt: "2026-03-03" },
  { id: "8", entradaOriginal: "ENERGIA ELETRICA", classificacaoGerencial: "SERVIÇOS PÚBLICOS", status: "classificado", updatedAt: "2026-03-03" },
  { id: "9", entradaOriginal: "FRETE DISTRIBUIDORA", classificacaoGerencial: "FRETEIROS", status: "classificado", updatedAt: "2026-03-02" },
  { id: "10", entradaOriginal: "MANUT SISTEMA ERP", classificacaoGerencial: "INFORMÁTICA", status: "classificado", updatedAt: "2026-03-01" },
  { id: "11", entradaOriginal: "PAGTO FORNEC DIVERSOS", classificacaoGerencial: "", status: "pendente", updatedAt: "2026-03-09" },
  { id: "12", entradaOriginal: "TED RECEBIDA - 45892", classificacaoGerencial: "", status: "pendente", updatedAt: "2026-03-09" },
  { id: "13", entradaOriginal: "DEBITO AUTOMATICO 3291", classificacaoGerencial: "", status: "pendente", updatedAt: "2026-03-08" },
  { id: "14", entradaOriginal: "PIX RECEBIDO - JOAO", classificacaoGerencial: "", status: "pendente", updatedAt: "2026-03-08" },
  { id: "15", entradaOriginal: "COMPRA CARTAO CORP", classificacaoGerencial: "", status: "pendente", updatedAt: "2026-03-07" },
];

// ==================== CONT REDE (DRE) ====================
export interface DRELine {
  id: string;
  name: string;
  level: number;
  isGroup: boolean;
  valor: number;
  percentual: number;
  variacao: number;
  children?: DRELine[];
}

export const dreDataMock: DRELine[] = [
  {
    id: "receita", name: "Receita Líquida", level: 0, isGroup: false,
    valor: 2850000, percentual: 100, variacao: 4.2,
  },
  {
    id: "impostos", name: "Impostos", level: 0, isGroup: true,
    valor: -342000, percentual: -12.0, variacao: 1.1,
    children: [
      { id: "icms", name: "ICMS", level: 1, isGroup: false, valor: -199500, percentual: -7.0, variacao: 0.8 },
      { id: "pis", name: "PIS", level: 1, isGroup: false, valor: -47025, percentual: -1.65, variacao: 0.2 },
      { id: "cofins", name: "COFINS", level: 1, isGroup: false, valor: -76950, percentual: -2.7, variacao: 0.3 },
      { id: "outros_imp", name: "Outros impostos sobre venda", level: 1, isGroup: false, valor: -18525, percentual: -0.65, variacao: -0.2 },
    ],
  },
  {
    id: "receita_liq_imp", name: "Receita Líquida após Impostos", level: 0, isGroup: false,
    valor: 2508000, percentual: 88.0, variacao: 3.8,
  },
  {
    id: "cmv", name: "CMV", level: 0, isGroup: true,
    valor: -1881000, percentual: -66.0, variacao: -1.5,
    children: [
      { id: "cmv_merc", name: "Custo da Mercadoria Vendida", level: 1, isGroup: false, valor: -1767000, percentual: -62.0, variacao: -1.2 },
      { id: "cmv_acougue", name: "Material para Insumo Açougue", level: 1, isGroup: false, valor: -71250, percentual: -2.5, variacao: -0.5 },
      { id: "cmv_padaria", name: "Material para Insumo Padaria", level: 1, isGroup: false, valor: -42750, percentual: -1.5, variacao: 0.2 },
    ],
  },
  {
    id: "resultado_op", name: "Resultado Operacional", level: 0, isGroup: false,
    valor: 627000, percentual: 22.0, variacao: 2.3,
  },
  {
    id: "pag_fornec", name: "Pagamento de Fornecedores", level: 0, isGroup: false,
    valor: -1710000, percentual: -60.0, variacao: -2.0,
  },
  {
    id: "despesas", name: "Despesas", level: 0, isGroup: true,
    valor: -399000, percentual: -14.0, variacao: 0.8,
    children: [
      { id: "desp_pessoal", name: "Despesas de Pessoal", level: 1, isGroup: false, valor: -142500, percentual: -5.0, variacao: 0.3 },
      { id: "pessoal_rat", name: "Pessoal Rateado", level: 1, isGroup: false, valor: -28500, percentual: -1.0, variacao: 0.1 },
      { id: "terceirizados", name: "Profissionais Terceirizados", level: 1, isGroup: false, valor: -22800, percentual: -0.8, variacao: -0.2 },
      { id: "informatica", name: "Informática", level: 1, isGroup: false, valor: -14250, percentual: -0.5, variacao: 0.0 },
      { id: "loja", name: "Loja", level: 1, isGroup: false, valor: -19950, percentual: -0.7, variacao: 0.1 },
      { id: "frota", name: "Frota", level: 1, isGroup: false, valor: -11400, percentual: -0.4, variacao: -0.1 },
      { id: "freteiros", name: "Freteiros", level: 1, isGroup: false, valor: -17100, percentual: -0.6, variacao: 0.2 },
      { id: "embalagens", name: "Embalagens", level: 1, isGroup: false, valor: -8550, percentual: -0.3, variacao: 0.0 },
      { id: "uso_consumo", name: "Uso e Consumo", level: 1, isGroup: false, valor: -11400, percentual: -0.4, variacao: -0.1 },
      { id: "marketing", name: "Marketing", level: 1, isGroup: false, valor: -28500, percentual: -1.0, variacao: 0.3 },
      { id: "serv_publicos", name: "Serviços Públicos", level: 1, isGroup: false, valor: -34200, percentual: -1.2, variacao: 0.1 },
      { id: "aluguel", name: "Aluguel", level: 1, isGroup: false, valor: -28500, percentual: -1.0, variacao: 0.0 },
      { id: "seguranca", name: "Segurança", level: 1, isGroup: false, valor: -14250, percentual: -0.5, variacao: 0.2 },
      { id: "tributos_outros", name: "Tributos e Outros", level: 1, isGroup: false, valor: -5700, percentual: -0.2, variacao: 0.0 },
      { id: "inadimplentes", name: "Inadimplentes", level: 1, isGroup: false, valor: -2850, percentual: -0.1, variacao: -0.3 },
      { id: "desp_financeiras", name: "Despesas Financeiras", level: 1, isGroup: false, valor: -5700, percentual: -0.2, variacao: 0.1 },
      { id: "desp_diversas", name: "Despesas Diversas", level: 1, isGroup: false, valor: -2850, percentual: -0.1, variacao: -0.2 },
    ],
  },
  {
    id: "depreciacao", name: "Depreciação", level: 0, isGroup: false,
    valor: -28500, percentual: -1.0, variacao: 0.0,
  },
  {
    id: "ebitda", name: "EBITDA", level: 0, isGroup: false,
    valor: 199500, percentual: 7.0, variacao: 1.5,
  },
  {
    id: "irpj_csll", name: "IRPJ + CSLL", level: 0, isGroup: false,
    valor: -42750, percentual: -1.5, variacao: 0.3,
  },
  {
    id: "resultado", name: "Resultado (Lucro / Prejuízo)", level: 0, isGroup: false,
    valor: 156750, percentual: 5.5, variacao: 1.2,
  },
  {
    id: "investimentos", name: "Investimentos", level: 0, isGroup: false,
    valor: -57000, percentual: -2.0, variacao: -1.0,
  },
  {
    id: "resultado_op_ex", name: "Resultado Operacional do Exercício", level: 0, isGroup: false,
    valor: 99750, percentual: 3.5, variacao: 0.8,
  },
  {
    id: "resultado_fin_ex", name: "Resultado Financeiro do Exercício", level: 0, isGroup: false,
    valor: 85500, percentual: 3.0, variacao: 0.5,
  },
];

// Monthly evolution data for charts
export const evolucaoMensalMock = [
  { mes: "Out", receitaLiquida: 2650000, cmv: 1750000, despesas: 370000, ebitda: 170000 },
  { mes: "Nov", receitaLiquida: 2720000, cmv: 1790000, despesas: 380000, ebitda: 180000 },
  { mes: "Dez", receitaLiquida: 3100000, cmv: 2050000, despesas: 410000, ebitda: 220000 },
  { mes: "Jan", receitaLiquida: 2600000, cmv: 1720000, despesas: 365000, ebitda: 165000 },
  { mes: "Fev", receitaLiquida: 2735000, cmv: 1820000, despesas: 390000, ebitda: 185000 },
  { mes: "Mar", receitaLiquida: 2850000, cmv: 1881000, despesas: 399000, ebitda: 199500 },
];

export const composicaoDespesasMock = [
  { name: "Pessoal", valor: 171000 },
  { name: "Serv. Públicos", valor: 34200 },
  { name: "Marketing", valor: 28500 },
  { name: "Aluguel", valor: 28500 },
  { name: "Terceirizados", valor: 22800 },
  { name: "Loja", valor: 19950 },
  { name: "Freteiros", valor: 17100 },
  { name: "Informática", valor: 14250 },
  { name: "Segurança", valor: 14250 },
  { name: "Outros", valor: 48450 },
];
