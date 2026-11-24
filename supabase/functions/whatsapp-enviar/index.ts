import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
const destino = (t: string) => { const v = String(t || "").trim().replace(/\s+/g, ""); if (/@g\.us$/i.test(v)) return v.replace(/@g\.us$/i, "-group"); if (/-group$/i.test(v)) return v; return v.replace(/\D/g, ""); };

const Body = z.object({ campanha_id: z.string().uuid(), teste_telefone: z.string().optional() });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LOTE = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const canal = Deno.env.get("ZAPI_INSTANCE_ID")?.trim();
    const secret = (Deno.env.get("ZAPI_OMNI_SECRET") || Deno.env.get("STRIPE_LIVE_API_KEY"))?.trim();
    if (!canal || !secret) return json({ error: "Credenciais da Z-API Omni não configuradas" }, 500);
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
    const endpoint = `https://api.omni.z-api.io/v1/channels/${canal}/messages`;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${secret}` };
    const assinar = async (paths: string[]) => {
      const out: string[] = [];
      for (const path of paths) {
        const { data } = await db.storage.from("whatsapp-midia").createSignedUrl(path, 3600);
        if (data?.signedUrl) out.push(data.signedUrl);
      }
      return out;
    };
    const enviar = async (phone: string, prints: string[] = []) => {
      const chamadas: unknown[] = [];
      prints.forEach((img) => chamadas.push({ recipient: { identifier: destino(phone) }, content: { type: "IMAGE", attachments: [{ url: img }] } }));
      imagens.forEach((img, i) => chamadas.push({ recipient: { identifier: destino(phone) }, content: { type: "IMAGE", attachments: [{ url: img, ...(i === 0 && imagens.length === 1 && camp.mensagem ? { caption: camp.mensagem } : {}) }] } }));
      if (camp.mensagem && imagens.length !== 1) chamadas.push({ recipient: { identifier: destino(phone) }, content: { type: "TEXT", body: { message: camp.mensagem } } });
      for (const body of chamadas) {
        const r = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`[${r.status}] ${(await r.text()).slice(0, 300)}`);
        await sleep(800);
      }
    };

    const MSG_INST = "A Z-API Omni recusou a conta: confira o ID do canal, a Secret Key e se o canal está conectado.";
    const falhaConta = (m: string) => /^\[(401|403)\]/.test(m) || m.includes("CHANNEL_DISCONNECTED");
    if (teste_telefone) {
      const tel = destino(teste_telefone);
      try { await enviar(tel); return json({ ok: true }); } catch (e) { const m = String((e as Error).message); return json({ ok: false, error: falhaConta(m) ? MSG_INST + " " + m : m }); }
    }

    const { count } = await db.from("whatsapp_envios").select("id", { count: "exact", head: true }).eq("campanha_id", campanha_id);
    if (!count) {
      const { data: cts } = await db.from("whatsapp_contatos").select("id,telefone").in("id", camp.contato_ids || []).eq("ativo", true);
      const linhas = (cts || []).map((c) => ({ campanha_id, contato_id: c.id, telefone: destino(c.telefone) }));
      if (linhas.length) await db.from("whatsapp_envios").insert(linhas);
      await db.from("whatsapp_campanhas").update({ status: "enviando" }).eq("id", campanha_id);
    }
    const { data: pend } = await db.from("whatsapp_envios").select("id,telefone,imagens").eq("campanha_id", campanha_id).eq("status", "pendente").limit(LOTE);
    for (const e of pend || []) {
      try {
        await enviar(e.telefone, await assinar(e.imagens || []));
        await db.from("whatsapp_envios").update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", e.id);
      } catch (err) {
        const m = String((err as Error).message);
        if (falhaConta(m)) return json({ ok: false, error: MSG_INST + " " + m });
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
