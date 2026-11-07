import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

// Executa a definição SQL real numa base descartável; nunca altera metas de clientes.
it("restaura fórmula, Dashboard, taxas, ativos, históricos, centavos e protege LOJA", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const raw = JSON.parse(execFileSync("lovable", ["supabase", "query", "select pg_get_functiondef('public.gerar_metas_compra(uuid,integer,integer)'::regprocedure) as definition", "--json"], { encoding: "utf8" }));
  const rows = Array.isArray(raw) ? raw : raw.data ?? raw.rows ?? raw.result;
  const definition = rows[0].definition;
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS 'select true';
    CREATE FUNCTION public.meta_venda_mes_dashboard(uuid,integer,integer) RETURNS numeric LANGUAGE sql AS 'select 1000';
    CREATE TABLE compras_config(store_id uuid,ano int,mes int,meta_venda_mes numeric,parcelas_excesso int,hist_inicio date,hist_fim date);
    CREATE TABLE compras_departamento(store_id uuid,departamento text,tx_recuperacao numeric,tx_perdas numeric,ativo boolean);
    CREATE TABLE compras_historico(store_id uuid,departamento text,ano int,mes int,venda numeric,cmv numeric,compra numeric);
    CREATE TABLE compras_meta(store_id uuid,departamento text,ano int,mes int,participacao numeric,meta_venda numeric,meta_compra numeric,parcela_excesso numeric,compra_sobre_venda numeric,venda_hist numeric,cmv_hist numeric,compra_hist numeric,cmv_pct numeric,excesso_hist numeric,gerado_em timestamptz,meta_lucro numeric,meta_pagamentos numeric,UNIQUE(store_id,departamento,ano,mes));
    ${definition}
    INSERT INTO compras_config VALUES ('00000000-0000-0000-0000-000000000001',2026,11,999,6,'2026-10-01','2026-10-31');
    INSERT INTO compras_departamento SELECT '00000000-0000-0000-0000-000000000001',d,100,3,true FROM unnest(ARRAY['A','B','C']) d;
    INSERT INTO compras_departamento VALUES ('00000000-0000-0000-0000-000000000001','INATIVO',1,0,false);
    INSERT INTO compras_historico SELECT '00000000-0000-0000-0000-000000000001',d,2026,10,100,70,70 FROM unnest(ARRAY['A','B','C','INATIVO']) d;
    INSERT INTO compras_meta(store_id,departamento,ano,mes,meta_compra,meta_lucro,meta_pagamentos) VALUES ('00000000-0000-0000-0000-000000000001','LOJA',2026,11,888,777,666),('00000000-0000-0000-0000-000000000001','ANTIGO',2026,11,123,0,0);
  `);
  const result = await db.query<any>("SELECT * FROM gerar_metas_compra('00000000-0000-0000-0000-000000000001',2026,11)");
  expect(Number(result.rows[0].meta_venda_total)).toBe(1000);
  expect(Number(result.rows[0].meta_compra_total)).toBe(679);
  expect(result.rows[0].departamentos).toBe(3);
  const metas = (await db.query<any>("SELECT * FROM compras_meta ORDER BY departamento")).rows;
  expect(metas.map(r => r.departamento)).toEqual(['A','B','C','LOJA']);
  expect(Number(metas[0].meta_venda)).toBe(333.34);
  expect(Number(metas[0].venda_hist)).toBe(100);
  expect(Number(metas[0].cmv_hist)).toBe(70);
  expect(Number(metas[3].meta_compra)).toBe(888);
  expect(Number(metas[3].meta_lucro)).toBe(777);
  expect(Number(metas[3].meta_pagamentos)).toBe(666);
  await db.close();
}, 30000);