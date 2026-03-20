/**
 * ESTRUTURA FIXA DA CONTROLADORIA — NÃO ALTERAR NOMES NEM ORDEM.
 * Toda a DRE é calculada deterministicamente a partir dos lançamentos.
 */

// ============ TIPOS DE LANÇAMENTO ============
export const TIPOS_LANCAMENTO_V2 = [
  "Faturamento",
  "Cancelamentos",
  "Descontos",
  "Impostos",
  "CMV",
  "Compra do Mês",
  "Despesas",
  "Recebimentos",
  "Pagamentos",
] as const;

export type TipoLancamento = typeof TIPOS_LANCAMENTO_V2[number];

// ============ SUBCONTAS FIXAS ============
export const SUBCONTAS_V2: Record<string, string[]> = {
  "Faturamento": ["Venda Bruta", "Venda Cartão Crédito", "Venda Cartão Débito", "Venda Pix", "Venda Convênio", "Venda Dinheiro", "Outras Vendas"],
  "Cancelamentos": ["Cancelamento de Vendas", "Devoluções"],
  "Descontos": ["Descontos Concedidos", "Abatimentos"],
  "Impostos": ["ICMS", "PIS", "COFINS", "Simples Nacional", "Outros Impostos sobre Venda"],
  "CMV": [
    "Custo da Mercadoria Vendida",
    "Material para Insumo Açougue",
    "Material para Insumo Padaria",
    "Material para Insumo Rotisseria",
    "Perdas e Quebras",
    "Ajustes de Estoque",
  ],
  "Compra do Mês": ["Pagamento Fornecedores", "Compra de Mercadorias"],
  "Despesas": [
    "Despesas de Pessoal",
    "Pessoal Rateado",
    "Profissionais Terceirizados",
    "Contabilidade",
    "Informática",
    "Loja",
    "Frota",
    "Freteiros",
    "Embalagens",
    "Uso e Consumo",
    "Marketing",
    "Serviços Públicos",
    "Energia Elétrica",
    "Água e Esgoto",
    "Gás",
    "Aluguel",
    "Segurança",
    "Tributos e Outros",
    "Inadimplentes",
    "Despesas Financeiras",
    "Tarifas/Manutenção de Conta",
    "Despesas Diversas",
    "Depreciação",
  ],
  "Recebimentos": [
    "Recebimento Cartão Crédito",
    "Recebimento Cartão Débito",
    "Recebimento Pix",
    "Recebimento Convênio",
    "Recebimento Dinheiro",
    "Outros Recebimentos",
  ],
  "Pagamentos": [
    "Pagamento Fornecedores",
    "Pagamento Pessoal",
    "Pagamento Impostos",
    "Pagamento Aluguel",
    "Pagamento Serviços",
    "Outros Pagamentos",
  ],
};

// ============ ESTRUTURA FIXA DRE (COMERCIAL) ============
export interface DRENode {
  id: string;
  name: string;
  level: number;       // 0=grupo, 1=subconta, 2=resultado
  isGroup: boolean;
  isResult: boolean;   // linhas calculadas (somas, fórmulas)
  tipo?: string;       // mapeia para tipo do lançamento
  subtipo?: string;    // mapeia para subtipo específico
  formula?: string;    // fórmula de cálculo para linhas resultado
  children?: DRENode[];
}

