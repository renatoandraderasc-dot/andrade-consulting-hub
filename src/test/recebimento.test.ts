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

const xmlNota = (ean: string, qtd: number) => `<nfe><emit><CNPJ>12345678000190</CNPJ></emit><ide><dhEmi>${new Date().toISOString().slice(0, 10)}T10:00:00-03:00</dhEmi><nNF>1</nNF><serie>1</serie></ide><ICMSTot><vNF>60</vNF></ICMSTot><det nItem="1"><prod><cProd>ARROZ</cProd><cEAN>${ean}</cEAN><xProd>ARROZ 5KG</xProd><uCom>UN</uCom><qCom>${qtd}</qCom><vUnCom>5</vUnCom><vProd>60</vProd></prod></det></nfe>`;

function confernciaHarness({ itens = [], contagem = [], relatorios = {} }: { itens?: Record<string, unknown>[]; contagem?: Record<string, unknown>[]; relatorios?: Record<string, Record<string, unknown>[]> } = {}) {
  const writes: { table: string; operation: string; payload: unknown }[] = [];
  const tables: Record<string, Record<string, unknown>[]> = {
    user_roles: [{ role: 'admin', user_id: 'user-1' }],
    user_store_access: [{ id: 'access', user_id: 'user-1', store_id: 'store-1', approved: true }],
    recebimentos: [{ id: 'rec-1', store_id: 'store-1', estado: 'EM_CONTAGEM', idnfeestabelec: 123 }],
    recebimento_config: [],
    recebimento_itens: itens,
    lista_cega_itens: contagem,
  };
  const consultarRelatorioLoja = vi.fn(async ({ relatorio }: { relatorio: string }) => ({ ok: true, dados: relatorios[relatorio] ?? [] }));
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => String(r[k]) === String(v)));
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        maybeSingle: async () => ({ data: rows()[0] ?? null }),
        single: async () => ({ data: rows()[0] ?? null }),
        upsert: (payload: unknown) => { writes.push({ table, operation: 'upsert', payload }); return q; },
        insert: (payload: unknown) => { writes.push({ table, operation: 'insert', payload }); return q; },
        update: (payload: unknown) => { writes.push({ table, operation: 'update', payload }); return q; },
        delete: () => { writes.push({ table, operation: 'delete', payload: null }); return q; },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows() }).then(resolve),
      };
      return q;
    },
  };
  const { handler } = loadFunction('recebimento', { createClient: () => db, consultarRelatorioLoja });
  const call = (body: Record<string, unknown>) => handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ store_id: 'store-1', ...body }) }));
  const inserted = () => writes.filter((w) => w.table === 'recebimento_itens' && w.operation === 'insert').flatMap((w) => w.payload as Record<string, unknown>[]);
  return { call, writes, consultarRelatorioLoja, inserted };
}

const notaSemProduto = {
  nfe_recebida_por_chave: [{ idnfeestabelec: 123, numnotafiscal: 1, serie: '1', nome_emitente: 'Fornecedor X', cnpj_emitente: '12345678000190', total: 60, pedidos_vinculados: '', idnotafiscal_entrada: null, xmlnfe: xmlNota('7891000100103', 12) }],
  fornecedor_por_cnpj: [{ codfornec: 77, status: 'A', nome: 'Fornecedor X' }],
  pedidos_abertos_fornecedor: [],
  nfe_recebida_itens: [{ seqitem: 1, descricao_xml: 'ARROZ 5KG', qtd_xml: 12, preco_xml: 5, totalproduto: 60 }],
};

