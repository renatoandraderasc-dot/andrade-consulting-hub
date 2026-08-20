import { useMemo } from "react";
import type { RepricingRow, ConcorrenteMeta, InternaStats } from "./repricingTypes";
import { eanValido } from "./repricingTypes";

function toNum(val: unknown): number {
  if (typeof val === "number") return val;
  const s = String(val ?? "0").replace(/[^\d.,-]/g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

function findCol(row: Record<string, unknown>, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find((k) => k.toLowerCase().trim().includes(c.toLowerCase()));
    if (found) return found;
  }
  return undefined;
}

const EAN_COLS = ["ean", "barcode", "codigo_barras", "cod_barras", "barras", "gtin", "código de barras"];

export interface RepricingDiagnostico {
  produtosTotal: number;
  produtosComEan: number;
  produtosSemEan: number;
  concorrentesTotal: number;
  concorrentesComEan: number;
  concorrentesSemEan: number;
}

export function useRepricingDiagnostico(
  produtos: Record<string, unknown>[],
  concorrentes: Record<string, unknown>[],
): RepricingDiagnostico {
  return useMemo(() => {
    const colP = produtos.length ? findCol(produtos[0], EAN_COLS) : undefined;
    const colC = concorrentes.length ? findCol(concorrentes[0], EAN_COLS) : undefined;
    const pOk = produtos.filter((p) => eanValido(p[colP ?? ""])).length;
    const cOk = concorrentes.filter((c) => eanValido(c[colC ?? ""])).length;
    return {
      produtosTotal: produtos.length,
      produtosComEan: pOk,
      produtosSemEan: produtos.length - pOk,
      concorrentesTotal: concorrentes.length,
      concorrentesComEan: cOk,
      concorrentesSemEan: concorrentes.length - cOk,
    };
  }, [produtos, concorrentes]);
}

export interface RepricingDados {
  rows: RepricingRow[];
  concorrentesMeta: ConcorrenteMeta[];
}

/**
 * Cruza o cadastro da loja com todas as coletas de concorrentes e com os
 * preços das demais lojas da rede, sempre pelo código de barras normalizado.
 * Ausência de informação nunca vira zero: fica fora do mapa.
 */
export function useRepricingProcessor(
  produtos: Record<string, unknown>[],
  concorrentes: Record<string, unknown>[],
  interna: Record<string, unknown>[],
): RepricingDados {
  return useMemo<RepricingDados>(() => {
    if (!produtos.length || !concorrentes.length) return { rows: [], concorrentesMeta: [] };

    // ---- concorrentes: mapa EAN -> { concId -> preco } ------------------
    const metaMap = new Map<string, ConcorrenteMeta>();
    const concPorEan = new Map<string, Record<string, { preco: number; coletadoEm: string | null }>>();

    for (const c of concorrentes) {
      const ean = eanValido(c.ean ?? c["EAN"]);
      if (!ean) continue;
      const id = String(c.concorrente_id ?? "concorrente");
      const nome = String(c.concorrente_nome ?? "Concorrente");
      const coletadoEm = (c.coletado_em as string) ?? null;

      const anterior = metaMap.get(id);
      if (!anterior || (coletadoEm && (!anterior.coletadoEm || coletadoEm > anterior.coletadoEm))) {
        metaMap.set(id, { id, nome, coletadoEm: coletadoEm ?? anterior?.coletadoEm ?? null });
      }

      const oferta = toNum(c.oferta);
      const preco = oferta > 0 ? oferta : toNum(c.preco);
      if (preco <= 0) continue;

      const atual = concPorEan.get(ean) ?? {};
      const jaTem = atual[id];
      if (!jaTem || preco < jaTem.preco) atual[id] = { preco, coletadoEm };
      concPorEan.set(ean, atual);
    }

    // ---- base interna: mapa EAN -> lojas x preço ------------------------
    const internaPorEan = new Map<string, { loja: string; preco: number }[]>();
    for (const i of interna) {
      const ean = eanValido(i.ean);
      if (!ean) continue;
      const preco = toNum(i.preco);
      if (preco <= 0) continue;
      const loja = String(i.loja ?? "Outra loja");
      const lista = internaPorEan.get(ean) ?? [];
      if (!lista.some((l) => l.loja === loja)) lista.push({ loja, preco });
      internaPorEan.set(ean, lista);
    }

    // ---- produtos da loja ------------------------------------------------
    const sampleP = produtos[0];
    const colEanP = findCol(sampleP, EAN_COLS);
    const colDescP = findCol(sampleP, ["descricao", "descrição", "produto", "nome", "item"]);
    const colCustoP = findCol(sampleP, ["custo", "preco_custo", "vlr_custo"]);
    const colPrecoP = findCol(sampleP, ["preco", "preço", "preco_venda", "vlr_venda", "preco_atual"]);
    const colMercP = findCol(sampleP, ["mercadologico", "mercadológico", "categoria", "departamento", "setor", "secao"]);

    const rows: RepricingRow[] = [];
    for (let i = 0; i < produtos.length; i++) {
      const p = produtos[i];
      const ean = eanValido(p[colEanP ?? ""]);
      if (!ean) continue;

      const cells = concPorEan.get(ean);
      if (!cells || !Object.keys(cells).length) continue;

      const listaInterna = internaPorEan.get(ean) ?? [];
      let internaStats: InternaStats | null = null;
      if (listaInterna.length) {
        const precos = listaInterna.map((l) => l.preco);
        internaStats = {
          min: Math.min(...precos),
          max: Math.max(...precos),
          media: precos.reduce((s, v) => s + v, 0) / precos.length,
          lojas: precos.length,
          detalhe: [...listaInterna].sort((a, b) => a.preco - b.preco),
        };
      }

      rows.push({
        id: `${i}-${ean}`,
        ean,
        descricao: String(p[colDescP ?? ""] ?? "Sem descrição"),
        custo: toNum(p[colCustoP ?? ""]),
        precoAtual: toNum(p[colPrecoP ?? ""]),
        mercadologico: String(p[colMercP ?? ""] ?? "Outros"),
        concorrentes: cells,
        interna: internaStats,
      });
    }

    const concorrentesMeta = [...metaMap.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    return { rows, concorrentesMeta };
  }, [produtos, concorrentes, interna]);
}
