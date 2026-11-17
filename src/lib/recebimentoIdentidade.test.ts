import { describe, expect, it } from 'vitest';
import { RECEIPT_IDENTITY_COLUMNS, identityCounted, type ReceiptIdentity } from './recebimentoIdentidade';
const item: ReceiptIdentity = { id:'item',seq_xml:1,codproduto:42,descricao_xml:'Nota',descricao_produto:'Cadastro',ean:'07890001',eans_cadastro:'07890001, 7890002;7890003',cprod:'00042',ref_cadastro:'42' };
describe('identidades na contagem', () => {
  it('carrega somente identidade, nunca quantidade ou preço', () => {
    expect(RECEIPT_IDENTITY_COLUMNS.split(',')).toEqual(['id','seq_xml','codproduto','descricao_xml','descricao_produto','ean','eans_cadastro','cprod','ref_cadastro']);
  });
  it('marca contado pelo código do produto na rodada atual', () => {
    expect(identityCounted(item,[{codproduto:42,ean:'outro',rodada:2}],2)).toBe(true);
    expect(identityCounted(item,[{codproduto:42,ean:'outro',rodada:1}],2)).toBe(false);
  });
  it('marca contado pelo EAN XML ou qualquer EAN cadastrado', () => {
    for (const ean of ['07890001','7890002','7890003']) expect(identityCounted(item,[{codproduto:null,ean,rodada:2}],2)).toBe(true);
    expect(identityCounted(item,[{codproduto:null,ean:'99999999',rodada:2}],2)).toBe(false);
  });
  it('não casa códigos nulos ou EANs vazios', () => {
    expect(identityCounted({...item,codproduto:null,ean:null,eans_cadastro:null},[{codproduto:null,ean:null,rodada:2}],2)).toBe(false);
  });
});