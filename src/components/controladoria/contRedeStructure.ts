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
// Mapa EXATO: ENTRADA (normalizada) → { tipo, subtipo (CLASSIFICAÇÃO ATUALIZADA) }
// A chave é a entrada em lowercase sem acentos. O valor é o destino na DRE.

const DIRECT_MAP: Record<string, { tipo: string; subtipo: string }> = {
  // ===== IMPOSTOS =====
  "(- ) impostos a pagar sobre a venda": { tipo: "Impostos", subtipo: "ICMS" },
  "icms": { tipo: "Impostos", subtipo: "ICMS" },
  "imposto de renda e csll": { tipo: "Impostos", subtipo: "8 | IRPJ + CSLL" },
  "imposto de renda e csll / ir": { tipo: "Impostos", subtipo: "8 | IRPJ + CSLL" },
  "ir": { tipo: "Impostos", subtipo: "IRRF" },
  "simples": { tipo: "Impostos", subtipo: "OUTROS IMPOSTOS (S/ VENDA)" },
  "iof": { tipo: "Impostos", subtipo: "IOF" },

  // ===== COMPRA DO MÊS =====
  "compras": { tipo: "Compra do Mês", subtipo: "COMPRA DO MÊS" },

  // ===== DESPESAS - PESSOAL =====
  "despesas pessoal": { tipo: "Despesas", subtipo: "SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)" },
  "despesas pessoal / salarios": { tipo: "Despesas", subtipo: "SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)" },
  "salarios": { tipo: "Despesas", subtipo: "SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)" },
  "despesas pessoal / fgts": { tipo: "Despesas", subtipo: "FGTS" },
  "fgts": { tipo: "Despesas", subtipo: "FGTS" },
  "despesas pessoal / inss": { tipo: "Despesas", subtipo: "INSS" },
  "inss": { tipo: "Despesas", subtipo: "INSS" },
  "despesas pessoal / ferias do mes": { tipo: "Despesas", subtipo: "FÉRIAS" },
  "ferias do mes": { tipo: "Despesas", subtipo: "FÉRIAS" },
  "ferias": { tipo: "Despesas", subtipo: "FÉRIAS" },
  "despesas pessoal / 13 salario": { tipo: "Despesas", subtipo: "13° SALÁRIO" },
  "despesas pessoal / rescisoes": { tipo: "Despesas", subtipo: "RESCISÕES" },
  "rescisoes": { tipo: "Despesas", subtipo: "RESCISÕES" },
  "despesas pessoal / hora extra": { tipo: "Despesas", subtipo: "HORA EXTRA" },
  "hora extra": { tipo: "Despesas", subtipo: "HORA EXTRA" },
  "despesas pessoal / vale transporte": { tipo: "Despesas", subtipo: "TRANSPORTE FUNCIONÁRIOS" },
  "vale transporte": { tipo: "Despesas", subtipo: "TRANSPORTE FUNCIONÁRIOS" },
  "despesas pessoal / assistencia media": { tipo: "Despesas", subtipo: "ASSISTÊNCIA MÉDICA" },
  "assistencia media": { tipo: "Despesas", subtipo: "ASSISTÊNCIA MÉDICA" },
  "assistencia medica": { tipo: "Despesas", subtipo: "ASSISTÊNCIA MÉDICA" },
  "despesas pessoal / refeitorio": { tipo: "Despesas", subtipo: "VALE ALIMENTAÇÃO (VR)" },
  "refeitorio": { tipo: "Despesas", subtipo: "REFEITÓRIO" },
  "refeicoes externas - lanches e refeicoes": { tipo: "Despesas", subtipo: "REFEITÓRIO" },
  "despesas diversas / refeicoes externas - lanches e refeicoes": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (FUNCIONÁRIOS)" },
  "uniformes": { tipo: "Despesas", subtipo: "UNIFORMES" },
  "multas trabalhistas ( acao trabalhista )": { tipo: "Despesas", subtipo: "PROCESSO TRABALHISTA" },

  // ===== DESPESAS - PRÓ-LABORE =====
  "pro-labore": { tipo: "Despesas", subtipo: "PRÓ-LABORE (1%)" },
  "pro-labore / pro-labore": { tipo: "Despesas", subtipo: "PRÓ-LABORE (1%)" },
  "pro labore": { tipo: "Despesas", subtipo: "PRÓ-LABORE (1%)" },

  // ===== DESPESAS - ALUGUEL =====
  "aluguel": { tipo: "Despesas", subtipo: "ALUGUEL COM TERCEIROS (PREDIAL)" },
  "aluguel / aluguel": { tipo: "Despesas", subtipo: "ALUGUEL COM TERCEIROS (PREDIAL)" },

  // ===== DESPESAS - FROTA =====
  "frota": { tipo: "Despesas", subtipo: "COMBUSTÍVEIS E LUBRIFICANTES" },
  "frota / combustiveis e lubrificantes": { tipo: "Despesas", subtipo: "COMBUSTÍVEIS E LUBRIFICANTES" },
  "combustiveis e lubrificantes": { tipo: "Despesas", subtipo: "COMBUSTÍVEIS E LUBRIFICANTES" },
  "frota / manutencao veiculos": { tipo: "Despesas", subtipo: "MANUTENÇÃO DE VEÍCULOS" },
  "manutencao veiculos": { tipo: "Despesas", subtipo: "MANUTENÇÃO DE VEÍCULOS" },
  "frota / outros (multas, pedagios)": { tipo: "Despesas", subtipo: "IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS" },
  "outros (multas, pedagios)": { tipo: "Despesas", subtipo: "IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS" },
  "ipva": { tipo: "Despesas", subtipo: "IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS" },
  "frota / seguro": { tipo: "Despesas", subtipo: "SEGURO E MONITORAMENTO VEÍCULOS" },

  // ===== DESPESAS - EMBALAGENS =====
  "embalagens": { tipo: "Despesas", subtipo: "SACOLAS / EMBALAGENS / BANDEJAS / ETC" },
  "embalagens / sacolas": { tipo: "Despesas", subtipo: "SACOLAS / EMBALAGENS / BANDEJAS / ETC" },
  "sacolas": { tipo: "Despesas", subtipo: "SACOLAS / EMBALAGENS / BANDEJAS / ETC" },

  // ===== DESPESAS - SERVIÇOS PÚBLICOS =====
  "sevicos publicos": { tipo: "Despesas", subtipo: "ÁGUA E ESGOTO" },
  "sevicos publicos / agua e esgoto": { tipo: "Despesas", subtipo: "ÁGUA E ESGOTO" },
  "agua e esgoto": { tipo: "Despesas", subtipo: "ÁGUA E ESGOTO" },
  "agua": { tipo: "Despesas", subtipo: "ÁGUA E ESGOTO" },
  "sevicos publicos / energia eletrica": { tipo: "Despesas", subtipo: "ENERGIA ELÉTRICA" },
  "energia eletrica": { tipo: "Despesas", subtipo: "ENERGIA ELÉTRICA" },
  "sevicos publicos / gas": { tipo: "Despesas", subtipo: "GÁS" },
  "gas": { tipo: "Despesas", subtipo: "GÁS" },
  "sevicos publicos / telefone central": { tipo: "Despesas", subtipo: "TELEFONIA FIXA" },
  "telefone central": { tipo: "Despesas", subtipo: "TELEFONIA FIXA" },
  "telefonoa celular": { tipo: "Despesas", subtipo: "TELEFONIA FIXA" },

  // ===== DESPESAS - PROFISSIONAIS TERCEIRIZADOS =====
  "honor. prof. com tercerizados": { tipo: "Despesas", subtipo: "CONSULTORIA - MENSALIDADE" },
  "honor. prof. com tercerizados / consultoria": { tipo: "Despesas", subtipo: "CONSULTORIA - MENSALIDADE" },
  "consultoria": { tipo: "Despesas", subtipo: "CONSULTORIA - MENSALIDADE" },
  "honor. prof. com tercerizados / advocacia": { tipo: "Despesas", subtipo: "ADVOCACIA" },
  "advocacia": { tipo: "Despesas", subtipo: "ADVOCACIA" },
  "honor. prof. com tercerizados / contabilidade": { tipo: "Despesas", subtipo: "CONTABILIDADE" },
  "contabilidade": { tipo: "Despesas", subtipo: "CONTABILIDADE" },

  // ===== DESPESAS - INFORMÁTICA =====
  "informatica": { tipo: "Despesas", subtipo: "MANUTENÇÃO TERCERIZADA INFORMÁTICA" },
  "informatica / manutencao tercerizada": { tipo: "Despesas", subtipo: "MANUTENÇÃO TERCERIZADA INFORMÁTICA" },
  "manutencao tercerizada": { tipo: "Despesas", subtipo: "MANUTENÇÃO TERCERIZADA INFORMÁTICA" },
  "manutencao terceirizada": { tipo: "Despesas", subtipo: "MANUTENÇÃO TERCERIZADA INFORMÁTICA" },
  "informatica / pagamento pelo uso do sistema": { tipo: "Despesas", subtipo: "CONTROLWARE" },
  "pagamento pelo uso do sistema": { tipo: "Despesas", subtipo: "CONTROLWARE" },
  "sistema": { tipo: "Despesas", subtipo: "CONTROLWARE" },
  "informatica / serasa/net/roteador": { tipo: "Despesas", subtipo: "INTERNET" },
  "serasa/net/roteador": { tipo: "Despesas", subtipo: "INTERNET" },

  // ===== DESPESAS - MANUTENÇÃO =====
  "manutencao": { tipo: "Despesas", subtipo: "MANUTENÇÃO PREDIAL" },
  "manutencao / manutencao do predio": { tipo: "Despesas", subtipo: "MANUTENÇÃO PREDIAL" },
  "manutencao do predio": { tipo: "Despesas", subtipo: "MANUTENÇÃO PREDIAL" },
  "manutencao predial": { tipo: "Despesas", subtipo: "MANUTENÇÃO PREDIAL" },
  "manutencao / frete maq e equipamentos": { tipo: "Despesas", subtipo: "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS" },
  "frete maq e equipamentos": { tipo: "Despesas", subtipo: "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS" },
  "manutencao / manutencao de equipamentos": { tipo: "Despesas", subtipo: "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS" },
  "manutencao de equipamentos": { tipo: "Despesas", subtipo: "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS" },
  "manutencao / seguro do imovel": { tipo: "Despesas", subtipo: "SEGURO" },
  "seguro do imovel": { tipo: "Despesas", subtipo: "SEGURO" },
  "seguro": { tipo: "Despesas", subtipo: "SEGURO" },
  "manutencao / dedetizacao": { tipo: "Despesas", subtipo: "LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA" },
  "dedetizacao": { tipo: "Despesas", subtipo: "LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA" },

  // ===== DESPESAS - MATERIAL USO E CONSUMO =====
  "mater. uso consumo": { tipo: "Despesas", subtipo: "MATERIAL DE USO E CONSUMO" },
  "mater. uso consumo / material de expediente": { tipo: "Despesas", subtipo: "MATERIAL DE USO E CONSUMO" },
  "material de expediente": { tipo: "Despesas", subtipo: "MATERIAL DE USO E CONSUMO" },
  "mater. uso consumo / ativo imobilizado": { tipo: "Despesas", subtipo: "IMOBILIZADO MÁQUINAS E EQUIPAMENTOS" },
  "ativo imobilizado": { tipo: "Despesas", subtipo: "IMOBILIZADO MÁQUINAS E EQUIPAMENTOS" },
  "material de limpeza escritorio e loja": { tipo: "Despesas", subtipo: "MATERIAL P/ LIMPEZA DA LOJA" },

  // ===== DESPESAS - PROPAGANDA / MARKETING =====
  "propaganda": { tipo: "Despesas", subtipo: "MARKETING (MÍDIAS SOCIAIS) - IMPULSIONAMENTO" },
  "impulsionamento": { tipo: "Despesas", subtipo: "MARKETING (MÍDIAS SOCIAIS) - IMPULSIONAMENTO" },
  "propaganda / outros (ecad/ degustacao/ sky)": { tipo: "Despesas", subtipo: "MARKETING (MÍDIAS SOCIAIS) - IMPULSIONAMENTO" },
  "outros (ecad/ degustacao/ sky)": { tipo: "Despesas", subtipo: "MARKETING (MÍDIAS SOCIAIS) - IMPULSIONAMENTO" },
  "propaganda / carro de som + gravacao": { tipo: "Despesas", subtipo: "CARRO DE SOM" },
  "carro de som + gravacao": { tipo: "Despesas", subtipo: "CARRO DE SOM" },
  "propaganda / faixas e cartazetes": { tipo: "Despesas", subtipo: "FAIXAS E CARTAZETES (MATERIAL)" },
  "faixas e cartazetes": { tipo: "Despesas", subtipo: "FAIXAS E CARTAZETES (MATERIAL)" },
  "propaganda / radio": { tipo: "Despesas", subtipo: "MENSALIDADE SOFTWARE WHATS/RÁDIO" },
  "radio": { tipo: "Despesas", subtipo: "MENSALIDADE SOFTWARE WHATS/RÁDIO" },
  "propaganda / panfletos grafica": { tipo: "Despesas", subtipo: "GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)" },
  "panfletos grafica": { tipo: "Despesas", subtipo: "DISTRIBUIÇÃO DO PANFLETO" },
  "agencia": { tipo: "Despesas", subtipo: "GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)" },
  "grafica outros": { tipo: "Despesas", subtipo: "GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)" },
  "decoracao": { tipo: "Despesas", subtipo: "ARCO BALÕES - DECORAÇÃO" },

  // ===== DESPESAS FINANCEIRAS =====
  "desp. financeiras": { tipo: "Despesas", subtipo: "DESPESAS BANCÁRIAS" },
  "desp. financeiras / taxas de cartao": { tipo: "Despesas", subtipo: "TAXAS DE CARTÕES" },
  "taxas de cartao": { tipo: "Despesas", subtipo: "TAXAS DE CARTÕES" },
  "taxa cartao": { tipo: "Despesas", subtipo: "TAXAS DE CARTÕES" },
  "taxas": { tipo: "Despesas", subtipo: "TAXAS DE CARTÕES" },
  "juros maquinas": { tipo: "Despesas", subtipo: "TAXAS DE CARTÕES" },
  "desp. financeiras / despesas bancarias": { tipo: "Despesas", subtipo: "DIVERSOS FINANCEIROS" },
  "despesas bancarias": { tipo: "Despesas", subtipo: "JUROS POR ATRASO DE DUPLICATAS" },
  "antecipacao": { tipo: "Despesas", subtipo: "ANTECIPAÇÃO CARTÕES" },
  "emprestimos": { tipo: "Despesas", subtipo: "EMPRÉSTIMOS" },
  "aplicacao bancaria": { tipo: "Despesas", subtipo: "EMPRÉSTIMOS" },

  // ===== DESPESAS - TAXAS/MULTAS/TRIBUTOS =====
  "taxas/multas/trib.": { tipo: "Despesas", subtipo: "INMETRO/OUTRAS TAXAS" },
  "taxas/multas/trib. / iptu - taxas municipais": { tipo: "Despesas", subtipo: "IPTU" },
  "iptu - taxas municipais": { tipo: "Despesas", subtipo: "IPTU" },
  "taxas/multas/trib. / outros (autenticacoes)": { tipo: "Despesas", subtipo: "TRIBUTOS - FEDERAIS PARCELAMENTO TELLES" },
  "outros (autenticacoes)": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (ADMINISTRATIVA)" },
  "despesas de cartorio-impost/taxas": { tipo: "Despesas", subtipo: "MAT. ESC. / CORREIOS / CARTÓRIOS" },
  "correio": { tipo: "Despesas", subtipo: "MAT. ESC. / CORREIOS / CARTÓRIOS" },

  // ===== DESPESAS DIVERSAS =====
  "despesas diversas": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (DIRETORIA)" },
  "despesas diversas / outras": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (DIRETORIA)" },
  "outras depesas (diretoria)": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (DIRETORIA)" },
  "outras despesas (diretoria)": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (DIRETORIA)" },
  "outras despesas diretoria": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (DIRETORIA)" },
  "outras despesas (administrativa)": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (ADMINISTRATIVA)" },
  "outros": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (ADMINISTRATIVA)" },
  "outros (notinhas)": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (COMERCIAL)" },
  "outros debito": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (ADMINISTRATIVA)" },
  "prestacao de servicos": { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (ADMINISTRATIVA)" },

  // ===== DESPESAS - SEGURANÇA =====
  "vigilancia": { tipo: "Despesas", subtipo: "DIVERSOS SEGURANÇA" },

  // ===== DESPESAS - FRETEIROS =====
  "frete": { tipo: "Despesas", subtipo: "FRETEIROS / ENTREGAS / BUSCAS MERCADORIAS" },

  // ===== DESPESAS - INSUMOS =====
  "insumos padaria": { tipo: "Despesas", subtipo: "MATERIAL PARA INSUMO PADARIA" },

  // ===== INVESTIMENTOS =====
  "investimentos": { tipo: "Despesas", subtipo: "9 | INVESTIMENTOS (OUTROS)" },
};

// Normaliza uma string removendo acentos e convertendo para lowercase
function normalizeStr(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Monta o mapa normalizado uma única vez
const NORMALIZED_MAP = new Map<string, { tipo: string; subtipo: string }>();
for (const [key, val] of Object.entries(DIRECT_MAP)) {
  NORMALIZED_MAP.set(normalizeStr(key), val);
}

/**
 * Classifica uma descrição usando correspondência EXATA primeiro,
 * depois fallback por palavras-chave simples.
 * Sem IA. Se não encontrar → "Despesas" / "OUTRAS DESPESAS (ADMINISTRATIVA)"
 */
export function classifyDeterministic(descricao: string, tipoHint?: string): { tipo: string; subtipo: string } {
  const normalized = normalizeStr(descricao);
  const hintNormalized = tipoHint ? normalizeStr(tipoHint) : "";

  // 1) Tentar match composto "tipo / subtipo" (ex: "DESPESAS PESSOAL / SALÁRIOS")
  if (hintNormalized && normalized) {
    const compoundKey = `${hintNormalized} / ${normalized}`;
    const compound = NORMALIZED_MAP.get(compoundKey);
    if (compound) return compound;
  }

  // 2) Tentar match exato na descrição
  const exactDesc = NORMALIZED_MAP.get(normalized);
  if (exactDesc) return exactDesc;

  // 3) Tentar match exato no tipo/hint
  if (hintNormalized) {
    const exactHint = NORMALIZED_MAP.get(hintNormalized);
    if (exactHint) return exactHint;
  }

  // 4) Tentar match parcial (a descrição contém uma chave do mapa)
  for (const [key, val] of NORMALIZED_MAP.entries()) {
    if (key.length >= 4 && normalized.includes(key)) return val;
  }

  // 5) Tentar match parcial no tipo/hint
  if (hintNormalized) {
    for (const [key, val] of NORMALIZED_MAP.entries()) {
      if (key.length >= 4 && hintNormalized.includes(key)) return val;
    }
  }

  return { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (ADMINISTRATIVA)" };
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
