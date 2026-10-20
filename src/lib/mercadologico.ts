import { pick } from "@/lib/vrReport";

export const MERCADOLOGICOS_INICIAIS = ["PADARIA", "AÇOUGUE", "HORTIFRUTI"];

export const normalizarMercadologico = (valor: unknown) =>
  String(valor ?? "").trim().toUpperCase();

export const mercadologicoNivel1 = (linha: unknown) => normalizarMercadologico(pick(
  linha,
  "m1_departamento", "mercadologico1", "mercadologico_1", "merc1",
  "n1", "nivel1", "departamento", "secao", "desc_secao", "descricao_secao",
  "sec", "dept", "grupo_1",
));

export const mercadologicoNivel2 = (linha: unknown) => normalizarMercadologico(pick(
  linha,
  "m2_grupo", "mercadologico2", "mercadologico_2", "merc2",
  "n2", "nivel2", "grupo", "categoria", "grupo_2",
));

export const mercadologicoNivel3 = (linha: unknown) => normalizarMercadologico(pick(
  linha,
  "m3_subgrupo", "mercadologico3", "mercadologico_3", "merc3",
  "n3", "nivel3", "subgrupo", "subcategoria", "grupo_3",
));

const BALDE_OUTROS = new Set(["OUTROS", "OUTRAS", "DEMAIS"]);
const numero = (v: unknown) => parseFloat(String(v ?? "")) || 0;

/**
 * Algumas pontes (padrao DIRECTOR, ex.: Medeiros) agrupam quase tudo num
 * departamento "OUTROS". Quando o ranking por produto traz o mercadologico de
 * cada item, a linha OUTROS e aberta pelos departamentos reais, rateando o
 * proprio valor de OUTROS pelo peso de cada departamento no ranking — o total
 * continua igual ao do relatorio original.
 */
export function abrirDepartamentoOutros<T extends Record<string, any>>(linhas: T[], ranking: any[]): T[] {
  const temOutros = linhas.some((l) => BALDE_OUTROS.has(mercadologicoNivel1(l)));
  if (!temOutros || !ranking?.length) return linhas;
  const explicitos = new Set(
    linhas.map((l) => mercadologicoNivel1(l)).filter((d) => d && !BALDE_OUTROS.has(d)),
  );
  const pesos = new Map<string, { venda: number; custo: number; volume: number; mix: number }>();
  for (const r of ranking) {
    const d = mercadologicoNivel1(r);
    if (!d || BALDE_OUTROS.has(d) || explicitos.has(d)) continue;
    const p = pesos.get(d) ?? { venda: 0, custo: 0, volume: 0, mix: 0 };
    p.venda += numero(pick(r, "valor", "venda", "vendas", "total_vendido", "valor_venda"));
    p.custo += numero(pick(r, "custo", "cmv"));
    p.volume += numero(pick(r, "qtd", "quantidade", "volume", "qtde"));
    p.mix += 1;
    pesos.set(d, p);
  }
  const totalVenda = [...pesos.values()].reduce((s, p) => s + p.venda, 0);
  if (totalVenda <= 0) return linhas;

  const saida: T[] = [];
  for (const l of linhas) {
    if (!BALDE_OUTROS.has(mercadologicoNivel1(l))) { saida.push(l); continue; }
    for (const [dep, p] of pesos) {
      const peso = p.venda / totalVenda;
      const nova: Record<string, any> = {};
      for (const [k, v] of Object.entries(l)) {
        const kl = k.toLowerCase();
        if (["departamento", "secao", "mercadologico1", "n1", "nivel1", "m1_departamento"].includes(kl)) nova[k] = dep;
        else if (kl === "mix") nova[k] = p.mix;
        else if (typeof v === "number" || (/^-?\d+(\.\d+)?$/.test(String(v)) && !["data", "dia", "loja"].includes(kl))) {
          nova[k] = /pct|perc/.test(kl) ? v : numero(v) * peso;
        } else nova[k] = v;
      }
      if (!("departamento" in nova) && !("secao" in nova)) nova.departamento = dep;
      saida.push(nova as T);
    }
  }
  return saida;
}