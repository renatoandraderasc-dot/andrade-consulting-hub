export interface Lancamento {
  id: string;
  store_id: string;
  user_id: string;
  data: string;
  competencia_mes: number;
  competencia_ano: number;
  tipo: string;
  subtipo: string;
  descricao: string | null;
  valor: number;
  observacao: string | null;
  status: string;
  origem?: string | null;
  origem_ref?: string | null;

  created_at: string;
  updated_at: string;
}

export const TIPOS_LANCAMENTO = [
  "Vendas",
  "Impostos",
  "CMV",
  "Despesas",
  "Recebíveis",
  "Outras Receitas",
  "Despesas Financeiras",
  "Resultado Operacional",
  "EBITDA",
  "Ajustes",
  "Lucro / Prejuízo",
] as const;

export const SUBCONTAS: Record<string, string[]> = {
  "Vendas": ["Venda Bruta", "Devoluções", "Cancelamentos", "Descontos concedidos"],
  "Impostos": ["ICMS", "PIS", "COFINS", "Simples", "Outros impostos"],
  "CMV": ["Custo de mercadoria vendida", "Perdas", "Quebras", "Ajustes de estoque"],
  "Despesas": [
    "Folha", "Aluguel", "Energia", "Água", "Internet",
    "Manutenção", "Marketing", "Serviços de terceiros",
    "Despesas administrativas", "Outras despesas",
  ],
  "Recebíveis": ["Cartão crédito", "Cartão débito", "Pix", "Convênio", "Carteira", "Outros recebíveis"],
  "Outras Receitas": ["Bonificação", "Receita financeira", "Comissões", "Outras entradas"],
  "Despesas Financeiras": ["Juros", "Taxas bancárias", "Tarifas de cartão", "Multas", "Encargos"],
  "Ajustes": ["Ajuste contábil", "Reclassificação", "Provisões", "Estornos"],
  "Resultado Operacional": ["Resultado operacional"],
  "EBITDA": ["EBITDA"],
  "Lucro / Prejuízo": ["Lucro / Prejuízo"],
};
