import {describe,it,expect} from 'vitest';
import { conferirItens } from '../../supabase/functions/recebimento/conferencia';
import {itemDaContagem,avisoVinculo,ocorrenciasEanTexto} from './recebimentoVinculo';
import {identityCounted} from './recebimentoIdentidade';
import {podeVincular} from '../../supabase/functions/recebimento/vinculoRules';
const item={id:'i',seq_xml:1,codproduto:42,descricao_xml:'Nota',descricao_produto:'Cadastro',ean:'78900001',eans_cadastro:'78900002',cprod:'42',ref_cadastro:null,qtd_unidades:10};
describe('vínculo manual',()=>{
 it('permite vínculo somente durante contagem e bloqueia notas finalizadas',()=>{
  expect(podeVincular('EM_CONTAGEM')).toBe(true);
  for(const estado of ['ENTRADA_CONFIRMADA','APROVADA','CANCELADA','BLOQUEADA'])expect(podeVincular(estado)).toBe(false);
 });
 it('prioriza item escolhido mesmo quando código e EAN apontam outro produto',()=>{
  const outro={...item,id:'o',seq_xml:2,codproduto:99,ean:'99999999'};
  const count={codproduto:42,ean:'78900001',descricao:'Leitura',qtd_contada:10,rodada:1,seq_vinculado:2,vinculo_websac:'VINCULADO'};
  const rows=conferirItens([item,outro],[count],0);
  expect(rows[0].qtd_contada).toBe(0);expect(rows[1].situacao).toBe('OK');
  expect(rows[1].vinculo_manual).toEqual([{ean:'78900001',websac:'VINCULADO'}]);
  expect(itemDaContagem([item,outro],count)?.seq_xml).toBe(2);
  expect(identityCounted(item,[count],1)).toBe(false);expect(identityCounted(outro,[count],1)).toBe(true);
 });
 it('identifica EAN cadastrado normalizado sem vínculo',()=>{
  expect(itemDaContagem([item],{codproduto:null,ean:'078900002',rodada:1})?.seq_xml).toBe(1);
  expect(itemDaContagem([item],{codproduto:null,ean:'99999999',rodada:1})).toBeUndefined();
 });
 it('distingue cadastro concluído de código pertencente a outro produto',()=>{
  expect(avisoVinculo('VINCULADO').sucesso).toBe(true);
  expect(avisoVinculo('EAN_DE_OUTRO_PRODUTO:99')).toEqual({sucesso:false,texto:'Este código já pertence ao produto 99 no cadastro — vínculo só neste recebimento'});
  expect(avisoVinculo('SEM_CODPRODUTO').sucesso).toBe(false);
 });
 it('inclui EAN da nota, bipado e retorno na ocorrência',()=>{
  expect(ocorrenciasEanTexto([{descricao:'Cadastro',ean_nota:'78900001',eans_bipados:[{ean:'99999999',websac:'VINCULADO'}]}])).toEqual(['EAN divergente: Cadastro — nota 78900001, bipado 99999999 (VINCULADO)']);
 });
});