export const DRE_STRUCTURE_COMERCIAL: DRENode[] = [
  {
    id: "faturamento", name: "FATURAMENTO", level: 0, isGroup: true, isResult: false, tipo: "Faturamento",
    children: [
      { id: "venda_bruta", name: "Venda Bruta", level: 1, isGroup: false, isResult: false, tipo: "Faturamento", subtipo: "Venda Bruta" },
      { id: "venda_cc", name: "Venda Cartão Crédito", level: 1, isGroup: false, isResult: false, tipo: "Faturamento", subtipo: "Venda Cartão Crédito" },
      { id: "venda_cd", name: "Venda Cartão Débito", level: 1, isGroup: false, isResult: false, tipo: "Faturamento", subtipo: "Venda Cartão Débito" },
      { id: "venda_pix", name: "Venda Pix", level: 1, isGroup: false, isResult: false, tipo: "Faturamento", subtipo: "Venda Pix" },
      { id: "venda_convenio", name: "Venda Convênio", level: 1, isGroup: false, isResult: false, tipo: "Faturamento", subtipo: "Venda Convênio" },
      { id: "venda_dinheiro", name: "Venda Dinheiro", level: 1, isGroup: false, isResult: false, tipo: "Faturamento", subtipo: "Venda Dinheiro" },
      { id: "outras_vendas", name: "Outras Vendas", level: 1, isGroup: false, isResult: false, tipo: "Faturamento", subtipo: "Outras Vendas" },
    ],
  },
  {
    id: "cancelamentos", name: "CANCELAMENTOS", level: 0, isGroup: true, isResult: false, tipo: "Cancelamentos",
    children: [
      { id: "cancel_vendas", name: "Cancelamento de Vendas", level: 1, isGroup: false, isResult: false, tipo: "Cancelamentos", subtipo: "Cancelamento de Vendas" },
      { id: "devolucoes", name: "Devoluções", level: 1, isGroup: false, isResult: false, tipo: "Cancelamentos", subtipo: "Devoluções" },
    ],
  },
  {
    id: "descontos", name: "DESCONTOS", level: 0, isGroup: true, isResult: false, tipo: "Descontos",
    children: [
      { id: "desc_concedidos", name: "Descontos Concedidos", level: 1, isGroup: false, isResult: false, tipo: "Descontos", subtipo: "Descontos Concedidos" },
      { id: "abatimentos", name: "Abatimentos", level: 1, isGroup: false, isResult: false, tipo: "Descontos", subtipo: "Abatimentos" },
    ],
  },
  {
    id: "receita_liquida", name: "= RECEITA LÍQUIDA", level: 0, isGroup: false, isResult: true,
    formula: "faturamento - cancelamentos - descontos",
  },
  {
    id: "impostos", name: "IMPOSTOS", level: 0, isGroup: true, isResult: false, tipo: "Impostos",
    children: [
      { id: "icms", name: "ICMS", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "ICMS" },
      { id: "pis", name: "PIS", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "PIS" },
      { id: "cofins", name: "COFINS", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "COFINS" },
      { id: "simples", name: "Simples Nacional", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "Simples Nacional" },
      { id: "outros_imp", name: "Outros Impostos sobre Venda", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "Outros Impostos sobre Venda" },
    ],
  },
  {
    id: "receita_liquida_total", name: "= RECEITA LÍQUIDA TOTAL", level: 0, isGroup: false, isResult: true,
    formula: "receita_liquida - impostos",
  },
  {
    id: "cmv", name: "CMV", level: 0, isGroup: true, isResult: false, tipo: "CMV",
    children: [
      { id: "cmv_merc", name: "Custo da Mercadoria Vendida", level: 1, isGroup: false, isResult: false, tipo: "CMV", subtipo: "Custo da Mercadoria Vendida" },
      { id: "cmv_acougue", name: "Material para Insumo Açougue", level: 1, isGroup: false, isResult: false, tipo: "CMV", subtipo: "Material para Insumo Açougue" },
      { id: "cmv_padaria", name: "Material para Insumo Padaria", level: 1, isGroup: false, isResult: false, tipo: "CMV", subtipo: "Material para Insumo Padaria" },
      { id: "cmv_rotisseria", name: "Material para Insumo Rotisseria", level: 1, isGroup: false, isResult: false, tipo: "CMV", subtipo: "Material para Insumo Rotisseria" },
      { id: "cmv_perdas", name: "Perdas e Quebras", level: 1, isGroup: false, isResult: false, tipo: "CMV", subtipo: "Perdas e Quebras" },
      { id: "cmv_ajustes", name: "Ajustes de Estoque", level: 1, isGroup: false, isResult: false, tipo: "CMV", subtipo: "Ajustes de Estoque" },
    ],
  },
  {
    id: "resultado_op_cmv", name: "= RESULTADO OPERACIONAL CMV", level: 0, isGroup: false, isResult: true,
    formula: "receita_liquida_total - cmv",
  },
  {
    id: "compra_mes", name: "COMPRA DO MÊS", level: 0, isGroup: true, isResult: false, tipo: "Compra do Mês",
    children: [
      { id: "pag_fornec", name: "Pagamento Fornecedores", level: 1, isGroup: false, isResult: false, tipo: "Compra do Mês", subtipo: "Pagamento Fornecedores" },
      { id: "compra_merc", name: "Compra de Mercadorias", level: 1, isGroup: false, isResult: false, tipo: "Compra do Mês", subtipo: "Compra de Mercadorias" },
    ],
  },
  {
    id: "resultado_op_compra", name: "= RESULTADO OPERACIONAL COMPRA", level: 0, isGroup: false, isResult: true,
    formula: "receita_liquida_total - compra_mes",
  },
  {
    id: "despesas", name: "DESPESAS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      { id: "desp_pessoal", name: "Despesas de Pessoal", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Despesas de Pessoal" },
      { id: "pessoal_rat", name: "Pessoal Rateado", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Pessoal Rateado" },
      { id: "terceirizados", name: "Profissionais Terceirizados", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Profissionais Terceirizados" },
      { id: "contabilidade", name: "Contabilidade", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Contabilidade" },
      { id: "informatica", name: "Informática", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Informática" },
      { id: "loja", name: "Loja", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Loja" },
      { id: "frota", name: "Frota", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Frota" },
      { id: "freteiros", name: "Freteiros", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Freteiros" },
      { id: "embalagens", name: "Embalagens", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Embalagens" },
      { id: "uso_consumo", name: "Uso e Consumo", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Uso e Consumo" },
      { id: "marketing", name: "Marketing", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Marketing" },
      { id: "serv_publicos", name: "Serviços Públicos", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Serviços Públicos" },
      { id: "energia", name: "Energia Elétrica", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Energia Elétrica" },
      { id: "agua", name: "Água e Esgoto", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Água e Esgoto" },
      { id: "gas", name: "Gás", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Gás" },
      { id: "aluguel", name: "Aluguel", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Aluguel" },
      { id: "seguranca", name: "Segurança", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Segurança" },
      { id: "tributos_outros", name: "Tributos e Outros", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Tributos e Outros" },
      { id: "inadimplentes", name: "Inadimplentes", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Inadimplentes" },
      { id: "desp_financeiras", name: "Despesas Financeiras", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Despesas Financeiras" },
      { id: "tarifas", name: "Tarifas/Manutenção de Conta", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Tarifas/Manutenção de Conta" },
      { id: "desp_diversas", name: "Despesas Diversas", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Despesas Diversas" },
      { id: "depreciacao", name: "Depreciação", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Depreciação" },
    ],
  },
  {
    id: "ebitda", name: "= EBITDA", level: 0, isGroup: false, isResult: true,
    formula: "receita_liquida_total - cmv - despesas",
  },
  {
    id: "resultado_final", name: "= RESULTADO FINAL", level: 0, isGroup: false, isResult: true,
    formula: "ebitda - impostos",
  },
];

// ============ ESTRUTURA FIXA DRE (FINANCEIRO) ============
export const DRE_STRUCTURE_FINANCEIRO: DRENode[] = [
  {
    id: "recebimentos", name: "RECEBIMENTOS", level: 0, isGroup: true, isResult: false, tipo: "Recebimentos",
    children: [
      { id: "rec_cc", name: "Recebimento Cartão Crédito", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Cartão Crédito" },
      { id: "rec_cd", name: "Recebimento Cartão Débito", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Cartão Débito" },
      { id: "rec_pix", name: "Recebimento Pix", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Pix" },
      { id: "rec_convenio", name: "Recebimento Convênio", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Convênio" },
      { id: "rec_dinheiro", name: "Recebimento Dinheiro", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Dinheiro" },
      { id: "rec_outros", name: "Outros Recebimentos", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Outros Recebimentos" },
    ],
  },
  {
    id: "pagamentos", name: "PAGAMENTOS", level: 0, isGroup: true, isResult: false, tipo: "Pagamentos",
    children: [
      { id: "pag_fornec_fin", name: "Pagamento Fornecedores", level: 1, isGroup: false, isResult: false, tipo: "Pagamentos", subtipo: "Pagamento Fornecedores" },
      { id: "pag_pessoal", name: "Pagamento Pessoal", level: 1, isGroup: false, isResult: false, tipo: "Pagamentos", subtipo: "Pagamento Pessoal" },
      { id: "pag_impostos", name: "Pagamento Impostos", level: 1, isGroup: false, isResult: false, tipo: "Pagamentos", subtipo: "Pagamento Impostos" },
      { id: "pag_aluguel", name: "Pagamento Aluguel", level: 1, isGroup: false, isResult: false, tipo: "Pagamentos", subtipo: "Pagamento Aluguel" },
      { id: "pag_servicos", name: "Pagamento Serviços", level: 1, isGroup: false, isResult: false, tipo: "Pagamentos", subtipo: "Pagamento Serviços" },
      { id: "pag_outros", name: "Outros Pagamentos", level: 1, isGroup: false, isResult: false, tipo: "Pagamentos", subtipo: "Outros Pagamentos" },
    ],
  },
  {
    id: "despesas_fin", name: "DESPESAS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      { id: "fin_desp_pessoal", name: "Despesas de Pessoal", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Despesas de Pessoal" },
      { id: "fin_serv_publicos", name: "Serviços Públicos", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Serviços Públicos" },
      { id: "fin_aluguel", name: "Aluguel", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Aluguel" },
      { id: "fin_desp_financeiras", name: "Despesas Financeiras", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Despesas Financeiras" },
      { id: "fin_desp_diversas", name: "Despesas Diversas", level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo: "Despesas Diversas" },
    ],
  },
  {
    id: "saldo_financeiro", name: "= SALDO FINANCEIRO", level: 0, isGroup: false, isResult: true,
    formula: "recebimentos - pagamentos - despesas_fin",
  },
];

// ============ MOTOR DE CLASSIFICAÇÃO DETERMINÍSTICO ============
interface ClassificationRule {
  keywords: string[];
  tipo: string;
  subtipo: string;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  // Faturamento
  { keywords: ["venda bruta", "faturamento bruto"], tipo: "Faturamento", subtipo: "Venda Bruta" },
  { keywords: ["cartao credito", "cartão crédito", "venda cc"], tipo: "Faturamento", subtipo: "Venda Cartão Crédito" },
  { keywords: ["cartao debito", "cartão débito", "venda cd"], tipo: "Faturamento", subtipo: "Venda Cartão Débito" },
  { keywords: ["pix", "venda pix"], tipo: "Faturamento", subtipo: "Venda Pix" },
  { keywords: ["convenio", "convênio"], tipo: "Faturamento", subtipo: "Venda Convênio" },
  { keywords: ["dinheiro", "especie", "espécie"], tipo: "Faturamento", subtipo: "Venda Dinheiro" },

  // Cancelamentos
  { keywords: ["cancelamento", "cancel", "estorno venda"], tipo: "Cancelamentos", subtipo: "Cancelamento de Vendas" },
  { keywords: ["devolucao", "devolução", "devol"], tipo: "Cancelamentos", subtipo: "Devoluções" },

  // Descontos
  { keywords: ["desconto", "abatimento"], tipo: "Descontos", subtipo: "Descontos Concedidos" },

  // Impostos
  { keywords: ["icms"], tipo: "Impostos", subtipo: "ICMS" },
  { keywords: ["pis"], tipo: "Impostos", subtipo: "PIS" },
  { keywords: ["cofins"], tipo: "Impostos", subtipo: "COFINS" },
  { keywords: ["simples", "das", "simples nacional"], tipo: "Impostos", subtipo: "Simples Nacional" },
  { keywords: ["imposto", "tributo", "iss", "irpj", "csll"], tipo: "Impostos", subtipo: "Outros Impostos sobre Venda" },

  // CMV
  { keywords: ["cmv", "custo mercadoria", "custo merc"], tipo: "CMV", subtipo: "Custo da Mercadoria Vendida" },
  { keywords: ["insumo acougue", "insumo açougue", "açougue"], tipo: "CMV", subtipo: "Material para Insumo Açougue" },
  { keywords: ["insumo padaria", "padaria"], tipo: "CMV", subtipo: "Material para Insumo Padaria" },
  { keywords: ["rotisseria", "rotisserie"], tipo: "CMV", subtipo: "Material para Insumo Rotisseria" },
  { keywords: ["perda", "quebra"], tipo: "CMV", subtipo: "Perdas e Quebras" },
  { keywords: ["ajuste estoque"], tipo: "CMV", subtipo: "Ajustes de Estoque" },

  // Compra do Mês
  { keywords: ["fornecedor", "compra merc", "compra de mercadoria"], tipo: "Compra do Mês", subtipo: "Compra de Mercadorias" },
  { keywords: ["pag fornec", "pagamento fornec", "pagto fornec"], tipo: "Compra do Mês", subtipo: "Pagamento Fornecedores" },

  // Despesas
  { keywords: ["folha", "salario", "salário", "pessoal", "inss", "fgts", "ferias", "férias", "13"], tipo: "Despesas", subtipo: "Despesas de Pessoal" },
  { keywords: ["rateio", "rateado", "pessoal rateado"], tipo: "Despesas", subtipo: "Pessoal Rateado" },
  { keywords: ["terceirizado", "terceirizados", "profissional terceirizado"], tipo: "Despesas", subtipo: "Profissionais Terceirizados" },
  { keywords: ["contabil", "contábil", "contabilidade", "assessoria contabil"], tipo: "Despesas", subtipo: "Contabilidade" },
  { keywords: ["informatica", "informática", "sistema", "erp", "software", "ti"], tipo: "Despesas", subtipo: "Informática" },
  { keywords: ["loja", "manutencao loja", "manutenção loja"], tipo: "Despesas", subtipo: "Loja" },
  { keywords: ["frota", "combustivel", "combustível", "veiculo", "veículo"], tipo: "Despesas", subtipo: "Frota" },
  { keywords: ["frete", "freteiro", "freteiros"], tipo: "Despesas", subtipo: "Freteiros" },
  { keywords: ["embalagem", "embalagens", "sacola"], tipo: "Despesas", subtipo: "Embalagens" },
  { keywords: ["uso consumo", "uso e consumo", "material limpeza", "higiene"], tipo: "Despesas", subtipo: "Uso e Consumo" },
  { keywords: ["marketing", "propaganda", "publicidade", "midia", "mídia"], tipo: "Despesas", subtipo: "Marketing" },
  { keywords: ["servico publico", "serviço público", "serviços públicos"], tipo: "Despesas", subtipo: "Serviços Públicos" },
  { keywords: ["energia", "eletrica", "elétrica", "luz", "cemig", "enel", "copel"], tipo: "Despesas", subtipo: "Energia Elétrica" },
  { keywords: ["agua", "água", "esgoto", "saneamento", "sabesp", "copasa"], tipo: "Despesas", subtipo: "Água e Esgoto" },
  { keywords: ["gas", "gás", "vale gas"], tipo: "Despesas", subtipo: "Gás" },
  { keywords: ["aluguel", "locacao", "locação"], tipo: "Despesas", subtipo: "Aluguel" },
  { keywords: ["seguranca", "segurança", "vigilancia", "vigilância", "monitoramento"], tipo: "Despesas", subtipo: "Segurança" },
  { keywords: ["tarifa", "manutencao conta", "manutenção conta", "taxa bancaria", "taxa bancária"], tipo: "Despesas", subtipo: "Tarifas/Manutenção de Conta" },
  { keywords: ["inadimplente", "inadimplência"], tipo: "Despesas", subtipo: "Inadimplentes" },
  { keywords: ["juros", "multa financeira", "encargo", "iof"], tipo: "Despesas", subtipo: "Despesas Financeiras" },
  { keywords: ["depreciacao", "depreciação"], tipo: "Despesas", subtipo: "Depreciação" },

  // Recebimentos
  { keywords: ["recebimento cc", "receb cartao credito", "receb cartão crédito"], tipo: "Recebimentos", subtipo: "Recebimento Cartão Crédito" },
  { keywords: ["recebimento cd", "receb cartao debito", "receb cartão débito"], tipo: "Recebimentos", subtipo: "Recebimento Cartão Débito" },
  { keywords: ["recebimento pix", "pix recebido", "ted recebida"], tipo: "Recebimentos", subtipo: "Recebimento Pix" },
  { keywords: ["recebimento convenio", "receb convênio"], tipo: "Recebimentos", subtipo: "Recebimento Convênio" },
  { keywords: ["recebimento dinheiro"], tipo: "Recebimentos", subtipo: "Recebimento Dinheiro" },

  // Pagamentos
  { keywords: ["pagamento pessoal", "pag pessoal", "pagto pessoal"], tipo: "Pagamentos", subtipo: "Pagamento Pessoal" },
  { keywords: ["pagamento imposto", "pag imposto", "pagto imposto"], tipo: "Pagamentos", subtipo: "Pagamento Impostos" },
  { keywords: ["pagamento aluguel", "pag aluguel", "pagto aluguel"], tipo: "Pagamentos", subtipo: "Pagamento Aluguel" },
  { keywords: ["pagamento servico", "pag servico", "pagto servico", "pagamento serviço"], tipo: "Pagamentos", subtipo: "Pagamento Serviços" },
];

/**
 * Classifica uma descrição usando correspondência direta por palavras-chave.
 * Sem IA. Se não encontrar → retorna { tipo: "Despesas", subtipo: "Despesas Diversas" }
 */
export function classifyDeterministic(descricao: string, tipoHint?: string): { tipo: string; subtipo: string } {
  const normalized = (descricao || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // If tipoHint is provided and valid, narrow search
  const rules = tipoHint
    ? CLASSIFICATION_RULES.filter(r => r.tipo.toLowerCase() === tipoHint.toLowerCase())
    : CLASSIFICATION_RULES;

  for (const rule of rules) {
    for (const kw of rule.keywords) {
      const kwNorm = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalized.includes(kwNorm)) {
        return { tipo: rule.tipo, subtipo: rule.subtipo };
      }
    }
  }

  // Fallback: search all rules if tipoHint didn't match
  if (tipoHint) {
    for (const rule of CLASSIFICATION_RULES) {
      for (const kw of rule.keywords) {
        const kwNorm = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalized.includes(kwNorm)) {
          return { tipo: rule.tipo, subtipo: rule.subtipo };
        }
      }
    }
  }

  return { tipo: "Despesas", subtipo: "Despesas Diversas" };
}

// ============ CÁLCULOS DA DRE ============
export interface LancamentoData {
  tipo: string;
  subtipo: string;
  valor: number;
}

export function calcularDRE(
  structure: DRENode[],
  lancamentos: LancamentoData[]
): Map<string, number> {
  const values = new Map<string, number>();

  // Step 1: calculate group totals from lancamentos
  for (const node of structure) {
    if (node.isGroup && node.tipo) {
      let total = 0;
      const groupLancs = lancamentos.filter(l => l.tipo === node.tipo);

      if (node.children) {
        for (const child of node.children) {
          const childVal = child.subtipo
            ? groupLancs.filter(l => l.subtipo === child.subtipo).reduce((s, l) => s + l.valor, 0)
            : 0;
          values.set(child.id, childVal);
          total += childVal;
        }
        // Add any lancamentos with unmatched subtipos
        const matchedSubtipos = new Set(node.children.map(c => c.subtipo).filter(Boolean));
        const unmatchedVal = groupLancs
          .filter(l => !matchedSubtipos.has(l.subtipo))
          .reduce((s, l) => s + l.valor, 0);
        total += unmatchedVal;
      } else {
        total = groupLancs.reduce((s, l) => s + l.valor, 0);
      }
      values.set(node.id, total);
    }
  }

  // Step 2: calculate formula lines
  for (const node of structure) {
    if (node.isResult && node.formula) {
      const val = evaluateFormula(node.formula, values);
      values.set(node.id, val);
    }
  }

  return values;
}

function evaluateFormula(formula: string, values: Map<string, number>): number {
  // Simple formula parser: "a - b - c + d"
  const parts = formula.split(/\s+/);
  let result = 0;
  let op = "+";
  for (const part of parts) {
    if (part === "+" || part === "-") {
      op = part;
    } else {
      const val = values.get(part) || 0;
      result = op === "+" ? result + val : result - val;
    }
  }
  return result;
}
