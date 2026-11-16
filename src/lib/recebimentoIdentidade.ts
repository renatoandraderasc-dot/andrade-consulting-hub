// Explicit projection: never load invoice quantities or prices into counting.
export const RECEIPT_IDENTITY_COLUMNS = 'id,seq_xml,codproduto,descricao_xml,descricao_produto,ean,eans_cadastro';
export type ReceiptIdentity = {
  id: string; seq_xml: number; codproduto: number | null;
  descricao_xml: string | null; descricao_produto: string | null;
  ean: string | null; eans_cadastro: string | null;
};
export type IdentityCount = { codproduto: number | null; ean: string | null; rodada: number };
export function identityEans(item: Pick<ReceiptIdentity, 'ean' | 'eans_cadastro'>) {
  return [item.ean || '', ...(item.eans_cadastro || '').split(/[,;\s|]+/)].map(v => v.trim()).filter(Boolean);
}
export function identityCounted(item: ReceiptIdentity, counts: IdentityCount[], round: number) {
  const eans = new Set(identityEans(item));
  return counts.some(count => count.rodada === round && (
    (item.codproduto != null && count.codproduto === item.codproduto) ||
    (!!count.ean && eans.has(count.ean.trim()))
  ));
}