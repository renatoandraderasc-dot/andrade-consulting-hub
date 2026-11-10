import { describe, it, expect } from 'vitest';
import { RECEBIMENTO_DEFAULTS, podeContar, podeAprovar, podeEntrar, recontagemSegura } from './recebimentoRules';
const ok = [1,2,3,4,5].map(criterio => ({ criterio, resultado: 'OK', ciente_por: null }));
describe('Recebimento', () => {
  it('começa sem entrada automática', () => expect(RECEBIMENTO_DEFAULTS.entrada_automatica).toBe(false));
  it('bloqueia contagem em bloqueio', () => expect(podeContar(ok.map(c => c.criterio === 1 ? {...c, resultado:'BLOQUEIO'} : c))).toBe(false));
  it('exige ciência de todos os avisos 1–4', () => { const c = ok.map(c => c.criterio === 2 ? {...c, resultado:'AVISO'} : c); expect(podeContar(c)).toBe(false); expect(podeContar(c.map(c => ({...c,ciente_por:'usuario'})))).toBe(true); });
  it('ressalva exige supervisor/admin', () => {const c = ok.map(c => c.criterio === 5 ? {...c, resultado:'AVISO'} : c); expect(podeAprovar(c,false)).toBe(false); expect(podeAprovar(c,true)).toBe(true);});
  it('entrada manual restrita a supervisor/admin e estados aprovados', () => {expect(podeEntrar('APROVADA',false)).toBe(false); expect(podeEntrar('APROVADA_COM_RESSALVA',true)).toBe(true); expect(podeEntrar('EM_CONTAGEM',true)).toBe(false);});
  it('recontagem não carrega quantidades da nota', () => expect(recontagemSegura([{ean:'123',descricao:'Produto',situacao:'FALTA',qtd_nota:20} as any])).toEqual([{ean:'123',descricao:'Produto'}]));
});