import { describe, expect, it } from 'vitest';
import { conferirItens } from '../../supabase/functions/recebimento/conferencia';
import { recontagemSegura } from './recebimentoRules';

const item = { seq_xml: 1, codproduto: 42, ean: '07890001', descricao_xml: 'Descrição do fornecedor', descricao_produto: 'Descrição do cadastro', eans_cadastro: '07890001, 7890002', qtd_unidades: 10 };
const count = { codproduto: 42, ean: '7890002', descricao: 'Descrição do cadastro', qtd_contada: 10 };
describe('descrições e EANs no recebimento', () => {
  it('mantém descrição da nota, sistema e todos os EANs no resultado', () => {
    expect(conferirItens([item], [count], 0)[0]).toMatchObject({ descricao_nota: 'Descrição do fornecedor', descricao_sistema: 'Descrição do cadastro', eans_cadastro: '07890001, 7890002', qtd_nota: 10, qtd_contada: 10, situacao: 'OK' });
  });
  it('soma leituras de EANs diferentes cadastrados no mesmo produto', () => {
    expect(conferirItens([item], [{...count, qtd_contada: 4}, {...count, ean: '07890001', qtd_contada: 6}], 0)[0]).toMatchObject({ qtd_contada: 10, diferenca: 0, situacao: 'OK' });
  });
  it('agrupa sobras fora da nota sem inventar descrição da nota ou EANs cadastrados', () => {
    expect(conferirItens([], [{...count, qtd_contada: 4}, {...count, qtd_contada: 6}], 0)).toEqual([{ seq: null, codproduto: 42, ean: '7890002', descricao: 'Descrição do cadastro', descricao_nota: null, descricao_sistema: 'Descrição do cadastro', eans_cadastro: null, qtd_nota: 0, qtd_contada: 10, diferenca: 10, situacao: 'FORA_DA_NOTA' }]);
  });
  it('casa EAN normalizado quando o código do produto não está disponível', () => {
    expect(conferirItens([{...item, codproduto:null}], [{...count, codproduto:null, ean:'7890001'}], 0)[0].situacao).toBe('OK');
  });
  it('não passa descrição nem quantidade da nota ou EANs cadastrados à recontagem', () => {
    const resultado = conferirItens([item], [{...count, qtd_contada: 3}], 0);
    expect(recontagemSegura(resultado)).toEqual([{ean:'07890001',descricao:'Descrição do cadastro'}]);
  });
});