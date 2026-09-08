// ============================================================
// Classificacao automatica DETERMINISTICA de lancamentos.
// Usada quando o de-para (vr_lancamento_map) nao tem o id_tipo.
// Nunca usa IA: apenas palavras-chave sobre
// (nome do tipo de entrada + fornecedor + documento + observacao).
// ============================================================

export interface ClassAuto {
  tipo: string;
  subtipo: string;
  regra: string;
}

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Regra = [RegExp, string, string];

// Ordem importa: da regra mais especifica para a mais generica.
const REGRAS: Regra[] = [
  // ---------- COMPRA DE MERCADORIA ----------
  [/compra de mercadoria para revenda|mercadoria p\/? revenda|revenda/, "Compra do Mês", "COMPRA DO MÊS"],
  [/compra c financeiro|compra de mercadoria|compra mercadoria|compras de mercadoria/, "Compra do Mês", "COMPRA DO MÊS"],
  [/duplicata|fornecedor|nota fiscal de entrada|nf entrada|nfe entrada|boleto fornecedor/, "Compra do Mês", "COMPRA DO MÊS"],

  // ---------- INSUMOS (CMV) ----------
  [/insumo.*acougue|acougue.*insumo/, "CMV", "MATERIAL PARA INSUMO AÇOUGUE"],
  [/insumo.*padaria|padaria.*insumo/, "CMV", "MATERIAL PARA INSUMO PADARIA"],
  [/c\.?m\.?v|custo da mercadoria/, "CMV", "CUSTO DA MERCADORIA VENDIDA"],

  // ---------- IMPOSTOS ----------
  [/\bicms\b|difal|antecipacao icms|icms antecipacao|substituicao tributaria/, "Impostos", "ICMS"],
  [/\bpis\b/, "Impostos", "PIS"],
  [/cofins/, "Impostos", "COFINS"],
  [/irpj|csll|imposto de renda/, "Impostos", "8 | IRPJ + CSLL"],
  [/\birrf\b/, "Impostos", "IRRF"],
  [/simples nacional|\bdas\b|imposto federal|imposto municipal|imposto sobre venda/, "Impostos", "OUTROS IMPOSTOS (S/ VENDA)"],

  // ---------- PESSOAL ----------
  [/adiantamento salarial|vale salario|adiantamento de salario/, "Despesas", "ADIANTAMENTO SALARIAL"],
  [/13.? salario|decimo terceiro/, "Despesas", "13° SALÁRIO"],
  [/rescis/, "Despesas", "RESCISÕES"],
  [/\bferias\b/, "Despesas", "FÉRIAS"],
  [/\bfgts\b/, "Despesas", "FGTS"],
  [/\binss\b|previdencia|gps /, "Despesas", "INSS"],
  [/hora extra/, "Despesas", "HORA EXTRA"],
  [/salario|folha de pagamento|folha pagamento|remunerac/, "Despesas", "SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)"],
  [/vale transporte|transporte funcionario|passe escolar|bilhete unico/, "Despesas", "TRANSPORTE FUNCIONÁRIOS"],
  [/vale alimentacao|vale refeicao|ticket|sodexo|alelo|\bvr\b benefic/, "Despesas", "VALE ALIMENTAÇÃO (VR)"],
  [/assistencia medica|plano de saude|unimed|odonto/, "Despesas", "ASSISTÊNCIA MÉDICA"],
  [/medicina ocupacional|exame admissional|pcmso|ppra|sesmt/, "Despesas", "MEDICINA OCUPACIONAL"],
  [/uniforme/, "Despesas", "UNIFORMES"],
  [/\bepi\b|equipamento de protecao/, "Despesas", "COMPRA DE EPI"],
  [/free lance|freelance|diarista|mao de obra temporaria/, "Despesas", "DIARISTA"],
  [/sindica/, "Despesas", "CONTRIBUIÇÃO SINDICAL"],
  [/treinamento|curso/, "Despesas", "TREINAMENTOS"],
  [/processo trabalhista|acao trabalhista|reclamatoria/, "Despesas", "PROCESSO TRABALHISTA"],
  [/refeitorio|lanche|refeicao/, "Despesas", "REFEITÓRIO"],

  // ---------- SERVICOS PUBLICOS ----------
  [/energia eletrica|energia|\bcpfl\b|\benel\b|elektro|light |cemig|coelba|eletropaulo|energisa/, "Despesas", "ENERGIA ELÉTRICA"],
  [/agua e esgoto|\bagua\b|sabesp|saae|\bsanea|copasa|daev/, "Despesas", "ÁGUA E ESGOTO"],
  [/\bgas\b|ultragaz|liquigas|supergasbras/, "Despesas", "GÁS"],
  [/telefonia celular|celular|\bvivo\b|claro |\btim\b|oi movel/, "Despesas", "TELEFONIA CELULAR"],
  [/telefonia fixa|telefone/, "Despesas", "TELEFONIA FIXA"],
  [/internet|link dedicado|banda larga|provedor|fibra/, "Despesas", "INTERNET"],
  [/\biptu\b/, "Despesas", "IPTU"],
  [/inmetro|ipem|taxa de fiscalizacao|alvara|vigilancia sanitaria/, "Despesas", "INMETRO/OUTRAS TAXAS"],
  [/procon/, "Despesas", "PROCON"],

  // ---------- ALUGUEL ----------
  [/aluguel estacionamento/, "Despesas", "ALUGUEL ESTÁCIONAMENTO"],
  [/aluguel de maquina|locacao de equipamento|aluguel equipamento/, "Despesas", "ALUGUEL COM MÁQUINAS E EQUIPAMENTOS"],
  [/aluguel|locacao predial|imobiliaria/, "Despesas", "ALUGUEL COM TERCEIROS (PREDIAL)"],

  // ---------- FROTA / FRETE ----------
  [/combustivel|combustiveis|posto de|gasolina|diesel|lubrificante/, "Despesas", "COMBUSTÍVEIS E LUBRIFICANTES"],
  [/ipva|pedagio|licenciamento|multa de transito|detran/, "Despesas", "IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS"],
  [/manutencao de veiculo|manutencao veiculo|oficina|pneu|autopec/, "Despesas", "MANUTENÇÃO DE VEÍCULOS"],
  [/seguro.*veiculo|rastreador|monitoramento de veiculo/, "Despesas", "SEGURO E MONITORAMENTO VEÍCULOS"],
  [/frete|transportadora|entrega|carreto|logistica/, "Despesas", "FRETEIROS / ENTREGAS / BUSCAS MERCADORIAS"],

  // ---------- EMBALAGENS / USO E CONSUMO ----------
  [/sacola|embalagem|embalagens|bandeja|filme pvc|rotulo|etiqueta|bobina/, "Despesas", "SACOLAS / EMBALAGENS / BANDEJAS / ETC"],
  [/material de limpeza|produto de limpeza|limpeza da loja/, "Despesas", "MATERIAL P/ LIMPEZA DA LOJA"],
  [/material de escritorio|papelaria|cartorio|correio|sedex/, "Despesas", "MAT. ESC. / CORREIOS / CARTÓRIOS"],
  [/uso e consumo|material de consumo|utensilio/, "Despesas", "MATERIAL DE USO E CONSUMO"],
  [/material para manutencao|ferragem|eletrica|hidraulica|tinta/, "Despesas", "MATERIAL PARA MANUTENÇÃO ADM/OPERACIONAL"],

  // ---------- MANUTENCAO ----------
  [/refrigeracao|camara fria|climatizacao|ar condicionado/, "Despesas", "REFRIGERAÇÃO"],
  [/manutencao de equipamento|manutencao maquina|balanca|fatiador|conserto/, "Despesas", "MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS"],
  [/manutencao predial|manutencao do predio|obra|reforma|pintura/, "Despesas", "MANUTENÇÃO PREDIAL"],
  [/dedetiza|desinsetiza|controle de praga|limpeza quimica/, "Despesas", "LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA"],

  // ---------- TERCEIROS / SERVICOS ----------
  [/contabilidade|contabil|escritorio contabil/, "Despesas", "CONTABILIDADE"],
  [/advocacia|advogad|juridic/, "Despesas", "ADVOCACIA"],
  [/consultoria|assessoria/, "Despesas", "CONSULTORIA - MENSALIDADE"],
  [/informatica|automacao|software|sistema|licenca|\bti\b|suporte tecnico/, "Despesas", "TI"],
  [/transporte de valores|prosegur|brinks|tecban|malote/, "Despesas", "TRANSPORTE DE VALORES - SEPARAÇÃO/CONTAGEM"],
  [/vigilancia|seguranca|alarme|monitoramento|cftv|camera/, "Despesas", "SISTEMA MONITOR./CAMERAS E SOFTWARES"],
  [/associacao|apas|sincovaga|federacao/, "Despesas", "ASSOCIAÇÃO DE CLASSE"],

  // ---------- MARKETING ----------
  [/grafica|panfleto|encarte|jornal de oferta|impressao/, "Despesas", "GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)"],
  [/cartazista/, "Despesas", "CARTAZISTA - M.O. TERCEIRIZADA"],
  [/radio|locucao|spot|vinheta|carro de som/, "Despesas", "AGÊNCIA/GRAVAÇÃO/LOCUÇÃO"],
  [/publicidade|propaganda|marketing|midia social|impulsionamento|anuncio/, "Despesas", "PUBLICIDADE"],
  [/brinde|sorteio|promocao/, "Despesas", "AQUISIÇÃO BRINDES/PRODUTOS (PROMOÇÕES)"],

  // ---------- FINANCEIRAS ----------
  [/taxa de cartao|taxas de cartao|cielo|getnet|rede s\.?a|stone|pagseguro|adquirente/, "Despesas", "TAXAS DE CARTÕES"],
  [/antecipacao de cartao|antecipacao cartao|antecipacao de receb/, "Despesas", "ANTECIPAÇÃO CARTÕES"],
  [/consorcio/, "Despesas", "CONSÓRCIOS"],
  [/leasing|financiamento de veiculo|finame/, "Despesas", "FINANC/LEASING FROTA"],
  [/emprestimo|capital de giro|amortizacao/, "Despesas", "EMPRÉSTIMOS"],
  [/\bjuros\b|encargo financeiro|mora/, "Despesas", "JUROS POR ATRASO DE DUPLICATAS"],
  [/tarifa|manutencao de conta|cesta de servico|despesa bancaria|\biof\b/, "Despesas", "TARIFAS/MANUTENÇÃO DE CONTA"],
  [/cheque devolvido/, "Despesas", "CHEQUES DEVOLVIDOS DENTRO DO MÊS"],
  [/\bseguro\b|seguradora/, "Despesas", "SEGURO"],

  // ---------- OUTRAS ----------
  [/pro.?labore|retirada socio|distribuicao de lucro/, "Despesas", "PRÓ-LABORE (1%)"],
  [/doacao|dizimo|contribuicao social/, "Despesas", "DESCONTOS / DOAÇÕES"],
  [/imobilizado|aquisicao de equipamento|movel e utensilio|investimento/, "Despesas", "9 | INVESTIMENTOS (OUTROS)"],
  [/perda|quebra/, "Despesas", "QUEBRA"],
  [/servico|prestacao de servico|manutencao/, "Despesas", "OUTRAS DESPESAS (ADMINISTRATIVA)"],
];

