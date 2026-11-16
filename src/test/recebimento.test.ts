import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

function loadFunction(name: string, overrides: Record<string, unknown> = {}) {
  const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8')
    .replace(/^import .*;\s*$/gm, '');
  let handler: (request: Request) => Promise<Response> = async () => new Response();
  const exports: Record<string, any> = {};
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Response, Request, TextDecoder, Uint8Array, atob,
    corsHeaders: { 'Access-Control-Allow-Origin': '*' },
    Deno: { env: { get: () => 'test' }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    ...overrides,
  });
  return { exports, handler };
}

function chave(modelo = '55') {
  const prefix = `35261112345678000190${modelo}001000000123110000000`;
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(prefix[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  return prefix + (resto <= 1 ? 0 : 11 - resto);
}

describe('Recebimento de NF-e', () => {
  const { exports } = loadFunction('recebimento');
  it('exige 44 dígitos', () => {
    expect(exports.validarChave('123').ok).toBe(false);
    expect(chave()).toHaveLength(44);
    expect(exports.validarChave(chave()).ok).toBe(true);
  });
  it('rejeita dígito verificador incorreto', () => {
    const valid = chave();
    expect(exports.validarChave(valid.slice(0, 43) + ((Number(valid[43]) + 1) % 10)).ok).toBe(false);
  });
  it('aceita apenas modelo NF-e 55', () => {
    expect(exports.validarChave(chave('65')).ok).toBe(false);
    expect(exports.validarChave(chave('55')).modelo).toBe('55');
  });
  for (const name of ['recebimento', 'websac-entrada']) {
    it(`${name} recusa usuário não autenticado antes de qualquer operação`, async () => {
      const response = await loadFunction(name).handler(new Request('https://example.test', { method: 'POST', body: '{}' }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ erro: 'não autenticado' });
    });
  }
});

function orderHarness({role='supervisor',rec={id:'rec-1',store_id:'store-1',estado:'BLOQUEADA',idnfeestabelec:123},config={},report={ok:true,dados:[{numpedido:'456',itens:8,total:120.5}]} }: {role?:string;rec?:Record<string,unknown>|null;config?:Record<string,unknown>;report?:Record<string,unknown>} = {}) {
  const writes: {table:string;operation:string;payload:Record<string,unknown>}[] = [];
  const consultarRelatorioLoja = vi.fn(async () => report);
  const db = {
    auth:{getUser:async()=>({data:{user:{id:'user-1'}}})},
    from:(table:string)=>{
      const result = {data:table==='user_roles'?[{role}]:table==='user_store_access'?{id:'access'}:table==='recebimento_config'?config:table==='recebimentos'?rec:null};
      const q = {
        select:()=>q,eq:()=>q,maybeSingle:async()=>result,
        update:(payload:Record<string,unknown>)=>{writes.push({table,operation:'update',payload});return q;},
        insert:(payload:Record<string,unknown>)=>{writes.push({table,operation:'insert',payload});return q;},
        then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve),
      };
      return q;
    },
  };
  const {handler}=loadFunction('recebimento',{createClient:()=>db,consultarRelatorioLoja});
  const call=()=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({acao:'criar_pedido',store_id:'store-1',recebimento_id:'rec-1'})}));
  return {call,writes,consultarRelatorioLoja};
}

describe('criar pedido pelo XML',()=>{
  it('prioriza a chave da nota antes de pedido vinculado e total aproximado',()=>{
    const source=readFileSync('supabase/functions/recebimento/index.ts','utf8');
    const expression=source.match(/const alvo = ([\s\S]*?)\n        if \(alvo\)/)?.[1];
    if(!expression)throw new Error('seleção de pedido não encontrada');
    const abertos=[{numpedido:1,totalliquido:120.5},{numpedido:2,totalliquido:120.5},{numpedido:3,chavenfe_vinculada:'chave-nota',totalliquido:120.5}];
    const pick=(rows:typeof abertos)=>runInNewContext(`(${expression.trim().replace(/;$/,'')})`,{abertos:rows,vinculados:[2],chave:'chave-nota',num:Number,nfe:{total:120.5},xml:{vNF:120.5}});
    expect(pick(abertos).numpedido).toBe(3);
    expect(pick(abertos.slice(0,2)).numpedido).toBe(2);
    expect(pick(abertos.slice(0,1)).numpedido).toBe(1);
  });
  it.each(['supervisor','admin'])('perfil %s cria e registra pedido sem dar entrada',async role=>{
    const h=orderHarness({role});const r=await h.call();
    expect(r.status).toBe(200);expect(await r.json()).toMatchObject({ok:true,numpedido:456,itens:8,total:120.5});
    expect(h.consultarRelatorioLoja).toHaveBeenCalledWith(expect.objectContaining({storeId:'store-1',relatorio:'hub_gerar_pedido',params:{idnfe:123},timeoutMs:90000}));
    expect(h.writes).toContainEqual(expect.objectContaining({table:'recebimentos',payload:expect.objectContaining({numpedido:456,pedido_origem:'criado_hub'})}));
    expect(h.writes).toContainEqual(expect.objectContaining({table:'recebimento_eventos',payload:expect.objectContaining({evento:'PEDIDO_CRIADO'})}));
    expect(h.writes.some(w=>w.payload.estado==='ENTRADA_CONFIRMADA')).toBe(false);
  });
  it('recusa conferente sem autorização',async()=>{const h=orderHarness({role:'user'});expect((await h.call()).status).toBe(403);expect(h.consultarRelatorioLoja).not.toHaveBeenCalled();});
  it('respeita autorização explícita de conferente',async()=>{const h=orderHarness({role:'user',config:{criar_pedido_conferente:true}});expect((await h.call()).status).toBe(200);});
  it.each([
    [null,404],
    [{estado:'ENTRADA_CONFIRMADA',idnfeestabelec:123},409],
    [{idnotafiscal_entrada:88,idnfeestabelec:123},409],
    [{numpedido:456,idnfeestabelec:123},409],
    [{estado:'AGUARDANDO_NFE'},409],
  ])('não grava em recebimento inválido %j',async(rec,status)=>{const h=orderHarness({rec});expect((await h.call()).status).toBe(status);expect(h.consultarRelatorioLoja).not.toHaveBeenCalled();expect(h.writes).toEqual([]);});
  it('retorna itens não cadastrados e registra falha sem salvar pedido',async()=>{
    const h=orderHarness({report:{ok:false,erro:'WebSac: itens sem produto cadastrado: 12, 34'}});const r=await h.call();
    expect(r.status).toBe(409);expect(await r.json()).toEqual({erro:'WebSac não gerou o pedido: itens sem produto cadastrado: 12, 34'});
    expect(h.writes).toHaveLength(1);expect(h.writes[0].payload.evento).toBe('PEDIDO_FALHOU');
  });
});