/**
 * ESTRUTURA FIXA DA CONTROLADORIA — LAYOUT IDÊNTICO AO EXCEL "VISÃO CONTROLADORIA - REDE"
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
  "Impostos": ["ICMS", "PIS", "COFINS", "OUTROS IMPOSTOS (S/ VENDA)", "8 | IRPJ + CSLL", "IRRF"],
  "CMV": [
    "CUSTO DA MERCADORIA VENDIDA",
    "MATERIAL PARA INSUMO AÇOUGUE",
    "MATERIAL PARA INSUMO PADARIA",
  ],
  "Compra do Mês": ["COMPRA DO MÊS"],
  "Despesas": [
    // 4.1 Pessoal
    "SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)", "ADIANTAMENTO SALARIAL", "MEDICINA OCUPACIONAL",
    "INSS", "FGTS", "FGTS (RESCISÃO)", "RESCISÕES", "IRRF", "PROCESSO TRABALHISTA",
    "COMPLEMENTO DE SALÁRIOS / DIFERENÇAS", "13° SALÁRIO", "FÉRIAS (PROVISÃO - 1/12 AVOS)",
    "FÉRIAS", "UNIFORMES", "COMPRA DE EPI", "DIARISTA", "TREINAMENTOS", "HORA EXTRA",
    "CONSULTORIA DE RECRUTAMENTO E SELEÇÃO", "ASSISTÊNCIA MÉDICA", "CONTRIBUIÇÃO SINDICAL",
    "REFEITÓRIO", "DOAÇÃO BONUS FUNCIONÁRIO", "CONVENIO MERCADO",
    "TRANSPORTE FUNCIONÁRIOS", "OUTRAS DESPESAS (FUNCIONÁRIOS)",
    // 4.1.2 Pessoal Rateado
    "PESSOAL ADMINISTRATIVO", "PESSOAL OPERACIONAL + TRANSPORTES", "PESSOAL COMPRAS + ESTOQUE",
    // 4.2 Terceirizados
    "CONSULTORIA - MENSALIDADE", "REFRIGERAÇÃO", "ADVOCACIA", "TI",
    "DIAGNÓSTICO FISCAL (PIS E COFINS)", "CONTABILIDADE",
    "LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA", "PONTOS DE ACESSO - RH", "ASSOCIAÇÃO DE CLASSE",
    // 4.3 Informática
    "COMPRA DE EQUIPAMENTOS INFORMÁTICA", "MANUTENÇÃO TERCERIZADA INFORMÁTICA",
    "CONTROLWARE", "INTERNET/DOMINIO E-MAILs", "INTERNET", "SUPRIMENTOS", "LOCAÇÃO DE EQUIPAMENTOS",
    // 4.4 Loja
    "MANUTENÇÃO PREDIAL", "SEGURO", "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS",
    "MANUTENÇÃO - INSTALAÇÕES MAQUINAS E EQUIP.",
    // 4.5 Frota
    "COMPRA DE VEÍCULOS", "ALUGUEL COM VEÍCULOS", "MANUTENÇÃO DE VEÍCULOS",
    "COMBUSTÍVEIS E LUBRIFICANTES", "SEGURO E MONITORAMENTO VEÍCULOS",
    "IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS",
    // 4.6 Freteiros
    "FRETEIROS / ENTREGAS / BUSCAS MERCADORIAS",
    // 4.7 Embalagens
    "SACOLAS / EMBALAGENS / BANDEJAS / ETC", "OUTROS (EMBALAGENS)",
    // 4.8 Uso Consumo
    "MAT. ESC. / CORREIOS / CARTÓRIOS", "MATERIAL DE USO E CONSUMO",
    "MATERIAL PARA MANUTENÇÃO ADM/OPERACIONAL", "MATERIAL P/ LIMPEZA DA LOJA",
    // 4.9 Marketing
    "AQUISIÇÃO BRINDES/PRODUTOS (PROMOÇÕES)", "TELEVISÃO",
    "GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)", "DISTRIBUIÇÃO DO PANFLETO",
    "MENSALIDADE SOFTWARE WHATS/RÁDIO", "AGÊNCIA/GRAVAÇÃO/LOCUÇÃO",
    "FAIXAS E CARTAZETES (MATERIAL)", "CARRO DE SOM", "ARCO BALÕES - DECORAÇÃO",
    "MARKETING (MÍDIAS SOCIAIS) - IMPULSIONAMENTO", "CARTAZISTA - M.O. TERCEIRIZADA",
    "PUBLICIDADE", "SPOTS VINHETAS",
    // 4.10 Serviços Públicos
    "ÁGUA E ESGOTO", "ENERGIA ELÉTRICA", "TELEFONIA FIXA", "TELEFONIA CELULAR",
    "INMETRO/OUTRAS TAXAS", "GÁS", "PROCON", "IPTU",
    // 4.11 Aluguel
    "ALUGUEL COM TERCEIROS (PREDIAL)", "ALUGUEL ESTÁCIONAMENTO",
    "ALUGUEL COM MÁQUINAS E EQUIPAMENTOS",
    // 4.12 Segurança
    "TRANSPORTE DE VALORES - SEPARAÇÃO/CONTAGEM", "DIVERSOS SEGURANÇA",
    "SISTEMA MONITOR./CAMERAS E SOFTWARES",
    // 4.13 Tributos
    "TRIBUTOS - FEDERAIS RETENÇÕES (PCC E IRRF)", "TRIBUTOS - MUNICIPAIS (AUTORIZAÇÕES)",
    "TRIBUTOS - FEDERAIS PARCELAMENTO TELLES", "TRIBUTOS - MUNICIPAIS RETENÇÕES",
    // 4.14 Inadimplentes
    "CHEQUES DEVOLVIDOS DENTRO DO MÊS", "CHEQUES DEVOLVIDOS RECEBIDOS",
    // 4.15 Despesas Financeiras
    "DESPESAS BANCÁRIAS", "JUROS DE CONTA GARANTIDA + IOF", "JUROS DE EMPRÉSTIMO",
    "AMORTIZAÇÃO EMPRÉSTIMO", "JUROS USO LIMITE BANCO", "JUROS POR ATRASO DE DUPLICATAS",
    "TAXAS DE CARTÕES", "TAXAS COM P.O.S. e TEF e OUTROS GASTOS",
    "ANUIDADE VOUCHERS - ALIMENTAÇÃO/REFEIÇÃO", "FINANC/LEASING FROTA",
    "FINANC/LEASING INSTALAÇÕES", "EMPRÉSTIMOS", "TARIFAS/MANUTENÇÃO DE CONTA",
    "TARIFA COLETA NUMERÁRIO - PROSEGUR",
    "IMOBILIZADO MÁQUINAS E EQUIPAMENTOS", "IMOBILIZADO AQUISIÇÃO CASAS E TERRENOS",
    "IMOBILIZADO AQUISIÇÃO EQUIP. ADMINISTRATIVO", "IMOBILIZADO AQUISIÇÃO MÓVEIS E UTENSÍLIOS",
    "IMOBILIZADO EDIFÍCIO E CONSTRUÇÕES", "CONSÓRCIOS", "ANTECIPAÇÃO CARTÕES",
    "ABATIMENTO DE BOLETOS (CONTRATOS FINANCEIRO)", "RECARCAS - TENDÊNCIA COMISSÃO 4%",
    "RECEBIMENTOS CONSÓRCIOS", "DIVERSOS FINANCEIROS", "VALE ALIMENTAÇÃO (VR)",
    // 4.16 Despesas Diversas
    "OUTRAS DESPESAS (DIRETORIA)", "OUTRAS DESPESAS (COMERCIAL)",
    "OUTRAS DESPESAS (ADMINISTRATIVA)", "PRÓ-LABORE (1%)", "DESCONTOS / DOAÇÕES",
    // 4.17 Quebras
    "PERDAS", "QUEBRA", "OUTROS",
    // 5 Depreciação
    "DEPRECIAÇÃO",
    // 9 Investimentos
    "9 | INVESTIMENTOS (OUTROS)",
  ],
  "Recebimentos": [
    "Recebimento Cartão Crédito", "Recebimento Cartão Débito", "Recebimento Pix",
    "Recebimento Convênio", "Recebimento Dinheiro", "Outros Recebimentos",
  ],
  "Pagamentos": [
    "Pagamento Fornecedores", "Pagamento Pessoal", "Pagamento Impostos",
    "Pagamento Aluguel", "Pagamento Serviços", "Outros Pagamentos",
  ],
};

// ============ ESTRUTURA DRE ============
export interface DRENode {
  id: string;
  name: string;
  level: number;
  isGroup: boolean;
  isResult: boolean;
  tipo?: string;
  subtipo?: string;
  formula?: string;
  children?: DRENode[];
  subgroups?: DRENode[];
  /** Calculated as percentage of another node's value */
  calcPctOf?: { nodeId: string; pct: number };
}

