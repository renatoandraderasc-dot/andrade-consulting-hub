import { describe, it, expect } from 'vitest';
import { RECEBIMENTO_DEFAULTS, podeContar, podeAprovar, podeEntrar, podeCriarPedido, recontagemSegura } from './recebimentoRules';
const ok = [1,2,3,4,5].map(criterio => ({ criterio, resultado: 'OK', ciente_por: null }));
describe('Recebimento', () => {
  it('começa sem entrada automática', () => expect(RECEBIMENTO_DEFAULTS.entrada_automatica).toBe(false));
  it('bloqueia contagem em bloqueio', () => expect(podeContar(ok.map(c => c.criterio === 1 ? {...c, resultado:'BLOQUEIO'} : c))).toBe(false));
  it('exige ciência de todos os avisos 1–4', () => { const c = ok.map(c => c.criterio === 2 ? {...c, resultado:'AVISO'} : c); expect(podeContar(c)).toBe(false); expect(podeContar(c.map(c => ({...c,ciente_por:'usuario'})))).toBe(true); });
  it('ressalva exige supervisor/admin', () => {const c = ok.map(c => c.criterio === 5 ? {...c, resultado:'AVISO'} : c); expect(podeAprovar(c,false)).toBe(false); expect(podeAprovar(c,true)).toBe(true);});
  it('entrada manual restrita a supervisor/admin e estados aprovados', () => {expect(podeEntrar('APROVADA',false)).toBe(false); expect(podeEntrar('APROVADA_COM_RESSALVA',true)).toBe(true); expect(podeEntrar('EM_CONTAGEM',true)).toBe(false);});
  it('recontagem não carrega quantidades da nota', () => expect(recontagemSegura([{ean:'123',descricao:'Produto',situacao:'FALTA',qtd_nota:20} as any])).toEqual([{ean:'123',descricao:'Produto'}]));
  it('criação de pedido só aparece para supervisor/admin no critério 3 bloqueado sem pedido', () => {
    const c = {criterio:3,resultado:'BLOQUEIO',ciente_por:null,detalhe:{acao:'criar_pedido'}};
    expect(podeCriarPedido(c,true)).toBe(true);
    expect(podeCriarPedido(c,false)).toBe(false);
    expect(podeCriarPedido({...c,resultado:'AVISO'},true)).toBe(false);
    expect(podeCriarPedido({...c,criterio:1},true)).toBe(false);
    expect(podeCriarPedido({...c,detalhe:{acao:'divergencia'}},true)).toBe(false);
  });
});