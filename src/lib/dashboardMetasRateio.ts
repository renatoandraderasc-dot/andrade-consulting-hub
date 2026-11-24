export interface LinhaMetaDashboard {
  date: string;
  department: string;
  [key: string]: unknown;
}

export interface PeriodoMes {
  ano: number;
  mes: number;
}

export interface PeriodoDatas {
  inicio: string;
  fim: string;
}

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

const mesAnterior = (ano: number, mes: number): PeriodoMes => {
  const d = new Date(Date.UTC(ano, mes - 2, 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
};

/** Doze meses realmente fechados antes do mês exibido, sem olhar para meses futuros. */
export function intervalo12MesesFechados(
  anoAlvo: number,
  mesAlvo: number,
  ultimoFechado: PeriodoMes,
): PeriodoDatas {
  const anterior = mesAnterior(anoAlvo, mesAlvo);
  const fim = anterior.ano * 12 + anterior.mes <= ultimoFechado.ano * 12 + ultimoFechado.mes
    ? anterior
    : ultimoFechado;
  const inicioData = new Date(Date.UTC(fim.ano, fim.mes - 12, 1));
  const inicioAno = inicioData.getUTCFullYear();
  const inicioMes = inicioData.getUTCMonth() + 1;
  const ultimoDia = new Date(Date.UTC(fim.ano, fim.mes, 0)).getUTCDate();
  return { inicio: iso(inicioAno, inicioMes, 1), fim: iso(fim.ano, fim.mes, ultimoDia) };
}

export function mesesDoPeriodo(periodo: PeriodoDatas): PeriodoDatas[] {
  const out: PeriodoDatas[] = [];
  const d = new Date(`${periodo.inicio}T12:00:00Z`);
  while (d.toISOString().slice(0, 10) <= periodo.fim) {
    const ano = d.getUTCFullYear();
    const mes = d.getUTCMonth() + 1;
    out.push({ inicio: iso(ano, mes, 1), fim: iso(ano, mes, new Date(Date.UTC(ano, mes, 0)).getUTCDate()) });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/** Maiores restos: preserva exatamente o total, inclusive centavos e volumes. */
export function ratearValor(total: number, participacoes: number[], casasDecimais: number): number[] {
  if (!participacoes.length) return [];
  const fator = 10 ** casasDecimais;
  const sinal = total < 0 ? -1 : 1;
  const unidades = Math.round(Math.abs(Number(total) || 0) * fator);
  const somaPesos = participacoes.reduce((s, p) => s + Math.max(0, p), 0);
  if (somaPesos <= 0) return participacoes.map(() => 0);

  const brutos = participacoes.map((p, indice) => {
    const bruto = unidades * (Math.max(0, p) / somaPesos);
    return { indice, valor: Math.floor(bruto), resto: bruto - Math.floor(bruto) };
  });
  let restante = unidades - brutos.reduce((s, b) => s + b.valor, 0);
  const ordem = [...brutos].sort((a, b) => b.resto - a.resto || a.indice - b.indice);
  for (let i = 0; restante > 0; i = (i + 1) % ordem.length) {
    brutos[ordem[i].indice].valor += 1;
    restante -= 1;
  }
  return brutos.map((b) => sinal * b.valor / fator);
}

const CAMPOS_RATEADOS = [
  ["meta_vendas", 2],
  ["meta_lucro", 2],
  ["meta_volume", 3],
  ["projecao_vendas", 2],
  ["projecao_lucro", 2],
  ["projecao_volume", 3],
] as const;

/**
 * Fallback visual: mantém as linhas LOJA originais e cria linhas derivadas por
 * departamento somente quando não existe nenhuma meta departamental no período.
 */
export function ratearMetasLoja<T extends LinhaMetaDashboard>(
  linhas: T[],
  participacoes: Record<string, number>,
): { linhas: T[]; rateada: boolean } {
  const canonica = (dep: string) => {
    const d = String(dep || "").trim().toUpperCase();
    return d === "GERAL" || d === "TOTAL" ? "LOJA" : d;
  };
  if (linhas.some((l) => canonica(l.department) !== "LOJA")) return { linhas, rateada: false };
  const lojas = linhas.filter((l) => canonica(l.department) === "LOJA");
  const deps = Object.entries(participacoes)
    .filter(([dep, peso]) => canonica(dep) !== "LOJA" && Number(peso) > 0)
    .map(([dep, peso]) => [canonica(dep), Number(peso)] as const)
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  if (!lojas.length || !deps.length) return { linhas, rateada: false };

  const derivadas: T[] = [];
  for (const loja of lojas) {
    const valores = new Map<string, number[]>();
    for (const [campo, casas] of CAMPOS_RATEADOS) {
      valores.set(campo, ratearValor(Number(loja[campo]) || 0, deps.map((d) => d[1]), casas));
    }
    deps.forEach(([dep], i) => {
      const linha = {
        ...loja,
        department: dep,
        __meta_rateada_dashboard: true,
      } as T;
      for (const [campo] of CAMPOS_RATEADOS) {
        (linha as Record<string, unknown>)[campo] = valores.get(campo)?.[i] ?? 0;
      }
      const vendas = Number((linha as Record<string, unknown>).meta_vendas) || 0;
      const lucro = Number((linha as Record<string, unknown>).meta_lucro) || 0;
      const projVendas = Number((linha as Record<string, unknown>).projecao_vendas) || 0;
      const projLucro = Number((linha as Record<string, unknown>).projecao_lucro) || 0;
      (linha as Record<string, unknown>).meta_margem_pct = vendas > 0 ? (lucro / vendas) * 100 : 0;
      (linha as Record<string, unknown>).projecao_margem_pct = projVendas > 0 ? (projLucro / projVendas) * 100 : 0;
      derivadas.push(linha);
    });
  }
  return { linhas: [...linhas, ...derivadas], rateada: true };
}