// Helper to make a child node
function ch(id: string, name: string, subtipo: string): DRENode {
  return { id, name, level: 1, isGroup: false, isResult: false, tipo: "Despesas", subtipo };
}

export const DRE_STRUCTURE_COMERCIAL: DRENode[] = [
  // ===== 1 | FATURAMENTO =====
  {
    id: "faturamento", name: "1 | FATURAMENTO / RECEITA BRUTA (S. TOTAL)", level: 0, isGroup: true, isResult: false, tipo: "Faturamento",
    children: [
      { id: "venda_bruta", name: "RECEITA LIQUIDA", level: 1, isGroup: false, isResult: false, tipo: "Faturamento", subtipo: "Venda Bruta" },
    ],
  },
  // ===== 2.1 | IMPOSTOS (CAIXA) =====
  {
    id: "impostos_caixa", name: "2.1 | IMPOSTOS (CAIXA)", level: 0, isGroup: true, isResult: false, tipo: "Impostos",
    children: [
      { id: "imp_icms", name: "ICMS", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "ICMS" },
      { id: "imp_pis", name: "PIS", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "PIS" },
      { id: "imp_cofins", name: "COFINS", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "COFINS" },
      { id: "imp_outros", name: "OUTROS IMPOSTOS (S/ VENDA)", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "OUTROS IMPOSTOS (S/ VENDA)" },
    ],
  },

  // ===== 1+2 | RECEITA LÍQUIDA =====
  {
    id: "receita_liquida", name: "1+2 | RECEITA LÍQUIDA (SOMA TOTAL)", level: 0, isGroup: false, isResult: true,
    formula: "faturamento - impostos_caixa",
  },

  // ===== 3 | CMV LOJA =====
  {
    id: "cmv", name: "3 | CMV LOJA", level: 0, isGroup: true, isResult: false, tipo: "CMV",
    children: [
      { id: "cmv_merc", name: "CUSTO DA MERCADORIA VENDIDA", level: 1, isGroup: false, isResult: false, tipo: "CMV", subtipo: "CUSTO DA MERCADORIA VENDIDA" },
      { id: "cmv_acougue", name: "MATERIAL PARA INSUMO AÇOUGUE", level: 1, isGroup: false, isResult: false, tipo: "CMV", subtipo: "MATERIAL PARA INSUMO AÇOUGUE" },
      { id: "cmv_padaria", name: "MATERIAL PARA INSUMO PADARIA", level: 1, isGroup: false, isResult: false, tipo: "CMV", subtipo: "MATERIAL PARA INSUMO PADARIA" },
    ],
  },

  // ===== COMPRA DO MÊS =====
  {
    id: "compra_mes", name: "COMPRA DO MÊS", level: 0, isGroup: true, isResult: false, tipo: "Compra do Mês",
    children: [
      { id: "compra_fornec", name: "Pagamento Fornecedores", level: 1, isGroup: false, isResult: false, tipo: "Compra do Mês", subtipo: "COMPRA DO MÊS" },
    ],
  },

  // ===== RESULTADO OPERACIONAL CMV =====
  {
    id: "resultado_op_cmv", name: "RESULTADO OPERACIONAL LIQUIDO (CMV)", level: 0, isGroup: false, isResult: true,
    formula: "receita_liquida - cmv",
  },

  // ===== RESULTADO OPERACIONAL COMPRA MÊS = CMV LOJA - Pagamento Fornecedores =====
  {
    id: "resultado_op_compra", name: "RESULTADO OPERACIONAL LIQUIDO (COMPRA MÊS)", level: 0, isGroup: false, isResult: true,
    formula: "cmv - compra_mes",
  },

  // ===== 4.1 | DESPESAS PESSOAL =====
  {
    id: "desp_pessoal", name: "4.1 | DESPESAS PESSOAL", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dp_salario", "SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)", "SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)"),
      ch("dp_adiant", "ADIANTAMENTO SALARIAL", "ADIANTAMENTO SALARIAL"),
      ch("dp_medicina", "MEDICINA OCUPACIONAL", "MEDICINA OCUPACIONAL"),
      ch("dp_inss", "INSS", "INSS"),
      ch("dp_fgts", "FGTS", "FGTS"),
      ch("dp_fgts_resc", "FGTS (RESCISÃO)", "FGTS (RESCISÃO)"),
      ch("dp_rescisoes", "RESCISÕES", "RESCISÕES"),
      ch("dp_irrf", "IRRF", "IRRF"),
      ch("dp_processo", "PROCESSO TRABALHISTA", "PROCESSO TRABALHISTA"),
      ch("dp_complem", "COMPLEMENTO DE SALÁRIOS / DIFERENÇAS", "COMPLEMENTO DE SALÁRIOS / DIFERENÇAS"),
      ch("dp_13sal", "13° SALÁRIO", "13° SALÁRIO"),
      ch("dp_ferias_prov", "FÉRIAS (PROVISÃO - 1/12 AVOS)", "FÉRIAS (PROVISÃO - 1/12 AVOS)"),
      ch("dp_ferias", "FÉRIAS", "FÉRIAS"),
      ch("dp_uniformes", "UNIFORMES", "UNIFORMES"),
      ch("dp_epi", "COMPRA DE EPI", "COMPRA DE EPI"),
      ch("dp_diarista", "DIARISTA", "DIARISTA"),
      ch("dp_treinam", "TREINAMENTOS", "TREINAMENTOS"),
      ch("dp_hora_extra", "HORA EXTRA", "HORA EXTRA"),
      ch("dp_recrutam", "CONSULTORIA DE RECRUTAMENTO E SELEÇÃO", "CONSULTORIA DE RECRUTAMENTO E SELEÇÃO"),
      ch("dp_assist_med", "ASSISTÊNCIA MÉDICA", "ASSISTÊNCIA MÉDICA"),
      ch("dp_sindical", "CONTRIBUIÇÃO SINDICAL", "CONTRIBUIÇÃO SINDICAL"),
      ch("dp_refeitorio", "REFEITÓRIO", "REFEITÓRIO"),
      ch("dp_doacao", "DOAÇÃO BONUS FUNCIONÁRIO", "DOAÇÃO BONUS FUNCIONÁRIO"),
      ch("dp_convenio", "CONVENIO MERCADO", "CONVENIO MERCADO"),
      ch("dp_transporte", "TRANSPORTE FUNCIONÁRIOS", "TRANSPORTE FUNCIONÁRIOS"),
      ch("dp_outras_func", "OUTRAS DESPESAS (FUNCIONÁRIOS)", "OUTRAS DESPESAS (FUNCIONÁRIOS)"),
      ch("dp_vale_alim", "VALE ALIMENTAÇÃO (VR)", "VALE ALIMENTAÇÃO (VR)"),
    ],
  },

  // ===== 4.1.2 | DESPESAS PESSOAL RATEADAS =====
  {
    id: "desp_pessoal_rat", name: "4.1.2 | DESPESAS PESSOAL RATEADAS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dpr_admin", "PESSOAL ADMINISTRATIVO", "PESSOAL ADMINISTRATIVO"),
      ch("dpr_oper", "PESSOAL OPERACIONAL + TRANSPORTES", "PESSOAL OPERACIONAL + TRANSPORTES"),
      ch("dpr_compras", "PESSOAL COMPRAS + ESTOQUE", "PESSOAL COMPRAS + ESTOQUE"),
    ],
  },

  // ===== 4.2 | PROFISSIONAIS TERCEIRIZADOS =====
  {
    id: "desp_terceirizados", name: "4.2 | PROFISSIONAIS TERCEIRIZADOS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dt_consultoria", "CONSULTORIA - MENSALIDADE", "CONSULTORIA - MENSALIDADE"),
      ch("dt_refrigeracao", "REFRIGERAÇÃO", "REFRIGERAÇÃO"),
      ch("dt_advocacia", "ADVOCACIA", "ADVOCACIA"),
      ch("dt_ti", "TI", "TI"),
      ch("dt_diagfiscal", "DIAGNÓSTICO FISCAL (PIS E COFINS)", "DIAGNÓSTICO FISCAL (PIS E COFINS)"),
      ch("dt_contabilidade", "CONTABILIDADE", "CONTABILIDADE"),
      ch("dt_limpeza", "LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA", "LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA"),
      ch("dt_pontos_rh", "PONTOS DE ACESSO - RH", "PONTOS DE ACESSO - RH"),
      ch("dt_assoc_classe", "ASSOCIAÇÃO DE CLASSE", "ASSOCIAÇÃO DE CLASSE"),
    ],
  },

  // ===== 4.3 | INFORMÁTICA =====
  {
    id: "desp_informatica", name: "4.3 | INFORMÁTICA", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("di_compra_equip", "COMPRA DE EQUIPAMENTOS INFORMÁTICA", "COMPRA DE EQUIPAMENTOS INFORMÁTICA"),
      ch("di_manut_terc", "MANUTENÇÃO TERCERIZADA INFORMÁTICA", "MANUTENÇÃO TERCERIZADA INFORMÁTICA"),
      ch("di_controlware", "CONTROLWARE", "CONTROLWARE"),
      ch("di_internet", "INTERNET/DOMINIO E-MAILs", "INTERNET/DOMINIO E-MAILs"),
      ch("di_internet2", "INTERNET", "INTERNET"),
      ch("di_suprimentos", "SUPRIMENTOS", "SUPRIMENTOS"),
      ch("di_locacao", "LOCAÇÃO DE EQUIPAMENTOS", "LOCAÇÃO DE EQUIPAMENTOS"),
    ],
  },

  // ===== 4.4 | LOJA =====
  {
    id: "desp_loja", name: "4.4 | LOJA", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dl_manut_pred", "MANUTENÇÃO PREDIAL", "MANUTENÇÃO PREDIAL"),
      ch("dl_seguro", "SEGURO", "SEGURO"),
      ch("dl_manut_equip", "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS", "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS"),
      ch("dl_manut_inst", "MANUTENÇÃO - INSTALAÇÕES MAQUINAS E EQUIP.", "MANUTENÇÃO - INSTALAÇÕES MAQUINAS E EQUIP."),
    ],
  },

  // ===== 4.5 | FROTA =====
  {
    id: "desp_frota", name: "4.5 | FROTA", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("df_compra_veic", "COMPRA DE VEÍCULOS", "COMPRA DE VEÍCULOS"),
      ch("df_alug_veic", "ALUGUEL COM VEÍCULOS", "ALUGUEL COM VEÍCULOS"),
      ch("df_manut_veic", "MANUTENÇÃO DE VEÍCULOS", "MANUTENÇÃO DE VEÍCULOS"),
      ch("df_combust", "COMBUSTÍVEIS E LUBRIFICANTES", "COMBUSTÍVEIS E LUBRIFICANTES"),
      ch("df_seguro_veic", "SEGURO E MONITORAMENTO VEÍCULOS", "SEGURO E MONITORAMENTO VEÍCULOS"),
      ch("df_ipva", "IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS", "IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS"),
    ],
  },

  // ===== 4.6 | FRETEIROS =====
  {
    id: "desp_freteiros", name: "4.6 | FRETEIROS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dfr_freteiros", "FRETEIROS / ENTREGAS / BUSCAS MERCADORIAS", "FRETEIROS / ENTREGAS / BUSCAS MERCADORIAS"),
    ],
  },

  // ===== 4.7 | EMBALAGENS =====
  {
    id: "desp_embalagens", name: "4.7 | EMBALAGENS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("de_sacolas", "SACOLAS / EMBALAGENS / BANDEJAS / ETC", "SACOLAS / EMBALAGENS / BANDEJAS / ETC"),
      ch("de_outros", "OUTROS (EMBALAGENS)", "OUTROS (EMBALAGENS)"),
    ],
  },

  // ===== 4.8 | USO CONSUMO =====
  {
    id: "desp_uso_consumo", name: "4.8 | USO CONSUMO", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("duc_mat_esc", "MAT. ESC. / CORREIOS / CARTÓRIOS", "MAT. ESC. / CORREIOS / CARTÓRIOS"),
      ch("duc_mat_uso", "MATERIAL DE USO E CONSUMO", "MATERIAL DE USO E CONSUMO"),
      ch("duc_mat_manut", "MATERIAL PARA MANUTENÇÃO ADM/OPERACIONAL", "MATERIAL PARA MANUTENÇÃO ADM/OPERACIONAL"),
      ch("duc_mat_limp", "MATERIAL P/ LIMPEZA DA LOJA", "MATERIAL P/ LIMPEZA DA LOJA"),
    ],
  },

  // ===== 4.9 | MARKETING =====
  {
    id: "desp_marketing", name: "4.9 | MARKETING", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dm_brindes", "AQUISIÇÃO BRINDES/PRODUTOS (PROMOÇÕES)", "AQUISIÇÃO BRINDES/PRODUTOS (PROMOÇÕES)"),
      ch("dm_tv", "TELEVISÃO", "TELEVISÃO"),
      ch("dm_grafica", "GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)", "GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)"),
      ch("dm_panfleto", "DISTRIBUIÇÃO DO PANFLETO", "DISTRIBUIÇÃO DO PANFLETO"),
      ch("dm_software", "MENSALIDADE SOFTWARE WHATS/RÁDIO", "MENSALIDADE SOFTWARE WHATS/RÁDIO"),
      ch("dm_agencia", "AGÊNCIA/GRAVAÇÃO/LOCUÇÃO", "AGÊNCIA/GRAVAÇÃO/LOCUÇÃO"),
      ch("dm_faixas", "FAIXAS E CARTAZETES (MATERIAL)", "FAIXAS E CARTAZETES (MATERIAL)"),
      ch("dm_carro_som", "CARRO DE SOM", "CARRO DE SOM"),
      ch("dm_decoracao", "ARCO BALÕES - DECORAÇÃO", "ARCO BALÕES - DECORAÇÃO"),
      ch("dm_impuls", "MARKETING (MÍDIAS SOCIAIS) - IMPULSIONAMENTO", "MARKETING (MÍDIAS SOCIAIS) - IMPULSIONAMENTO"),
      ch("dm_cartazista", "CARTAZISTA - M.O. TERCEIRIZADA", "CARTAZISTA - M.O. TERCEIRIZADA"),
      ch("dm_publicidade", "PUBLICIDADE", "PUBLICIDADE"),
      ch("dm_spots", "SPOTS VINHETAS", "SPOTS VINHETAS"),
    ],
  },

  // ===== 4.10 | SERVIÇOS PÚBLICOS =====
  {
    id: "desp_serv_pub", name: "4.10 | SERVIÇOS PÚBLICOS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dsp_agua", "ÁGUA E ESGOTO", "ÁGUA E ESGOTO"),
      ch("dsp_energia", "ENERGIA ELÉTRICA", "ENERGIA ELÉTRICA"),
      ch("dsp_tel_fixa", "TELEFONIA FIXA", "TELEFONIA FIXA"),
      ch("dsp_tel_cel", "TELEFONIA CELULAR", "TELEFONIA CELULAR"),
      ch("dsp_inmetro", "INMETRO/OUTRAS TAXAS", "INMETRO/OUTRAS TAXAS"),
      ch("dsp_gas", "GÁS", "GÁS"),
      ch("dsp_procon", "PROCON", "PROCON"),
      ch("dsp_iptu", "IPTU", "IPTU"),
    ],
  },

  // ===== 4.11 | ALUGUEL =====
  {
    id: "desp_aluguel", name: "4.11 | ALUGUEL", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("da_predial", "ALUGUEL COM TERCEIROS (PREDIAL)", "ALUGUEL COM TERCEIROS (PREDIAL)"),
      ch("da_estacion", "ALUGUEL ESTÁCIONAMENTO", "ALUGUEL ESTÁCIONAMENTO"),
      ch("da_maq_equip", "ALUGUEL COM MÁQUINAS E EQUIPAMENTOS", "ALUGUEL COM MÁQUINAS E EQUIPAMENTOS"),
    ],
  },

  // ===== 4.12 | SEGURANÇA =====
  {
    id: "desp_seguranca", name: "4.12 | SEGURANÇA", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("ds_transp_val", "TRANSPORTE DE VALORES - SEPARAÇÃO/CONTAGEM", "TRANSPORTE DE VALORES - SEPARAÇÃO/CONTAGEM"),
      ch("ds_diversos", "DIVERSOS SEGURANÇA", "DIVERSOS SEGURANÇA"),
      ch("ds_cameras", "SISTEMA MONITOR./CAMERAS E SOFTWARES", "SISTEMA MONITOR./CAMERAS E SOFTWARES"),
    ],
  },

  // ===== 4.13 | TRIBUTOS E OUTROS =====
  {
    id: "desp_tributos", name: "4.13 | TRIBUTOS E OUTROS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dtr_fed_ret", "TRIBUTOS - FEDERAIS RETENÇÕES (PCC E IRRF)", "TRIBUTOS - FEDERAIS RETENÇÕES (PCC E IRRF)"),
      ch("dtr_mun_aut", "TRIBUTOS - MUNICIPAIS (AUTORIZAÇÕES)", "TRIBUTOS - MUNICIPAIS (AUTORIZAÇÕES)"),
      ch("dtr_fed_parc", "TRIBUTOS - FEDERAIS PARCELAMENTO TELLES", "TRIBUTOS - FEDERAIS PARCELAMENTO TELLES"),
      ch("dtr_mun_ret", "TRIBUTOS - MUNICIPAIS RETENÇÕES", "TRIBUTOS - MUNICIPAIS RETENÇÕES"),
    ],
  },

  // ===== 4.14 | INADIMPLENTES =====
  {
    id: "desp_inadimplentes", name: "4.14 | INADIMPLENTES", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("din_cheq_dev", "CHEQUES DEVOLVIDOS DENTRO DO MÊS", "CHEQUES DEVOLVIDOS DENTRO DO MÊS"),
      ch("din_cheq_rec", "CHEQUES DEVOLVIDOS RECEBIDOS", "CHEQUES DEVOLVIDOS RECEBIDOS"),
    ],
  },

  // ===== 4.15 | DESPESAS FINANCEIRAS =====
  {
    id: "desp_financeiras", name: "4.15 | DESPESAS FINANCEIRAS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dfin_bancarias", "DESPESAS BANCÁRIAS", "DESPESAS BANCÁRIAS"),
      ch("dfin_juros_gar", "JUROS DE CONTA GARANTIDA + IOF", "JUROS DE CONTA GARANTIDA + IOF"),
      ch("dfin_juros_emp", "JUROS DE EMPRÉSTIMO", "JUROS DE EMPRÉSTIMO"),
      ch("dfin_amort", "AMORTIZAÇÃO EMPRÉSTIMO", "AMORTIZAÇÃO EMPRÉSTIMO"),
      ch("dfin_juros_lim", "JUROS USO LIMITE BANCO", "JUROS USO LIMITE BANCO"),
      ch("dfin_juros_dup", "JUROS POR ATRASO DE DUPLICATAS", "JUROS POR ATRASO DE DUPLICATAS"),
      ch("dfin_tx_cartoes", "TAXAS DE CARTÕES", "TAXAS DE CARTÕES"),
      ch("dfin_tx_pos", "TAXAS COM P.O.S. e TEF e OUTROS GASTOS", "TAXAS COM P.O.S. e TEF e OUTROS GASTOS"),
      ch("dfin_anuidade", "ANUIDADE VOUCHERS - ALIMENTAÇÃO/REFEIÇÃO", "ANUIDADE VOUCHERS - ALIMENTAÇÃO/REFEIÇÃO"),
      ch("dfin_leas_frota", "FINANC/LEASING FROTA", "FINANC/LEASING FROTA"),
      ch("dfin_leas_inst", "FINANC/LEASING INSTALAÇÕES", "FINANC/LEASING INSTALAÇÕES"),
      ch("dfin_emprest", "EMPRÉSTIMOS", "EMPRÉSTIMOS"),
      ch("dfin_tarifas", "TARIFAS/MANUTENÇÃO DE CONTA", "TARIFAS/MANUTENÇÃO DE CONTA"),
      ch("dfin_prosegur", "TARIFA COLETA NUMERÁRIO - PROSEGUR", "TARIFA COLETA NUMERÁRIO - PROSEGUR"),
      ch("dfin_imob_maq", "IMOBILIZADO MÁQUINAS E EQUIPAMENTOS", "IMOBILIZADO MÁQUINAS E EQUIPAMENTOS"),
      ch("dfin_imob_casas", "IMOBILIZADO AQUISIÇÃO CASAS E TERRENOS", "IMOBILIZADO AQUISIÇÃO CASAS E TERRENOS"),
      ch("dfin_imob_admin", "IMOBILIZADO AQUISIÇÃO EQUIP. ADMINISTRATIVO", "IMOBILIZADO AQUISIÇÃO EQUIP. ADMINISTRATIVO"),
      ch("dfin_imob_moveis", "IMOBILIZADO AQUISIÇÃO MÓVEIS E UTENSÍLIOS", "IMOBILIZADO AQUISIÇÃO MÓVEIS E UTENSÍLIOS"),
      ch("dfin_imob_edif", "IMOBILIZADO EDIFÍCIO E CONSTRUÇÕES", "IMOBILIZADO EDIFÍCIO E CONSTRUÇÕES"),
      ch("dfin_iof", "IOF", "IOF"),
      ch("dfin_consorcios", "CONSÓRCIOS", "CONSÓRCIOS"),
      ch("dfin_antecip", "ANTECIPAÇÃO CARTÕES", "ANTECIPAÇÃO CARTÕES"),
      ch("dfin_abat_bol", "ABATIMENTO DE BOLETOS (CONTRATOS FINANCEIRO)", "ABATIMENTO DE BOLETOS (CONTRATOS FINANCEIRO)"),
      ch("dfin_recargas", "RECARCAS - TENDÊNCIA COMISSÃO 4%", "RECARCAS - TENDÊNCIA COMISSÃO 4%"),
      ch("dfin_rec_cons", "RECEBIMENTOS CONSÓRCIOS", "RECEBIMENTOS CONSÓRCIOS"),
      ch("dfin_diversos", "DIVERSOS FINANCEIROS", "DIVERSOS FINANCEIROS"),
    ],
  },

  // ===== 4.16 | DESPESAS DIVERSAS =====
  {
    id: "desp_diversas", name: "4.16 | DESPESAS DIVERSAS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dd_diretoria", "OUTRAS DESPESAS (DIRETORIA)", "OUTRAS DESPESAS (DIRETORIA)"),
      ch("dd_comercial", "OUTRAS DESPESAS (COMERCIAL)", "OUTRAS DESPESAS (COMERCIAL)"),
      ch("dd_admin", "OUTRAS DESPESAS (ADMINISTRATIVA)", "OUTRAS DESPESAS (ADMINISTRATIVA)"),
      ch("dd_prolabore", "PRÓ-LABORE (1%)", "PRÓ-LABORE (1%)"),
      ch("dd_doacoes", "DESCONTOS / DOAÇÕES", "DESCONTOS / DOAÇÕES"),
    ],
  },

  // ===== 4.17 | QUEBRAS E PERDAS E BAIXA ESTOQUE (2,5% do CMV) =====
  {
    id: "desp_quebras", name: "4.17 | QUEBRAS E PERDAS E BAIXA ESTOQUE (2,5% CMV)", level: 0, isGroup: false, isResult: false,
    calcPctOf: { nodeId: "cmv", pct: 0.025 },
  },

  // ===== 4 | DESPESAS (SOMA TOTAL) =====
  {
    id: "despesas_total", name: "4 | DESPESAS (SOMA TOTAL)", level: 0, isGroup: false, isResult: true,
    formula: "desp_pessoal + desp_pessoal_rat + desp_terceirizados + desp_informatica + desp_loja + desp_frota + desp_freteiros + desp_embalagens + desp_uso_consumo + desp_marketing + desp_serv_pub + desp_aluguel + desp_seguranca + desp_tributos + desp_inadimplentes + desp_financeiras + desp_diversas + desp_quebras",
  },

  // ===== 5 | DEPRECIAÇÃO (0,50% do Faturamento) =====
  {
    id: "depreciacao", name: "5 | DEPRECIAÇÃO (0,50% FATURAMENTO)", level: 0, isGroup: false, isResult: false,
    calcPctOf: { nodeId: "faturamento", pct: 0.005 },
  },

  // ===== EBITDA =====
  {
    id: "ebitda", name: "EBITDA - LUCRO ANTES DO IRPJ E CSLL", level: 0, isGroup: false, isResult: true,
    formula: "receita_liquida - cmv - despesas_total - depreciacao",
  },

  // ===== 8 | IRPJ + CSLL =====
  {
    id: "irpj_csll", name: "8 | IRPJ + CSLL", level: 0, isGroup: true, isResult: false, tipo: "Impostos",
    children: [
      { id: "irpj_val", name: "IRPJ + CSLL", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "8 | IRPJ + CSLL" },
    ],
  },

  // ===== 7 | RESULTADO =====
  {
    id: "resultado", name: "7 | RESULTADO (LUCRO / PREJUÍZO)", level: 0, isGroup: false, isResult: true,
    formula: "ebitda - irpj_csll",
  },

  // ===== 9 | INVESTIMENTOS =====
  {
    id: "investimentos", name: "9 | INVESTIMENTOS (OUTROS)", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("inv_outros", "9 | INVESTIMENTOS (OUTROS)", "9 | INVESTIMENTOS (OUTROS)"),
    ],
  },

  // ===== 10 | RESULTADO OPERACIONAL =====
  {
    id: "resultado_op", name: "10 | RESULTADO OPERACIONAL DO EXERCICIO", level: 0, isGroup: false, isResult: true,
    formula: "resultado - investimentos",
  },

];