export interface EntradaAuto {
  /** Nome do tipo de entrada informado pelo ERP (mais confiavel). */
  nomeTipo?: string | null;
  fornecedor?: string | null;
  descricao?: string | null;
  observacao?: string | null;
  /** true quando a linha e um titulo de fornecedor (tem documento). */
  temDocumento?: boolean;
}

/**
 * Sempre devolve uma classificacao — o usuario corrige depois se precisar.
 */
export function classificarAuto(e: EntradaAuto): ClassAuto {
  const nome = norm(e.nomeTipo || "");
  const resto = norm([e.fornecedor, e.descricao, e.observacao].filter(Boolean).join(" "));
  const nomeUtil = nome && !/nao cadastrado|sem tipo|outros?$|^cap$|^-$/.test(nome);

  // 1) pelo nome do tipo de entrada do ERP
  if (nomeUtil) {
    for (const [re, tipo, subtipo] of REGRAS) {
      if (re.test(nome)) return { tipo, subtipo, regra: `tipo:${nome}` };
    }
  }

  // 2) pelo fornecedor / historico do titulo
  if (resto) {
    for (const [re, tipo, subtipo] of REGRAS) {
      if (re.test(resto)) return { tipo, subtipo, regra: "texto" };
    }
  }

  // 3) titulo de fornecedor sem pista nenhuma = compra de mercadoria
  if (e.temDocumento || e.fornecedor) {
    return { tipo: "Compra do Mês", subtipo: "COMPRA DO MÊS", regra: "titulo-fornecedor" };
  }

  return { tipo: "Despesas", subtipo: "OUTRAS DESPESAS (ADMINISTRATIVA)", regra: "padrao" };
}
