export interface Produto {
  id: string;
  codigo_interno: string | null;
  ean: string | null;
  descricao: string;
  secao: string | null;
  categoria: string | null;
  subcategoria: string | null;
  unidade: string;
  preco_regular: number | null;
  imagem_url: string | null;
}

export interface EncarteItem {
  id?: string;
  encarte_id?: string;
  produto_id: string | null;
  produto?: Produto | null;
  preco_oferta: number;
  preco_de: number | null;
  destaque: boolean;
  ordem: number;
  observacao: string | null;
}

export interface Encarte {
  id?: string;
  nome: string;
  tema: string;
  formato: string;
  colunas: number;
  titulo: string | null;
  validade_de: string | null;
  validade_ate: string | null;
  loja_nome: string | null;
  loja_telefone: string | null;
  loja_endereco: string | null;
  loja_logo_url: string | null;
}