// ============ ESTRUTURA FIXA DRE (FINANCEIRO) ============
// Cópia da Comercial, mas: Faturamento = Recebimento, CMV = Pagamento de Fornecedores
// Resultado Financeiro = Recebimento - Pag. Fornecedores - Impostos - Despesas Total - IRPJ/CSLL - Investimentos
export const DRE_STRUCTURE_FINANCEIRO: DRENode[] = [
  // ===== 1 | RECEBIMENTO (= Faturamento na visão financeira) =====
  {
    id: "faturamento", name: "1 | RECEBIMENTO (S. TOTAL)", level: 0, isGroup: true, isResult: false, tipo: "Recebimentos",
    children: [
      { id: "rec_cc", name: "Recebimento Cartão Crédito", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Cartão Crédito" },
      { id: "rec_cd", name: "Recebimento Cartão Débito", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Cartão Débito" },
      { id: "rec_pix", name: "Recebimento Pix", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Pix" },
      { id: "rec_convenio", name: "Recebimento Convênio", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Convênio" },
      { id: "rec_dinheiro", name: "Recebimento Dinheiro", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Recebimento Dinheiro" },
      { id: "rec_outros", name: "Outros Recebimentos", level: 1, isGroup: false, isResult: false, tipo: "Recebimentos", subtipo: "Outros Recebimentos" },
    ],
  },

  // ===== 2.1 | IMPOSTOS (CAIXA) =====
  {
    id: "impostos_caixa", name: "2.1 | IMPOSTOS (CAIXA)", level: 0, isGroup: true, isResult: false, tipo: "Impostos",
    children: [
      { id: "imp_icms", name: "ICMS", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "ICMS" },
      { id: "imp_pis", name: "PIS", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "PIS" },
      { id: "imp_cofins", name: "COFINS", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "COFINS" },
      { id: "imp_outros", name: "OUTROS IMPOSTOS (S/ VENDA)", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "OUTROS IMPOSTOS (S/ VENDA)" },
    ],
  },

  // ===== 1+2 | RECEITA LÍQUIDA =====
  {
    id: "receita_liquida", name: "1+2 | RECEITA LÍQUIDA (SOMA TOTAL)", level: 0, isGroup: false, isResult: true,
    formula: "faturamento - impostos_caixa",
  },

  // ===== 3 | PAGAMENTO DE FORNECEDORES (= CMV na visão financeira) =====
  {
    id: "cmv", name: "3 | PAGAMENTO DE FORNECEDORES", level: 0, isGroup: true, isResult: false, tipo: "Compra do Mês",
    children: [
      { id: "pag_fornec_fin", name: "COMPRA DO MÊS", level: 1, isGroup: false, isResult: false, tipo: "Compra do Mês", subtipo: "COMPRA DO MÊS" },
    ],
  },

  // ===== COMPRA DO MÊS =====
  {
    id: "compra_mes", name: "COMPRA DO MÊS", level: 0, isGroup: true, isResult: false, tipo: "Compra do Mês",
    children: [
      { id: "compra_fornec", name: "Pagamento Fornecedores", level: 1, isGroup: false, isResult: false, tipo: "Compra do Mês", subtipo: "COMPRA DO MÊS" },
    ],
  },

  // ===== RESULTADO OPERACIONAL CMV =====
  {
    id: "resultado_op_cmv", name: "RESULTADO OPERACIONAL LIQUIDO (CMV)", level: 0, isGroup: false, isResult: true,
    formula: "receita_liquida - cmv",
  },

  // ===== RESULTADO OPERACIONAL COMPRA MÊS =====
  {
    id: "resultado_op_compra", name: "RESULTADO OPERACIONAL LIQUIDO (COMPRA MÊS)", level: 0, isGroup: false, isResult: true,
    formula: "cmv - compra_mes",
  },

  // ===== 4.1 a 4.17 - Despesas (idêntico ao Comercial) =====
  {
    id: "desp_pessoal", name: "4.1 | DESPESAS PESSOAL", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dp_salario", "SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)", "SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)"),
      ch("dp_adiant", "ADIANTAMENTO SALARIAL", "ADIANTAMENTO SALARIAL"),
      ch("dp_medicina", "MEDICINA OCUPACIONAL", "MEDICINA OCUPACIONAL"),
      ch("dp_inss", "INSS", "INSS"),
      ch("dp_fgts", "FGTS", "FGTS"),
      ch("dp_fgts_resc", "FGTS (RESCISÃO)", "FGTS (RESCISÃO)"),
      ch("dp_rescisoes", "RESCISÕES", "RESCISÕES"),
      ch("dp_irrf", "IRRF", "IRRF"),
      ch("dp_processo", "PROCESSO TRABALHISTA", "PROCESSO TRABALHISTA"),
      ch("dp_complem", "COMPLEMENTO DE SALÁRIOS / DIFERENÇAS", "COMPLEMENTO DE SALÁRIOS / DIFERENÇAS"),
      ch("dp_13sal", "13° SALÁRIO", "13° SALÁRIO"),
      ch("dp_ferias_prov", "FÉRIAS (PROVISÃO - 1/12 AVOS)", "FÉRIAS (PROVISÃO - 1/12 AVOS)"),
      ch("dp_ferias", "FÉRIAS", "FÉRIAS"),
      ch("dp_uniformes", "UNIFORMES", "UNIFORMES"),
      ch("dp_epi", "COMPRA DE EPI", "COMPRA DE EPI"),
      ch("dp_diarista", "DIARISTA", "DIARISTA"),
      ch("dp_treinam", "TREINAMENTOS", "TREINAMENTOS"),
      ch("dp_hora_extra", "HORA EXTRA", "HORA EXTRA"),
      ch("dp_recrutam", "CONSULTORIA DE RECRUTAMENTO E SELEÇÃO", "CONSULTORIA DE RECRUTAMENTO E SELEÇÃO"),
      ch("dp_assist_med", "ASSISTÊNCIA MÉDICA", "ASSISTÊNCIA MÉDICA"),
      ch("dp_sindical", "CONTRIBUIÇÃO SINDICAL", "CONTRIBUIÇÃO SINDICAL"),
      ch("dp_refeitorio", "REFEITÓRIO", "REFEITÓRIO"),
      ch("dp_doacao", "DOAÇÃO BONUS FUNCIONÁRIO", "DOAÇÃO BONUS FUNCIONÁRIO"),
      ch("dp_convenio", "CONVENIO MERCADO", "CONVENIO MERCADO"),
      ch("dp_transporte", "TRANSPORTE FUNCIONÁRIOS", "TRANSPORTE FUNCIONÁRIOS"),
      ch("dp_outras_func", "OUTRAS DESPESAS (FUNCIONÁRIOS)", "OUTRAS DESPESAS (FUNCIONÁRIOS)"),
      ch("dp_vale_alim", "VALE ALIMENTAÇÃO (VR)", "VALE ALIMENTAÇÃO (VR)"),
    ],
  },
  {
    id: "desp_pessoal_rat", name: "4.1.2 | DESPESAS PESSOAL RATEADAS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dpr_admin", "PESSOAL ADMINISTRATIVO", "PESSOAL ADMINISTRATIVO"),
      ch("dpr_oper", "PESSOAL OPERACIONAL + TRANSPORTES", "PESSOAL OPERACIONAL + TRANSPORTES"),
      ch("dpr_compras", "PESSOAL COMPRAS + ESTOQUE", "PESSOAL COMPRAS + ESTOQUE"),
    ],
  },
  {
    id: "desp_terceirizados", name: "4.2 | PROFISSIONAIS TERCEIRIZADOS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dt_consultoria", "CONSULTORIA - MENSALIDADE", "CONSULTORIA - MENSALIDADE"),
      ch("dt_refrigeracao", "REFRIGERAÇÃO", "REFRIGERAÇÃO"),
      ch("dt_advocacia", "ADVOCACIA", "ADVOCACIA"),
      ch("dt_ti", "TI", "TI"),
      ch("dt_diagfiscal", "DIAGNÓSTICO FISCAL (PIS E COFINS)", "DIAGNÓSTICO FISCAL (PIS E COFINS)"),
      ch("dt_contabilidade", "CONTABILIDADE", "CONTABILIDADE"),
      ch("dt_limpeza", "LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA", "LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA"),
      ch("dt_pontos_rh", "PONTOS DE ACESSO - RH", "PONTOS DE ACESSO - RH"),
      ch("dt_assoc_classe", "ASSOCIAÇÃO DE CLASSE", "ASSOCIAÇÃO DE CLASSE"),
    ],
  },
  {
    id: "desp_informatica", name: "4.3 | INFORMÁTICA", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("di_compra_equip", "COMPRA DE EQUIPAMENTOS INFORMÁTICA", "COMPRA DE EQUIPAMENTOS INFORMÁTICA"),
      ch("di_manut_terc", "MANUTENÇÃO TERCERIZADA INFORMÁTICA", "MANUTENÇÃO TERCERIZADA INFORMÁTICA"),
      ch("di_controlware", "CONTROLWARE", "CONTROLWARE"),
      ch("di_internet", "INTERNET/DOMINIO E-MAILs", "INTERNET/DOMINIO E-MAILs"),
      ch("di_internet2", "INTERNET", "INTERNET"),
      ch("di_suprimentos", "SUPRIMENTOS", "SUPRIMENTOS"),
      ch("di_locacao", "LOCAÇÃO DE EQUIPAMENTOS", "LOCAÇÃO DE EQUIPAMENTOS"),
    ],
  },
  {
    id: "desp_loja", name: "4.4 | LOJA", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dl_manut_pred", "MANUTENÇÃO PREDIAL", "MANUTENÇÃO PREDIAL"),
      ch("dl_seguro", "SEGURO", "SEGURO"),
      ch("dl_manut_equip", "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS", "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS"),
      ch("dl_manut_inst", "MANUTENÇÃO - INSTALAÇÕES MAQUINAS E EQUIP.", "MANUTENÇÃO - INSTALAÇÕES MAQUINAS E EQUIP."),
    ],
  },
  {
    id: "desp_frota", name: "4.5 | FROTA", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("df_compra_veic", "COMPRA DE VEÍCULOS", "COMPRA DE VEÍCULOS"),
      ch("df_alug_veic", "ALUGUEL COM VEÍCULOS", "ALUGUEL COM VEÍCULOS"),
      ch("df_manut_veic", "MANUTENÇÃO DE VEÍCULOS", "MANUTENÇÃO DE VEÍCULOS"),
      ch("df_combust", "COMBUSTÍVEIS E LUBRIFICANTES", "COMBUSTÍVEIS E LUBRIFICANTES"),
      ch("df_seguro_veic", "SEGURO E MONITORAMENTO VEÍCULOS", "SEGURO E MONITORAMENTO VEÍCULOS"),
      ch("df_ipva", "IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS", "IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS"),
    ],
  },
  {
    id: "desp_freteiros", name: "4.6 | FRETEIROS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dfr_freteiros", "FRETEIROS / ENTREGAS / BUSCAS MERCADORIAS", "FRETEIROS / ENTREGAS / BUSCAS MERCADORIAS"),
    ],
  },
  {
    id: "desp_embalagens", name: "4.7 | EMBALAGENS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("de_sacolas", "SACOLAS / EMBALAGENS / BANDEJAS / ETC", "SACOLAS / EMBALAGENS / BANDEJAS / ETC"),
      ch("de_outros", "OUTROS (EMBALAGENS)", "OUTROS (EMBALAGENS)"),
    ],
  },
  {
    id: "desp_uso_consumo", name: "4.8 | USO CONSUMO", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("duc_mat_esc", "MAT. ESC. / CORREIOS / CARTÓRIOS", "MAT. ESC. / CORREIOS / CARTÓRIOS"),
      ch("duc_mat_uso", "MATERIAL DE USO E CONSUMO", "MATERIAL DE USO E CONSUMO"),
      ch("duc_mat_manut", "MATERIAL PARA MANUTENÇÃO ADM/OPERACIONAL", "MATERIAL PARA MANUTENÇÃO ADM/OPERACIONAL"),
      ch("duc_mat_limp", "MATERIAL P/ LIMPEZA DA LOJA", "MATERIAL P/ LIMPEZA DA LOJA"),
    ],
  },
  {
    id: "desp_marketing", name: "4.9 | MARKETING", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dm_brindes", "AQUISIÇÃO BRINDES/PRODUTOS (PROMOÇÕES)", "AQUISIÇÃO BRINDES/PRODUTOS (PROMOÇÕES)"),
      ch("dm_tv", "TELEVISÃO", "TELEVISÃO"),
      ch("dm_grafica", "GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)", "GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)"),
      ch("dm_panfleto", "DISTRIBUIÇÃO DO PANFLETO", "DISTRIBUIÇÃO DO PANFLETO"),
      ch("dm_software", "MENSALIDADE SOFTWARE WHATS/RÁDIO", "MENSALIDADE SOFTWARE WHATS/RÁDIO"),
      ch("dm_agencia", "AGÊNCIA/GRAVAÇÃO/LOCUÇÃO", "AGÊNCIA/GRAVAÇÃO/LOCUÇÃO"),
      ch("dm_faixas", "FAIXAS E CARTAZETES (MATERIAL)", "FAIXAS E CARTAZETES (MATERIAL)"),
      ch("dm_carro_som", "CARRO DE SOM", "CARRO DE SOM"),
      ch("dm_decoracao", "ARCO BALÕES - DECORAÇÃO", "ARCO BALÕES - DECORAÇÃO"),
      ch("dm_impuls", "MARKETING (MÍDIAS SOCIAIS) - IMPULSIONAMENTO", "MARKETING (MÍDIAS SOCIAIS) - IMPULSIONAMENTO"),
      ch("dm_cartazista", "CARTAZISTA - M.O. TERCEIRIZADA", "CARTAZISTA - M.O. TERCEIRIZADA"),
      ch("dm_publicidade", "PUBLICIDADE", "PUBLICIDADE"),
      ch("dm_spots", "SPOTS VINHETAS", "SPOTS VINHETAS"),
    ],
  },
  {
    id: "desp_serv_pub", name: "4.10 | SERVIÇOS PÚBLICOS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dsp_agua", "ÁGUA E ESGOTO", "ÁGUA E ESGOTO"),
      ch("dsp_energia", "ENERGIA ELÉTRICA", "ENERGIA ELÉTRICA"),
      ch("dsp_tel_fixa", "TELEFONIA FIXA", "TELEFONIA FIXA"),
      ch("dsp_tel_cel", "TELEFONIA CELULAR", "TELEFONIA CELULAR"),
      ch("dsp_inmetro", "INMETRO/OUTRAS TAXAS", "INMETRO/OUTRAS TAXAS"),
      ch("dsp_gas", "GÁS", "GÁS"),
      ch("dsp_procon", "PROCON", "PROCON"),
      ch("dsp_iptu", "IPTU", "IPTU"),
    ],
  },
  {
    id: "desp_aluguel", name: "4.11 | ALUGUEL", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("da_predial", "ALUGUEL COM TERCEIROS (PREDIAL)", "ALUGUEL COM TERCEIROS (PREDIAL)"),
      ch("da_estacion", "ALUGUEL ESTÁCIONAMENTO", "ALUGUEL ESTÁCIONAMENTO"),
      ch("da_maq_equip", "ALUGUEL COM MÁQUINAS E EQUIPAMENTOS", "ALUGUEL COM MÁQUINAS E EQUIPAMENTOS"),
    ],
  },
  {
    id: "desp_seguranca", name: "4.12 | SEGURANÇA", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("ds_transp_val", "TRANSPORTE DE VALORES - SEPARAÇÃO/CONTAGEM", "TRANSPORTE DE VALORES - SEPARAÇÃO/CONTAGEM"),
      ch("ds_diversos", "DIVERSOS SEGURANÇA", "DIVERSOS SEGURANÇA"),
      ch("ds_cameras", "SISTEMA MONITOR./CAMERAS E SOFTWARES", "SISTEMA MONITOR./CAMERAS E SOFTWARES"),
    ],
  },
  {
    id: "desp_tributos", name: "4.13 | TRIBUTOS E OUTROS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dtr_fed_ret", "TRIBUTOS - FEDERAIS RETENÇÕES (PCC E IRRF)", "TRIBUTOS - FEDERAIS RETENÇÕES (PCC E IRRF)"),
      ch("dtr_mun_aut", "TRIBUTOS - MUNICIPAIS (AUTORIZAÇÕES)", "TRIBUTOS - MUNICIPAIS (AUTORIZAÇÕES)"),
      ch("dtr_fed_parc", "TRIBUTOS - FEDERAIS PARCELAMENTO TELLES", "TRIBUTOS - FEDERAIS PARCELAMENTO TELLES"),
      ch("dtr_mun_ret", "TRIBUTOS - MUNICIPAIS RETENÇÕES", "TRIBUTOS - MUNICIPAIS RETENÇÕES"),
    ],
  },
  {
    id: "desp_inadimplentes", name: "4.14 | INADIMPLENTES", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("din_cheq_dev", "CHEQUES DEVOLVIDOS DENTRO DO MÊS", "CHEQUES DEVOLVIDOS DENTRO DO MÊS"),
      ch("din_cheq_rec", "CHEQUES DEVOLVIDOS RECEBIDOS", "CHEQUES DEVOLVIDOS RECEBIDOS"),
    ],
  },
  {
    id: "desp_financeiras", name: "4.15 | DESPESAS FINANCEIRAS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dfin_bancarias", "DESPESAS BANCÁRIAS", "DESPESAS BANCÁRIAS"),
      ch("dfin_juros_gar", "JUROS DE CONTA GARANTIDA + IOF", "JUROS DE CONTA GARANTIDA + IOF"),
      ch("dfin_juros_emp", "JUROS DE EMPRÉSTIMO", "JUROS DE EMPRÉSTIMO"),
      ch("dfin_amort", "AMORTIZAÇÃO EMPRÉSTIMO", "AMORTIZAÇÃO EMPRÉSTIMO"),
      ch("dfin_juros_lim", "JUROS USO LIMITE BANCO", "JUROS USO LIMITE BANCO"),
      ch("dfin_juros_dup", "JUROS POR ATRASO DE DUPLICATAS", "JUROS POR ATRASO DE DUPLICATAS"),
      ch("dfin_tx_cartoes", "TAXAS DE CARTÕES", "TAXAS DE CARTÕES"),
      ch("dfin_tx_pos", "TAXAS COM P.O.S. e TEF e OUTROS GASTOS", "TAXAS COM P.O.S. e TEF e OUTROS GASTOS"),
      ch("dfin_anuidade", "ANUIDADE VOUCHERS - ALIMENTAÇÃO/REFEIÇÃO", "ANUIDADE VOUCHERS - ALIMENTAÇÃO/REFEIÇÃO"),
      ch("dfin_leas_frota", "FINANC/LEASING FROTA", "FINANC/LEASING FROTA"),
      ch("dfin_leas_inst", "FINANC/LEASING INSTALAÇÕES", "FINANC/LEASING INSTALAÇÕES"),
      ch("dfin_emprest", "EMPRÉSTIMOS", "EMPRÉSTIMOS"),
      ch("dfin_tarifas", "TARIFAS/MANUTENÇÃO DE CONTA", "TARIFAS/MANUTENÇÃO DE CONTA"),
      ch("dfin_prosegur", "TARIFA COLETA NUMERÁRIO - PROSEGUR", "TARIFA COLETA NUMERÁRIO - PROSEGUR"),
      ch("dfin_imob_maq", "IMOBILIZADO MÁQUINAS E EQUIPAMENTOS", "IMOBILIZADO MÁQUINAS E EQUIPAMENTOS"),
      ch("dfin_imob_casas", "IMOBILIZADO AQUISIÇÃO CASAS E TERRENOS", "IMOBILIZADO AQUISIÇÃO CASAS E TERRENOS"),
      ch("dfin_imob_admin", "IMOBILIZADO AQUISIÇÃO EQUIP. ADMINISTRATIVO", "IMOBILIZADO AQUISIÇÃO EQUIP. ADMINISTRATIVO"),
      ch("dfin_imob_moveis", "IMOBILIZADO AQUISIÇÃO MÓVEIS E UTENSÍLIOS", "IMOBILIZADO AQUISIÇÃO MÓVEIS E UTENSÍLIOS"),
      ch("dfin_imob_edif", "IMOBILIZADO EDIFÍCIO E CONSTRUÇÕES", "IMOBILIZADO EDIFÍCIO E CONSTRUÇÕES"),
      ch("dfin_iof", "IOF", "IOF"),
      ch("dfin_consorcios", "CONSÓRCIOS", "CONSÓRCIOS"),
      ch("dfin_antecip", "ANTECIPAÇÃO CARTÕES", "ANTECIPAÇÃO CARTÕES"),
      ch("dfin_abat_bol", "ABATIMENTO DE BOLETOS (CONTRATOS FINANCEIRO)", "ABATIMENTO DE BOLETOS (CONTRATOS FINANCEIRO)"),
      ch("dfin_recargas", "RECARCAS - TENDÊNCIA COMISSÃO 4%", "RECARCAS - TENDÊNCIA COMISSÃO 4%"),
      ch("dfin_rec_cons", "RECEBIMENTOS CONSÓRCIOS", "RECEBIMENTOS CONSÓRCIOS"),
      ch("dfin_diversos", "DIVERSOS FINANCEIROS", "DIVERSOS FINANCEIROS"),
    ],
  },
  {
    id: "desp_diversas", name: "4.16 | DESPESAS DIVERSAS", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("dd_diretoria", "OUTRAS DESPESAS (DIRETORIA)", "OUTRAS DESPESAS (DIRETORIA)"),
      ch("dd_comercial", "OUTRAS DESPESAS (COMERCIAL)", "OUTRAS DESPESAS (COMERCIAL)"),
      ch("dd_admin", "OUTRAS DESPESAS (ADMINISTRATIVA)", "OUTRAS DESPESAS (ADMINISTRATIVA)"),
      ch("dd_prolabore", "PRÓ-LABORE (1%)", "PRÓ-LABORE (1%)"),
      ch("dd_doacoes", "DESCONTOS / DOAÇÕES", "DESCONTOS / DOAÇÕES"),
    ],
  },
  {
    id: "desp_quebras", name: "4.17 | QUEBRAS E PERDAS E BAIXA ESTOQUE (2,5% CMV)", level: 0, isGroup: false, isResult: false,
    calcPctOf: { nodeId: "cmv", pct: 0.025 },
  },

  // ===== 4 | DESPESAS (SOMA TOTAL) =====
  {
    id: "despesas_total", name: "4 | DESPESAS (SOMA TOTAL)", level: 0, isGroup: false, isResult: true,
    formula: "desp_pessoal + desp_pessoal_rat + desp_terceirizados + desp_informatica + desp_loja + desp_frota + desp_freteiros + desp_embalagens + desp_uso_consumo + desp_marketing + desp_serv_pub + desp_aluguel + desp_seguranca + desp_tributos + desp_inadimplentes + desp_financeiras + desp_diversas + desp_quebras",
  },

  // ===== 5 | DEPRECIAÇÃO =====
  {
    id: "depreciacao", name: "5 | DEPRECIAÇÃO (0,50% RECEBIMENTO)", level: 0, isGroup: false, isResult: false,
    calcPctOf: { nodeId: "faturamento", pct: 0.005 },
  },

  // ===== EBITDA =====
  {
    id: "ebitda", name: "EBITDA - LUCRO ANTES DO IRPJ E CSLL", level: 0, isGroup: false, isResult: true,
    formula: "receita_liquida - cmv - despesas_total - depreciacao",
  },

  // ===== 8 | IRPJ + CSLL =====
  {
    id: "irpj_csll", name: "8 | IRPJ + CSLL", level: 0, isGroup: true, isResult: false, tipo: "Impostos",
    children: [
      { id: "irpj_val", name: "IRPJ + CSLL", level: 1, isGroup: false, isResult: false, tipo: "Impostos", subtipo: "8 | IRPJ + CSLL" },
    ],
  },

  // ===== 7 | RESULTADO =====
  {
    id: "resultado", name: "7 | RESULTADO (LUCRO / PREJUÍZO)", level: 0, isGroup: false, isResult: true,
    formula: "ebitda - irpj_csll",
  },

  // ===== 9 | INVESTIMENTOS =====
  {
    id: "investimentos", name: "9 | INVESTIMENTOS (OUTROS)", level: 0, isGroup: true, isResult: false, tipo: "Despesas",
    children: [
      ch("inv_outros", "9 | INVESTIMENTOS (OUTROS)", "9 | INVESTIMENTOS (OUTROS)"),
    ],
  },

  // ===== 11 | RESULTADO FINANCEIRO =====
  // Recebimento - Pag. Fornecedores - Impostos - Despesas Total - IRPJ/CSLL - Investimentos
  {
    id: "resultado_fin", name: "11 | RESULTADO FINANCEIRO DO EXERCICIO", level: 0, isGroup: false, isResult: true,
    formula: "faturamento - cmv - impostos_caixa - despesas_total - irpj_csll - investimentos",
  },
];

