// vr-health — verifica a conexao com o sistema da loja (VR, ORACLE ou WebSac)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { carregarConfigLoja } from "../_shared/consultaLoja.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { store_id } = await req.json().catch(() => ({}));
    if (!store_id) return json({ erro: "informe store_id" }, 400);

    const cfg = await carregarConfigLoja(SUPABASE_URL, SERVICE_KEY, store_id);
    if (!cfg) return json({ online: false, erro: "loja sem conexao cadastrada" });

    const sistema = (cfg.sistema ?? "VR").toUpperCase();
    const t0 = Date.now();

    // ---------- WebSac: testa com SELECT 1 pela websac-proxy ----------
    if (sistema === "WEBSAC") {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/websac-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ store_id, sql: "SELECT 1" }),
        signal: AbortSignal.timeout(30000),
      });
      const body = await resp.json().catch(() => null) as any;
      const erro = !Array.isArray(body) ? body?.erro : undefined;
      const online = resp.ok && !erro;
      return json({
        online, sistema, latency_ms: Date.now() - t0,
        erro: online ? undefined : (erro ?? `HTTP ${resp.status}`),
      });
    }

    // ---------- VR: endpoint /health ----------
    try {
      const url = `${cfg.api_url.replace(/\/+$/, "")}/health?chave=${encodeURIComponent(cfg.api_key)}`;
      const resp = await fetch(url, {
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: AbortSignal.timeout(20000),
      });
      const texto = await resp.text();
      const pareceHtml = /^\s*<(!doctype|html)/i.test(texto) || /ngrok/i.test(texto.slice(0, 500));
      const online = resp.ok && !pareceHtml;
      return json({
        online, sistema, latency_ms: Date.now() - t0,
        erro: online ? undefined : (pareceHtml ? "sem conexao VR (tunel fora do ar)" : `HTTP ${resp.status}`),
      });
    } catch (e) {
      return json({ online: false, sistema, erro: e instanceof Error ? e.message : String(e) });
    }
  } catch (e) {
    return json({ online: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
