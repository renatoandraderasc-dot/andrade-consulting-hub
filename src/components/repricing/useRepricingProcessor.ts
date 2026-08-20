import { useMemo } from "react";
import type { RepricingRow } from "./repricingTypes";

function normalize(val: unknown): string {
  return String(val ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

function toNum(val: unknown): number {
  if (typeof val === "number") return val;
  const s = String(val ?? "0").replace(/[^\d.,-]/g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

function findCol(row: Record<string, unknown>, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase().trim().includes(c.toLowerCase()));
    if (found) return found;
  }
  return undefined;
}

const EAN_COLS = ["ean", "codigo_barras", "cod_barras", "barcode", "barras", "gtin", "código de barras"];

/** EAN válido = pelo menos 8 dígitos (descarta vazios, "0" e códigos internos curtos). */
function eanValido(v: unknown): string {
  const d = normalize(v);
  return d.length >= 8 ? d : "";
}

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

export function useRepricingProcessor(
  produtos: Record<string, unknown>[],
  concorrentes: Record<string, unknown>[],
  auxiliar: Record<string, unknown>[]
) {
  return useMemo<RepricingRow[]>(() => {
    if (!produtos.length || !concorrentes.length) return [];

    const sampleP = produtos[0];
    const colEanP = findCol(sampleP, EAN_COLS);
    const colDescP = findCol(sampleP, ["descricao", "descrição", "produto", "nome", "item"]);
    const colCustoP = findCol(sampleP, ["custo", "preco_custo", "preço_custo", "vlr_custo"]);
    const colPrecoP = findCol(sampleP, ["preco", "preço", "preco_venda", "preço_venda", "vlr_venda", "preco_atual"]);
    const colMercP = findCol(sampleP, ["mercadologico", "mercadológico", "categoria", "departamento", "setor", "secao"]);

    const sampleC = concorrentes[0];
    const colEanC = findCol(sampleC, EAN_COLS);
    const colPrecoC = findCol(sampleC, ["preco", "preço", "preco_normal", "preço_normal", "vlr_venda"]);
    const colOfertaC = findCol(sampleC, ["oferta", "preco_oferta", "preço_oferta", "promocao", "promoção", "vlr_oferta"]);

    // Build concorrente map by EAN
    const concMap = new Map<string, { preco: number; oferta: number; desc?: string }>();
    for (const c of concorrentes) {
      const ean = eanValido(c[colEanC ?? ""]);
      if (!ean) continue;
      const descCol = findCol(c, ["descricao", "descrição", "produto", "nome"]);
      concMap.set(ean, {
        preco: toNum(c[colPrecoC ?? ""]),
        oferta: toNum(c[colOfertaC ?? ""]),
        desc: descCol ? String(c[descCol] ?? "") : undefined,
      });
    }

    const rows: RepricingRow[] = [];

    for (let i = 0; i < produtos.length; i++) {
      const p = produtos[i];
      const ean = eanValido(p[colEanP ?? ""]);
      const descricao = String(p[colDescP ?? ""] ?? "Sem descrição");
      const custo = toNum(p[colCustoP ?? ""]);
      const precoAtual = toNum(p[colPrecoP ?? ""]);
      const mercadologico = String(p[colMercP ?? ""] ?? "Outros");

      const conc = ean ? concMap.get(ean) : undefined;

      if (!conc) continue; // Skip unmatched for now (AI matching later)

      const precoConcorrente = conc.oferta > 0 ? conc.oferta : conc.preco;
      const diferenca = precoAtual - precoConcorrente;
      const status: RepricingRow["status"] =
        diferenca > 0.005 ? "acima" : diferenca < -0.005 ? "abaixo" : "igual";
      const novoPreco = precoConcorrente - 0.01;
      const novaMargem = novoPreco > 0 ? ((novoPreco - custo) / novoPreco) * 100 : 0;

      rows.push({
        id: `${i}-${ean}`,
        ean,
        descricao,
        custo,
        precoAtual,
        mercadologico,
        precoConcorrente,
        diferenca,
        status,
        novoPreco,
        novaMargem,
        matchType: "ean",
      });
    }

    return rows;
  }, [produtos, concorrentes, auxiliar]);
}
