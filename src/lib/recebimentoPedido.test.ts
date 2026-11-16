import { beforeEach, describe, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { criarPedidoERevalidar } from './recebimento';

describe('criação e revalidação do pedido', () => {
  beforeEach(() => invoke.mockReset());
  it('envia loja e recebimento, comunica pedido e revalida automaticamente pela chave', async () => {
    const pedido={ok:true,numpedido:456,itens:8,total:120.5};
    invoke.mockResolvedValueOnce({data:pedido}).mockResolvedValueOnce({data:{estado:'EM_CONTAGEM'}});
    const created=vi.fn(()=>expect(invoke).toHaveBeenCalledTimes(1));
    expect(await criarPedidoERevalidar('store-1','rec-1','chave-44',created)).toEqual({estado:'EM_CONTAGEM'});
    expect(created).toHaveBeenCalledWith(pedido);
    expect(invoke.mock.calls).toEqual([
      ['recebimento',{body:{store_id:'store-1',acao:'criar_pedido',recebimento_id:'rec-1'}}],
      ['recebimento',{body:{store_id:'store-1',acao:'validar',recebimento_id:'rec-1',chave:'chave-44'}}],
    ]);
  });
  it('exibe o erro retornado em HTTP 409 e não revalida', async () => {
    invoke.mockResolvedValue({error:{context:new Response(JSON.stringify({erro:'itens sem produto cadastrado: 12'}),{status:409})}});
    const created=vi.fn();
    await expect(criarPedidoERevalidar('store-1','rec-1','chave',created)).rejects.toThrow('itens sem produto cadastrado: 12');
    expect(created).not.toHaveBeenCalled();expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('não repete criação quando a revalidação falha', async () => {
    invoke.mockResolvedValueOnce({data:{ok:true,numpedido:456,itens:8,total:120.5}}).mockResolvedValueOnce({data:{erro:'falha na revalidação'}});
    await expect(criarPedidoERevalidar('store-1','rec-1','chave',vi.fn())).rejects.toThrow('falha na revalidação');
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});