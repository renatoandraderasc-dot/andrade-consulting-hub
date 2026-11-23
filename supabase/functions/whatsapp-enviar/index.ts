import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const Body = z.object({ campanha_id: z.string().uuid(), teste_telefone: z.string().optional() });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LOTE = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const inst = Deno.env.get("ZAPI_INSTANCE_ID"), tok = Deno.env.get("ZAPI_TOKEN"), ct = Deno.env.get("ZAPI_CLIENT_TOKEN");
    if (!inst || !tok) return json({ error: "Credenciais da Z-API não configuradas" }, 500);
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Não autenticado" }, 401);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: adm } = await db.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!adm) return json({ error: "Sem permissão" }, 403);
    const { data: demo } = await userClient.rpc("is_demo_account");
    if (demo) return json({ error: "Indisponível na demonstração" }, 403);

    const p = Body.safeParse(await req.json());
    if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400);
    const { campanha_id, teste_telefone } = p.data;
    const { data: camp } = await db.from("whatsapp_campanhas").select("*").eq("id", campanha_id).single();
    if (!camp) return json({ error: "Campanha não encontrada" }, 404);

    const imagens: string[] = [];
    for (const path of camp.imagens || []) {
      const { data } = await db.storage.from("whatsapp-midia").createSignedUrl(path, 3600);
      if (data?.signedUrl) imagens.push(data.signedUrl);
    }
    const base = `https://api.z-api.io/instances/${inst}/token/${tok}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ct) headers["Client-Token"] = ct;
    const enviar = async (phone: string) => {
      const chamadas: [string, unknown][] = [];
      imagens.forEach((img, i) => chamadas.push(["send-image", { phone, image: img, caption: i === 0 && imagens.length === 1 ? camp.mensagem : undefined }]));
      if (camp.mensagem && imagens.length !== 1) chamadas.push(["send-text", { phone, message: camp.mensagem }]);
      for (const [rota, body] of chamadas) {
        const r = await fetch(`${base}/${rota}`, { method: "POST", headers, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`[${r.status}] ${(await r.text()).slice(0, 300)}`);
        await sleep(800);
      }
    };

    if (teste_telefone) {
      const tel = teste_telefone.replace(/\D/g, "");
      try { await enviar(tel); return json({ ok: true }); } catch (e) { return json({ error: String((e as Error).message) }, 502); }
    }

    const { count } = await db.from("whatsapp_envios").select("id", { count: "exact", head: true }).eq("campanha_id", campanha_id);
    if (!count) {
      const { data: cts } = await db.from("whatsapp_contatos").select("id,telefone").in("id", camp.contato_ids || []).eq("ativo", true);
      const linhas = (cts || []).map((c) => ({ campanha_id, contato_id: c.id, telefone: c.telefone.replace(/\D/g, "") }));
      if (linhas.length) await db.from("whatsapp_envios").insert(linhas);
      await db.from("whatsapp_campanhas").update({ status: "enviando" }).eq("id", campanha_id);
    }
    const { data: pend } = await db.from("whatsapp_envios").select("id,telefone").eq("campanha_id", campanha_id).eq("status", "pendente").limit(LOTE);
    for (const e of pend || []) {
      try {
        await enviar(e.telefone);
        await db.from("whatsapp_envios").update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", e.id);
      } catch (err) {
        await db.from("whatsapp_envios").update({ status: "erro", erro: String((err as Error).message) }).eq("id", e.id);
      }
      await sleep(3000 + Math.random() * 4000);
    }
    const { count: rest } = await db.from("whatsapp_envios").select("id", { count: "exact", head: true }).eq("campanha_id", campanha_id).eq("status", "pendente");
    if (!rest) await db.from("whatsapp_campanhas").update({ status: "concluida" }).eq("id", campanha_id);
    return json({ ok: true, pendentes: rest || 0 });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
