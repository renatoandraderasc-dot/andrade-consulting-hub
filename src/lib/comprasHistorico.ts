interface MovimentoHistorico {
  venda: number;
  cmv: number;
  compra: number;
}

/** Soma apenas as linhas exibidas; percentuais usam os totais, não a média mensal. */
export function totalizarHistoricoCompras(linhas: MovimentoHistorico[]) {
  const totais = linhas.reduce<MovimentoHistorico & { excesso: number }>((acc, linha) => {
    const venda = Number(linha.venda) || 0;
    const cmv = Number(linha.cmv) || 0;
    const compra = Number(linha.compra) || 0;
    acc.venda += venda;
    acc.cmv += cmv;
    acc.compra += compra;
    acc.excesso += Math.max(compra - cmv, 0);
    return acc;
  }, { venda: 0, cmv: 0, compra: 0, excesso: 0 });
  return {
    ...totais,
    saldo: totais.cmv - totais.compra,
    cmvv: totais.venda > 0 ? totais.cmv / totais.venda * 100 : 0,
    cv: totais.venda > 0 ? totais.compra / totais.venda * 100 : 0,
  };
}