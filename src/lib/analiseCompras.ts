// Regras de negocio da tela Analise de Compras.

export type StatusVariacao = "alta" | "queda" | "estavel" | "primeira" | "bonificacao";
export type StatusAlcada = "na" | "fora" | "critico" | "sem";

export interface LimiteAlcada {
  store_id: string | null;
  departamento: string;
  limite_dentro_dias: number;
  limite_fora_dias: number;
  limite_variacao_pct: number;
}

export const LIMITE_PADRAO: LimiteAlcada = {
  store_id: null, departamento: "", limite_dentro_dias: 15, limite_fora_dias: 30, limite_variacao_pct: 5,
};

const norm = (s: string) => String(s ?? "").trim().toUpperCase();

/** Ordem: loja+departamento -> padrao+departamento -> padrao geral. */
export function buscarLimite(lista: LimiteAlcada[], storeId: string, departamento: string): LimiteAlcada {
  const d = norm(departamento);
  return (
    lista.find((l) => l.store_id === storeId && norm(l.departamento) === d) ||
    lista.find((l) => l.store_id === null && d && norm(l.departamento) === d) ||
    lista.find((l) => l.store_id === null && norm(l.departamento) === "") ||
    LIMITE_PADRAO
  );
}

export function statusVariacao(
  custo: number, custoAnterior: number | null, variacaoPct: number | null, limitePct: number,
): StatusVariacao {
  if (!(custo > 0)) return "bonificacao";
  if (custoAnterior == null || !(custoAnterior > 0) || variacaoPct == null) return "primeira";
  if (variacaoPct > limitePct) return "alta";
  if (variacaoPct < -limitePct) return "queda";
  return "estavel";
}

/** (custo atual - custo anterior) x qtd; 0 quando nao ha comparacao. */
export function impactoVariacao(custo: number, custoAnterior: number | null, qtd: number): number {
  if (!(custo > 0) || custoAnterior == null || !(custoAnterior > 0)) return 0;
  return (custo - custoAnterior) * qtd;
}

export function statusAlcada(
  coberturaDias: number | null, vendaMediaDia: number, limDentro: number, limFora: number,
): StatusAlcada {
  if (!(vendaMediaDia > 0) || coberturaDias == null) return "sem";
  if (coberturaDias <= limDentro) return "na";
  if (coberturaDias <= limFora) return "fora";
  return "critico";
}

export const compraApos30 = (diasDesdeUltima: number | null) => diasDesdeUltima != null && diasDesdeUltima > 30;

const PESO_ALCADA: Record<StatusAlcada, number> = { sem: 0, na: 1, fora: 2, critico: 3 };
export const piorAlcada = (a: StatusAlcada, b: StatusAlcada) => (PESO_ALCADA[b] > PESO_ALCADA[a] ? b : a);
