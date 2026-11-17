import { describe, expect, it, vi } from 'vitest';
import { identificarProdutos } from '../../supabase/functions/recebimento/identificacao';
const linha = () => ({codproduto:null as number|null,descricao_produto:null as string|null,ean:'7890000000010' as string|null,cprod:'00042',eans_cadastro:null as string|null,ref_cadastro:null as string|null});
describe('identificação por referência do fornecedor', () => {
  it('prioriza EAN e deixa referência de cadastro vazia', async () => {
    const l = linha(); const rel = vi.fn().mockResolvedValue([{codproduto:42,descricao:'Cadastro',eans_cadastro:'7890000000010'}]);
    await identificarProdutos([l],'loja',7,rel);
    expect(l).toMatchObject({codproduto:42,ref_cadastro:null});
    expect(rel.mock.calls).toEqual([['loja','produto_por_ean',{ean:'7890000000010'}]]);
  });
  it('casa cProd por referência apenas no fornecedor da nota quando EAN não bate', async () => {
    const l = linha(); const rel = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{codproduto:42,descricao:'Cadastro',eans_cadastro:'7890000000027',ref_cadastro:'42'}]);
    await identificarProdutos([l],'loja',7,rel);
    expect(rel).toHaveBeenLastCalledWith('loja','produto_por_reffornec',{codfornec:7,ref:'00042'});
    expect(l).toMatchObject({codproduto:42,descricao_produto:'Cadastro',eans_cadastro:'7890000000027',ref_cadastro:'42'});
  });
  it('tenta referência sem EAN ou quando consulta EAN falha', async () => {
    for (const ean of [null,'7890000000010']) {
      const l = {...linha(),ean}; const rel = vi.fn(async (_s:string,n:string) => {if(n==='produto_por_ean')throw new Error('indisponível');return [{codproduto:42,ref_cadastro:'42'}];});
      await identificarProdutos([l],'loja',7,rel);
      expect(l.codproduto).toBe(42);
    }
  });
  it('não consulta referência sem fornecedor ou cProd nem substitui produto conhecido', async () => {
    for (const [l,fornecedor] of [[{...linha(),ean:null},null],[{...linha(),ean:null,cprod:''},7],[{...linha(),ean:null,codproduto:99},7]] as const) {
      const rel = vi.fn(); await identificarProdutos([l],'loja',fornecedor,rel);
      expect(rel).not.toHaveBeenCalled();
    }
  });
});