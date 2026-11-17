type Linha = { codproduto: number | null; descricao_produto: unknown; ean: string | null; cprod: string; eans_cadastro: string | null; ref_cadastro: string | null };
type Relatorio = (store: string, nome: string, params: Record<string, unknown>) => Promise<Record<string, unknown>[]>;

export async function identificarProdutos(linhas: Linha[], store: string, codfornec: number | null, rel: Relatorio) {
  for (const l of linhas) {
    if (l.codproduto && l.eans_cadastro) continue;
    if (l.ean) {
      try {
        const pr = (await rel(store, 'produto_por_ean', { ean: l.ean }))[0];
        if (pr?.codproduto) {
          l.codproduto = Number(pr.codproduto);
          l.descricao_produto = String(pr.descricao ?? '') || null;
          l.eans_cadastro = String(pr.eans_cadastro ?? '') || null;
        }
      } catch { /* A referência ainda pode resolver um EAN indisponível. */ }
    }
    if (!l.codproduto && l.cprod && codfornec) {
      try {
        const pr = (await rel(store, 'produto_por_reffornec', { codfornec, ref: l.cprod }))[0];
        if (pr?.codproduto) {
          l.codproduto = Number(pr.codproduto);
          l.descricao_produto = String(pr.descricao ?? '') || null;
          l.eans_cadastro = String(pr.eans_cadastro ?? '') || null;
          l.ref_cadastro = String(pr.ref_cadastro ?? '') || null;
        }
      } catch { /* Segue sem código quando não há cadastro disponível. */ }
    }
  }
}