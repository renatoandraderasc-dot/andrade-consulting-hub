/** Estatísticas dos preços praticados nas outras lojas da rede. */
export interface InternaStats {
  min: number;
  max: number;
  media: number;
  lojas: number;
  detalhe: { loja: string; preco: number }[];
}

/** Concorrente com coleta disponível (uma coluna por concorrente). */
export interface ConcorrenteMeta {
  id: string;
  nome: string;
  coletadoEm: string | null;
}

export interface ConcorrenteCell {
  preco: number;
  coletadoEm: string | null;
}

export interface RepricingRow {
  id: string;
  ean: string;
  descricao: string;
  custo: number;
  precoAtual: number;
  mercadologico: string;
  /** preços por concorrente_id — ausência de chave = concorrente não tem o item */
  concorrentes: Record<string, ConcorrenteCell>;
  /** null quando nenhuma outra loja da rede tem o item */
  interna: InternaStats | null;
}

/** Linha já avaliada contra uma base de comparação escolhida. */
export interface RepricingAvaliada extends RepricingRow {
  precoRef: number | null;
  refNome: string;
  diferenca: number;
  diferencaPct: number;
  status: "acima" | "abaixo" | "igual" | "sem_ref";
  novoPreco: number | null;
  novaMargem: number | null;
}

export const soDigitos = (v: unknown) =>
  String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");

export const eanValido = (v: unknown) => {
  const d = soDigitos(v);
  return d.length >= 8 ? d : "";
};