// ============ MOTOR DE CLASSIFICAÇÃO DETERMINÍSTICO ============
const DIRECT_MAP: Record<string, { tipo: string; subtipo: string }> = {
  // ===== IMPOSTOS =====
  "(- ) impostos a pagar sobre a venda": { tipo: "Impostos", subtipo: "ICMS" },
  "icms": { tipo: "Impostos", subtipo: "ICMS" },
  "imposto de renda e csll": { tipo: "Impostos", subtipo: "8 | IRPJ + CSLL" },
  "imposto de renda e csll / ir": { tipo: "Impostos", subtipo: "8 | IRPJ + CSLL" },
  "ir": { tipo: "Impostos", subtipo: "IRRF" },
  "simples": { tipo: "Impostos", subtipo: "OUTROS IMPOSTOS (S/ VENDA)" },
  "iof": { tipo: "Despesas", subtipo: "IOF" },
  "iof bancario": { tipo: "Despesas", subtipo: "IOF" },

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
  "telefonoa celular": { tipo: "Despesas", subtipo: "TELEFONIA CELULAR" },

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

function normalizeStr(s: string): string {
  return (s || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const NORMALIZED_MAP = new Map<string, { tipo: string; subtipo: string }>();
for (const [key, val] of Object.entries(DIRECT_MAP)) {
  NORMALIZED_MAP.set(normalizeStr(key), val);
}

export function classifyDeterministic(descricao: string, tipoHint?: string): { tipo: string; subtipo: string } {
  const normalized = normalizeStr(descricao);
  const hintNormalized = tipoHint ? normalizeStr(tipoHint) : "";

  if (hintNormalized && normalized) {
    const compoundKey = `${hintNormalized} / ${normalized}`;
    const compound = NORMALIZED_MAP.get(compoundKey);
    if (compound) return compound;
  }

  const exactDesc = NORMALIZED_MAP.get(normalized);
  if (exactDesc) return exactDesc;

  if (hintNormalized) {
    const exactHint = NORMALIZED_MAP.get(hintNormalized);
    if (exactHint) return exactHint;
  }

  for (const [key, val] of NORMALIZED_MAP.entries()) {
    if (key.length >= 4 && normalized.includes(key)) return val;
  }

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

  const allChildSubtipos = new Map<string, Set<string>>();
  for (const node of structure) {
    if (node.isGroup && node.tipo && node.children) {
      const existing = allChildSubtipos.get(node.tipo) || new Set<string>();
      for (const child of node.children) {
        if (child.subtipo) existing.add(child.subtipo);
      }
      allChildSubtipos.set(node.tipo, existing);
    }
  }

  // Step 1: calculate group totals
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
      } else {
        total = groupLancs.reduce((s, l) => s + l.valor, 0);
      }
      values.set(node.id, total);
    }
  }

  // Step 1.5: calculate percentage-based nodes (Depreciação = 0.5% fat, Quebras = 2.5% CMV)
  for (const node of structure) {
    if (node.calcPctOf) {
      const baseVal = values.get(node.calcPctOf.nodeId) || 0;
      values.set(node.id, Math.abs(baseVal) * node.calcPctOf.pct);
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
