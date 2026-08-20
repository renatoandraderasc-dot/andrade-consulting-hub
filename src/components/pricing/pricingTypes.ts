export interface ConcorrenteInfo {
  id: string;
  nome: string;
  host: string;
  praca_esperada: string | null;
  /** data da coleta mais recente */
  coletadoEm: string | null;
  /** lojista/praça que a API resolveu na coleta */
  lojista: string | null;
  totalLinhas: number;
  semEan: number;
}

export interface PrecoConcorrenteCell {
  /** preço válido (somente quando disponivel = true) */
  preco: number | null;
  /** preço de item sem estoque — nunca usado em comparação */
  precoAuditoria: number | null;
  disponivel: boolean;
  promocaoMultipla: string[];
  coletadoEm: string | null;
}

export interface PricingRow {
  codigo: string;
  descricao: string;
  ean: string;
  imagem: string | null;
  meuPreco: number;
  custo: number;
  qtdVendas: number;
  vlrVendas: number;
  curva: "A" | "B" | "C";
  mercadologico: string;
  /** por concorrente_id */
  concorrentes: Record<string, PrecoConcorrenteCell>;
  /** menor preço disponível entre os concorrentes filtrados */
  melhorPrecoConcorrente: number | null;
  status: "barato" | "caro" | "igual" | "sem_vinculo";
}

export const soDigitos = (s: unknown) =>
  String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");

export const eanUtilizavel = (s: unknown) => {
  const d = soDigitos(s);
  return d.length >= 8 ? d : "";
};
