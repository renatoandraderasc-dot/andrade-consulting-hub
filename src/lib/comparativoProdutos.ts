// Regras da tela "Comparativo de Departamentos e Produtos".
// Compara dois intervalos de meses livres (Período A x Período B),
// agregando do departamento até o produto.

export type Nivel = "departamento" | "grupo" | "subgrupo" | "produto";
export const NIVEIS: Nivel[] = ["departamento", "grupo", "subgrupo", "produto"];

/** Linha de produto já normalizada, de um mês. */
export interface ProdutoMes {
  mes: string; // yyyy-MM
  codigo: string;
  descricao: string;
  barras: string;
  departamento: string;
  grupo: string;
  subgrupo: string;
  volume: number;
  venda: number;
  custo: number;
}

export interface Metricas {
  venda: number;
  custo: number;
  lucro: number;
  volume: number;
  mix: number; // produtos que venderam
}

export const metricasVazias = (): Metricas => ({ venda: 0, custo: 0, lucro: 0, volume: 0, mix: 0 });

export interface LinhaComparativo {
  chave: string;
  rotulo: string;
  codigo?: string;
  barras?: string;
  departamento: string;
  grupo: string;
  subgrupo: string;
  a: Metricas;
  b: Metricas;
}

/** Lista de meses (yyyy-MM) de `inicio` até `fim`, inclusive. Inverte se vierem trocados. */
export function mesesEntre(inicio: string, fim: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}$/.test(fim)) return [];
  let [y, m] = inicio.split("-").map(Number);
  let [by, bm] = fim.split("-").map(Number);
  if (y * 12 + m > by * 12 + bm) [y, m, by, bm] = [by, bm, y, m];
  const out: string[] = [];
  while (y * 12 + m <= by * 12 + bm) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Primeiro e último dia (yyyy-MM-dd) de um mês yyyy-MM. */
export function limitesMes(mes: string): { de: string; ate: string } {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** Desloca um mês yyyy-MM em `n` meses. */
export function somarMeses(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Variação % de B sobre A. Sem base (A = 0) => null. */
export function variacaoPct(a: number, b: number): number | null {
  if (!a) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

export const margemPct = (m: Metricas) => (m.venda > 0 ? (m.lucro / m.venda) * 100 : 0);
export const precoMedio = (m: Metricas) => (m.volume > 0 ? m.venda / m.volume : 0);

function chaveNivel(p: ProdutoMes, nivel: Nivel): { chave: string; rotulo: string } {
  if (nivel === "departamento") return { chave: p.departamento, rotulo: p.departamento };
  if (nivel === "grupo") return { chave: `${p.departamento}|${p.grupo}`, rotulo: p.grupo || "SEM GRUPO" };
  if (nivel === "subgrupo") return { chave: `${p.departamento}|${p.grupo}|${p.subgrupo}`, rotulo: p.subgrupo || "SEM SUBGRUPO" };
  return { chave: p.codigo, rotulo: p.descricao || p.codigo };
}

/**
 * Agrega as linhas de produto no nível pedido, separando o que caiu
 * nos meses do Período A e nos do Período B. Um mês que esteja nos
 * dois períodos conta nos dois.
 */
export function agregar(
  linhas: ProdutoMes[],
  nivel: Nivel,
  mesesA: Set<string>,
  mesesB: Set<string>,
): LinhaComparativo[] {
  const mapa = new Map<string, LinhaComparativo>();
  const mixA = new Map<string, Set<string>>();
  const mixB = new Map<string, Set<string>>();
  for (const p of linhas) {
    const emA = mesesA.has(p.mes), emB = mesesB.has(p.mes);
    if (!emA && !emB) continue;
    const { chave, rotulo } = chaveNivel(p, nivel);
    let l = mapa.get(chave);
    if (!l) {
      l = {
        chave, rotulo,
        codigo: nivel === "produto" ? p.codigo : undefined,
        barras: nivel === "produto" ? p.barras : undefined,
        departamento: p.departamento, grupo: p.grupo, subgrupo: p.subgrupo,
        a: metricasVazias(), b: metricasVazias(),
      };
      mapa.set(chave, l);
    }
    const somar = (m: Metricas, mix: Map<string, Set<string>>) => {
      m.venda += p.venda;
      m.custo += p.custo;
      m.lucro += p.venda - p.custo;
      m.volume += p.volume;
      if (p.venda > 0) {
        const s = mix.get(chave) ?? new Set<string>();
        s.add(p.codigo);
        mix.set(chave, s);
      }
    };
    if (emA) somar(l.a, mixA);
    if (emB) somar(l.b, mixB);
  }
  for (const l of mapa.values()) {
    l.a.mix = mixA.get(l.chave)?.size ?? 0;
    l.b.mix = mixB.get(l.chave)?.size ?? 0;
  }
  return [...mapa.values()];
}

/** Situação do item entre os períodos. */
export type Situacao = "novo" | "perdido" | "cresceu" | "caiu" | "estavel";
export function situacao(l: LinhaComparativo, toleranciaPct = 0.5): Situacao {
  if (l.a.venda <= 0 && l.b.venda > 0) return "novo";
  if (l.a.venda > 0 && l.b.venda <= 0) return "perdido";
  const v = variacaoPct(l.a.venda, l.b.venda) ?? 0;
  if (Math.abs(v) < toleranciaPct) return "estavel";
  return v > 0 ? "cresceu" : "caiu";
}
