export type Face = "capa" | "verso";
export type Faixa = "vermelho" | "amarelo" | "neutro";

export interface ItemEncarte {
  id?: string;
  encarte_id?: string;
  face: Face;
  posicao: number;
  tipo_faixa: Faixa | string;
  departamento: string | null;
  categoria: string | null;
  codigo: string | null;
  descricao: string | null;
  ean?: string | null;
  custo: number | null;
  pmz: number | null;
  venda_atual: number | null;
  margem_atual: number | null;
  preco_oferta: number | null;
  margem_oferta: number | null;
  estoque?: number | null;
  giro_90d?: number | null;
  volume_30d?: number | null;
  score?: number | null;
  origem?: string;
  motivo?: Record<string, unknown> | null;
  alerta?: string | null;
  ciente?: boolean;
  travado?: boolean;
  aprovado?: boolean;
  observacao?: string | null;
  ordem?: number;
}

export interface Alternativa {
  codigo: string;
  descricao: string;
  ean: string | null;
  custo: number;
  pmz: number;
  preco_venda: number;
  margem_atual: number;
  preco_oferta: number;
  score: number;
  motivo: Record<string, number>;
  categoria: string;
  volume_30d: number;
  estoque: number;
  preco_concorrente: number | null;
  concorrente: string | null;
}

export interface CalendarioRow {
  id: string;
  nome: string;
  tipo_faixa: string;
  dia_inicio: number;
  dia_fim: number;
  agv_pct: number;
  ordem: number;
  modelo_id: string | null;
}

export interface ModeloRow {
  id: string;
  nome: string;
  padrao: boolean;
}

export interface SlotRow {
  id: string;
  modelo_id: string;
  face: Face;
  posicao: number;
  tipo_faixa: string;
  departamento: string | null;
  categoria: string | null;
}

export interface CategoriaRow {
  id: string;
  nome: string;
  departamento: string | null;
  termos: string[];
  vermelho: boolean;
  amarelo: boolean;
  neutro: boolean;
  ordem: number;
}

export interface RegraRow {
  id: string;
  tipo_faixa: string;
  margem_minima_pct: number;
  desconto_max_pct: number;
  janela_giro_dias: number;
  peso_giro: number;
  peso_margem: number;
  peso_concorrente: number;
  peso_estoque: number;
}

export const faixaLabel = (f: string) =>
  f === "vermelho" ? "Vermelho" : f === "amarelo" ? "Amarelo" : "Neutro";

export const faixaClass = (f: string) =>
  f === "vermelho"
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : f === "amarelo"
      ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30"
      : "bg-muted text-muted-foreground border-border";

export const pct = (v: number | null | undefined) =>
  v == null || isNaN(Number(v)) ? "—" : `${Number(v).toFixed(1)}%`;
