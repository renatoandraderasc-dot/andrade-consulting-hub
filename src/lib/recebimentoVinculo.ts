import type { ReceiptIdentity, IdentityCount } from './recebimentoIdentidade';
import { identityEans } from './recebimentoIdentidade';
export const eanNormalizado = (v: string | null) => (v || '').replace(/\D/g,'').replace(/^0+/,'');
export function itemDaContagem(items:ReceiptIdentity[], count:IdentityCount) {
  if (count.seq_vinculado != null) return items.find(i => i.seq_xml === count.seq_vinculado);
  return items.find(i => (i.codproduto != null && i.codproduto === count.codproduto) || (!!eanNormalizado(count.ean) && identityEans(i).some(e => eanNormalizado(e) === eanNormalizado(count.ean))));
}
export function avisoVinculo(websac:string|null) {
  if (websac === 'VINCULADO') return {sucesso:true,texto:'EAN gravado no WebSac'};
  if (websac?.startsWith('EAN_DE_OUTRO_PRODUTO:')) return {sucesso:false,texto:`Este código já pertence ao produto ${websac.split(':')[1]} no cadastro — vínculo só neste recebimento`};
  return {sucesso:websac == null,texto:websac || 'Vínculo registrado neste recebimento'};
}
export function ocorrenciasEanTexto(rows:{descricao:string|null;ean_nota:string|null;eans_bipados:{ean:string|null;websac:string|null}[]|null}[]) {
  return rows.map(r => `EAN divergente: ${r.descricao || '—'} — nota ${r.ean_nota || '—'}, bipado ${(r.eans_bipados || []).map(e => `${e.ean || '—'} (${e.websac || 'vínculo só neste recebimento'})`).join(', ')}`);
}