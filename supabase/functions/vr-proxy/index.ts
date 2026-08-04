// ============================================================
// vr-proxy
// Consulta ao vivo relatorios da API do VR (compras_vendas_periodo,
// compras_por_fornecedor, etc). Usa a config armazenada em
// store_vr_config. Requer usuario autenticado com acesso a loja.
// Body: { store_id, relatorio, params: Record<string,string> }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";

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

    const r = await consultarRelatorioLoja({
      supabaseUrl, serviceKey, storeId: store_id, relatorio, params,
    });

    // Loja sem conexao cadastrada: responde 200 vazio para nao quebrar as telas
    if (r.semConfig) {
      return json({ ok: true, relatorio, dados: [], aviso: "loja sem conexao VR cadastrada" });
    }
    if (!r.ok) return json({ erro: r.erro }, r.semConexao ? 200 : 502);

    return json({ ok: true, relatorio, dados: r.dados });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
