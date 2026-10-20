export interface TvDimensoes {
  largura_m: number | null;
  altura_m: number | null;
  resolucao_largura: number | null;
  resolucao_altura: number | null;
  colunas: number;
  linhas: number;
}

export function validarDimensoes(d: TvDimensoes): string | null {
  if (![d.colunas, d.linhas].every(v => Number.isInteger(v) && v >= 1 && v <= 16)) return "Informe entre 1 e 16 telas por linha e coluna.";
  if ([d.largura_m, d.altura_m, d.resolucao_largura, d.resolucao_altura].some(v => v !== null && (!Number.isFinite(v) || v <= 0))) return "As dimensões e a resolução devem ser maiores que zero.";
  if ((d.resolucao_largura === null) !== (d.resolucao_altura === null)) return "Informe largura e altura da resolução, ou deixe ambas vazias.";
  if ([d.resolucao_largura, d.resolucao_altura].some(v => v !== null && !Number.isInteger(v))) return "A resolução deve ser um número inteiro de pixels.";
  return null;
}

export function dimensoesTotais(d: TvDimensoes) {
  const larguraPx = d.resolucao_largura ? d.resolucao_largura * d.colunas : null;
  const alturaPx = d.resolucao_altura ? d.resolucao_altura * d.linhas : null;
  const larguraM = d.largura_m ? d.largura_m * d.colunas : null;
  const alturaM = d.altura_m ? d.altura_m * d.linhas : null;
  const proporcao = larguraPx && alturaPx ? larguraPx / alturaPx : larguraM && alturaM ? larguraM / alturaM : null;
  return { larguraPx, alturaPx, larguraM, alturaM, proporcao };
}