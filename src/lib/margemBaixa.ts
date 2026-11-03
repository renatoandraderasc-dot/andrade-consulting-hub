// Regras da tela "Produtos com Margem Baixa".
// Margem = lucro / venda. O lucro usa o mesmo criterio de custo das outras
// telas (lucroDaLinha), entao os numeros batem com Dashboard e PIC.

export interface ProdutoMargem {
  venda: number;
  custo: number;
  qtd: number;
}

/** Margem em % sobre a venda. Sem venda => 0. */
export const margemPct = (venda: number, custo: number) =>
  venda > 0 ? ((venda - custo) / venda) * 100 : 0;

/** Lucro que faltou para o produto chegar na margem alvo (nunca negativo). */
export const lucroQueFalta = (venda: number, custo: number, alvoPct: number) =>
  Math.max(0, venda * (alvoPct / 100) - (venda - custo));

/** Preço unitário que entrega a margem alvo, pelo custo unitário médio do período. */
export const precoParaMargem = (custo: number, qtd: number, alvoPct: number): number | null => {
  if (qtd <= 0 || custo <= 0 || alvoPct >= 100) return null;
  return custo / qtd / (1 - alvoPct / 100);
};

/** Produto entra na lista quando vendeu e a margem ficou abaixo do alvo. */
export const abaixoDoAlvo = (venda: number, custo: number, alvoPct: number) =>
  venda > 0 && margemPct(venda, custo) < alvoPct;