describe('recebimento resolve produto pelo EAN na validação', () => {
  it('grava o código do produto encontrado pelo EAN quando o WebSac não conhece a nota', async () => {
    const h = confernciaHarness({ relatorios: { ...notaSemProduto, produto_por_ean: [{ codproduto: 4521, descricao: 'ARROZ 5KG TIPO 1' }] } });
    const r = await h.call({ acao: 'validar', chave: chave() });
    expect(r.status).toBe(200);
    expect(h.consultarRelatorioLoja).toHaveBeenCalledWith(expect.objectContaining({ relatorio: 'produto_por_ean', params: { ean: '7891000100103' } }));
    expect(h.inserted()[0]).toMatchObject({ seq_xml: 1, codproduto: 4521, descricao_produto: 'ARROZ 5KG TIPO 1' });
  });
  it('mantém o item sem código quando o EAN não existe no cadastro', async () => {
    const h = confernciaHarness({ relatorios: { ...notaSemProduto, produto_por_ean: [] } });
    await h.call({ acao: 'validar', chave: chave() });
    expect(h.inserted()[0]).toMatchObject({ seq_xml: 1, codproduto: null });
  });
});

const itemNota = (extra: Record<string, unknown> = {}) => ({ recebimento_id: 'rec-1', seq_xml: 1, codproduto: 4521, ean: '7891000100103', qtd_unidades: 12, descricao_produto: 'ARROZ 5KG TIPO 1', descricao_xml: 'ARROZ 5KG', ...extra });
const contado = (extra: Record<string, unknown> = {}) => ({ recebimento_id: 'rec-1', rodada: 1, codproduto: null, ean: null, qtd_contada: 0, descricao: 'ARROZ 5KG', ...extra });

describe('conferência da lista cega casa por código ou EAN', () => {
  const conferir = (itens: Record<string, unknown>[], contagem: Record<string, unknown>[]) => confernciaHarness({ itens, contagem }).call({ acao: 'conferir', recebimento_id: 'rec-1', rodada: 1 });

  it('casa item com código contra contagem só com EAN, mesmo com zeros à esquerda', async () => {
    const r = await conferir([itemNota()], [contado({ ean: '0007891000100103', qtd_contada: 12 })]);
    const body = await r.json();
    expect(body.itens).toHaveLength(1);
    expect(body.itens[0]).toMatchObject({ seq: 1, qtd_nota: 12, qtd_contada: 12, diferenca: 0, situacao: 'OK' });
    expect(body.divergentes).toBe(0);
  });
  it('não conta a mesma contagem duas vezes quando código e EAN batem', async () => {
    const r = await conferir([itemNota()], [contado({ codproduto: 4521, ean: '7891000100103', qtd_contada: 12 })]);
    const body = await r.json();
    expect(body.itens).toHaveLength(1);
    expect(body.itens[0].qtd_contada).toBe(12);
    expect(body.itens[0].situacao).toBe('OK');
  });
  it('soma contagens do mesmo produto e marca FALTA quando falta quantidade', async () => {
    const r = await conferir([itemNota()], [contado({ codproduto: 4521, qtd_contada: 5 }), contado({ codproduto: 4521, qtd_contada: 4 })]);
    const body = await r.json();
    expect(body.itens).toHaveLength(1);
    expect(body.itens[0]).toMatchObject({ qtd_contada: 9, diferenca: -3, situacao: 'FALTA' });
  });
  it('junta em uma única linha a contagem fora da nota', async () => {
    const r = await conferir([itemNota()], [contado({ codproduto: 4521, qtd_contada: 12 }), contado({ codproduto: 999, qtd_contada: 3 }), contado({ codproduto: 999, qtd_contada: 4 })]);
    const body = await r.json();
    expect(body.itens).toHaveLength(2);
    expect(body.itens[1]).toMatchObject({ seq: null, codproduto: 999, qtd_nota: 0, qtd_contada: 7, diferenca: 7, situacao: 'FORA_DA_NOTA' });
  });
  it('marca NAO_CONTADO quando nenhum item contado casa com a nota', async () => {
    const r = await conferir([itemNota()], [contado({ codproduto: 8888, ean: '1234567890123', qtd_contada: 2 })]);
    const body = await r.json();
    expect(body.itens[0]).toMatchObject({ seq: 1, qtd_contada: 0, situacao: 'NAO_CONTADO' });
    expect(body.itens[1]).toMatchObject({ seq: null, situacao: 'FORA_DA_NOTA' });
  });
});