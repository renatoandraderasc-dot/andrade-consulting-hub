import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function loadFunction(name: string) {
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