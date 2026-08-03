// ============================================================
// vr-proxy
// Consulta ao vivo relatorios da API do VR (compras_vendas_periodo,
// compras_por_fornecedor, etc). Usa a config armazenada em
// store_vr_config. Requer usuario autenticado com acesso a loja.
// Body: { store_id, relatorio, params: Record<string,string> }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ erro: "nao autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ erro: "nao autorizado" }, 401);
    const userId = claimsData.claims.sub;

    const { store_id, relatorio, params } = await req.json();
    if (!store_id || !relatorio) return json({ erro: "informe store_id e relatorio" }, 400);

    const service = createClient(supabaseUrl, serviceKey);

    // valida acesso a loja (admin ou user_store_access aprovado)
    const [{ data: roleRows }, { data: accessRows }] = await Promise.all([
      service.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin"),
      service.from("user_store_access").select("id").eq("user_id", userId).eq("store_id", store_id).eq("approved", true),
    ]);
    const isAdmin = (roleRows?.length ?? 0) > 0;
    if (!isAdmin && (accessRows?.length ?? 0) === 0) return json({ erro: "sem acesso a esta loja" }, 403);

    const { data: cfg } = await service.from("store_vr_config")
      .select("api_url, api_key, sistema").eq("store_id", store_id).single();
    // Loja sem VR: responde 200 vazio para nao quebrar as telas
    if (!cfg) return json({ ok: true, relatorio, dados: [], aviso: "loja sem conexao VR cadastrada" });

    // Loja no WebSac: delega para a websac-proxy (mesmo formato de retorno)
    if ((cfg.sistema ?? "VR") === "WEBSAC") {
      const resp = await fetch(`${supabaseUrl}/functions/v1/websac-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({ store_id, relatorio, params }),
        signal: AbortSignal.timeout(120000),
      });
      const body = await resp.json().catch(() => null);
      if (!resp.ok || (body && (body as any).erro)) {
        return json({ erro: `WebSac: ${(body as any)?.erro ?? resp.status}` }, 502);
      }
      return json({ ok: true, relatorio, dados: Array.isArray(body) ? body : [] });
    }


    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    qs.set("chave", cfg.api_key);

    const url = `${cfg.api_url.replace(/\/+$/, "")}/relatorios/${relatorio}?${qs.toString()}`;
    const resp = await fetch(url, {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(120000),
    });
    const texto = await resp.text();
    // Tunel ngrok fora do ar / pagina HTML de erro => tratar como "sem conexao VR"
    const pareceHtml = /^\s*<(!doctype|html)/i.test(texto) || /ngrok/i.test(texto.slice(0, 500));
    if (!resp.ok) {
      if (pareceHtml) return json({ erro: `sem conexao VR (servidor respondeu ${resp.status})` }, 200);
      return json({ erro: `API VR ${resp.status}: ${texto.slice(0, 300)}` }, 502);
    }

    let dados: unknown;
    try {
      dados = JSON.parse(texto);
    } catch {
      if (pareceHtml) return json({ erro: "sem conexao VR (resposta invalida do tunel)" }, 200);
      return json({ erro: "resposta VR nao e JSON", corpo: texto.slice(0, 300) }, 502);
    }

    return json({ ok: true, relatorio, dados });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
