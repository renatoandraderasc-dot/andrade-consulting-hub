import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../../../drizzle/migrations/0048_isolated_demo_workspace.sql?raw";

describe("demo data isolation", () => {
  it("denies production reads, writes and membership escalation while allowing own fictional saves", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
      CREATE TABLE public.stores(id uuid PRIMARY KEY,name text);
      GRANT ALL ON public.stores TO authenticated; ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
      CREATE POLICY existing_access ON public.stores FOR ALL TO authenticated USING(true) WITH CHECK(true);
      INSERT INTO public.stores VALUES ('10000000-0000-0000-0000-000000000001','Real store');
    `);
    await db.exec(migration);
    await db.exec(`INSERT INTO public.demo_workspaces(user_id) VALUES('20000000-0000-0000-0000-000000000001'); SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);`);
    expect((await db.query("SELECT * FROM public.stores")).rows).toHaveLength(0);
    await expect(db.exec("INSERT INTO public.stores VALUES ('10000000-0000-0000-0000-000000000002','Intrusion')")).rejects.toThrow();
    await expect(db.exec("UPDATE public.demo_workspaces SET enabled=false")).rejects.toThrow();
    await db.exec(`UPDATE public.demo_workspaces SET data='{"example":123}'::jsonb`);
    expect((await db.query<{ data: { example: number } }>("SELECT data FROM public.demo_workspaces")).rows[0].data.example).toBe(123);
    await db.exec("RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false)");
    expect((await db.query("SELECT * FROM public.demo_workspaces")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM public.stores")).rows).toHaveLength(1);
    await db.close();
  });
});