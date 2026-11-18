// Explicit projection: never load invoice quantities or prices into counting.
export const RECEIPT_IDENTITY_COLUMNS = 'id,seq_xml,codproduto,descricao_xml,descricao_produto,ean,eans_cadastro,cprod,ref_cadastro';
export type ReceiptIdentity = {
  id: string | number; seq_xml: number; codproduto: number | null;
  descricao_xml: string | null; descricao_produto: string | null;
  ean: string | null; eans_cadastro: string | null;
  cprod: string | null; ref_cadastro: string | null;
};
export type IdentityCount = { codproduto: number | null; ean: string | null; rodada: number; seq_vinculado?:number|null };
export function identityEans(item: Pick<ReceiptIdentity, 'ean' | 'eans_cadastro'>) {
  return [item.ean || '', ...(item.eans_cadastro || '').split(/[,;\s|]+/)].map(v => v.trim()).filter(Boolean);
}
export function identityCounted(item: ReceiptIdentity, counts: IdentityCount[], round: number) {
  const eans = new Set(identityEans(item));
  return counts.some(count => count.rodada === round && (
    count.seq_vinculado != null ? count.seq_vinculado === item.seq_xml : (
    (item.codproduto != null && count.codproduto === item.codproduto) ||
    (!!count.ean && [...eans].some(e => e.replace(/^0+/,'') === count.ean?.trim().replace(/^0+/,''))))
  ));
}