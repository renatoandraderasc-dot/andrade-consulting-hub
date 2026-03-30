export interface ProdutoBase {
  ean: string;
  descricao: string;
  custo: number;
  precoAtual: number;
  mercadologico: string;
}

export interface ConcorrenteBase {
  ean: string;
  preco: number;
  oferta: number;
  descricao?: string;
}

export interface AuxiliarBase {
  ean: string;
  descricao: string;
  [key: string]: unknown;
}

export interface RepricingRow {
  id: string;
  ean: string;
  descricao: string;
  custo: number;
  precoAtual: number;
  mercadologico: string;
  precoConcorrente: number;
  diferenca: number;
  status: "acima" | "abaixo" | "igual";
  novoPreco: number;
  novaMargem: number;
  matchType: "ean" | "ia" | null;
  confiancaIA?: number;
}
