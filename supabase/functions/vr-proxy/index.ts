// ============================================================
// vr-proxy
// Consulta relatorios da ponte da loja (VR/ORACLE/WEBSAC/DIRECTOR).
// Body: { store_id, relatorio, params: Record<string,string>, forcar?: boolean }
//
// Lojas com store_vr_config.modo_sync = 'diario_d1' NAO sao consultadas
// ao vivo: a resposta vem do relatorio_cache (D-1), alimentado pelo job
// sync-diario-d1 as 08:00. `forcar: true` (botao Atualizar) consulta a
// ponte e renova o cache daquele relatorio/periodo.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";
import { consultarComCache, gravarUltimaLeitura, lerUltimaLeitura, type ConfigLojaCache } from "../_shared/cacheRelatorio.ts";

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

    const { store_id, relatorio, params, forcar } = await req.json();
    if (!store_id || !relatorio) return json({ erro: "informe store_id e relatorio" }, 400);

    const service = createClient(supabaseUrl, serviceKey);

    // valida acesso a loja (admin ou user_store_access aprovado)
    const [{ data: roleRows }, { data: accessRows }] = await Promise.all([
      service.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin"),
      service.from("user_store_access").select("id").eq("user_id", userId).eq("store_id", store_id).eq("approved", true),
    ]);
    const isAdmin = (roleRows?.length ?? 0) > 0;
    if (!isAdmin && (accessRows?.length ?? 0) === 0) return json({ erro: "sem acesso a esta loja" }, 403);

    // config da loja (com modo_sync)
    const { data: cfgRow } = await service
      .from("store_vr_config")
      .select("api_url, api_key, sistema, codigo_loja, modo_sync")
      .eq("store_id", store_id)
      .maybeSingle();
    const cfg = (cfgRow as ConfigLojaCache | null) ?? null;

    // ultima leitura guardada (usada sempre que a loja nao responder)
    const ultima = async () =>
      await lerUltimaLeitura({ supabaseUrl, serviceKey, storeId: store_id, relatorio, params });

    if (!cfg) {
      const u = await ultima();
      if (u) {
        return json({
          ok: true, relatorio, dados: u.dados, origem: "cache",
          cache_em: u.atualizado_em, aviso: "dados da ultima atualizacao",
        });
      }
      return json({ ok: true, relatorio, dados: [], aviso: "loja sem conexao VR cadastrada" });
    }

    // ---------- modo diario D-1: cache primeiro ----------
    if ((cfg.modo_sync ?? "ao_vivo") === "diario_d1") {
      const r = await consultarComCache({
        supabaseUrl, serviceKey, storeId: store_id, relatorio, params, cfg,
        forcar: forcar === true, origem: forcar === true ? "manual" : "proxy",
      });
      if (!r.ok) {
        console.error("vr-proxy falha (diario_d1)", JSON.stringify({ store_id, relatorio, erro: r.erro }));
        const u = await ultima();
        if (u) {
          return json({
            ok: true, relatorio, dados: u.dados, origem: "cache",
            cache_em: u.atualizado_em, modo: "diario_d1", aviso: "dados da ultima atualizacao",
          });
        }
        return json({ erro: r.erro ?? "falha ao consultar o sistema da loja", dados: [] }, 200);
      }
      return json({
        ok: true, relatorio, dados: r.dados,
        origem: r.origem, cache_em: r.cache_em, modo: "diario_d1",
        aviso: r.recortado_d1 ? "dados ate ontem (D-1)" : undefined,
      });
    }

    // ---------- modo ao vivo (comportamento original) ----------
    const r = await consultarRelatorioLoja({
      supabaseUrl, serviceKey, storeId: store_id, relatorio, params, cfg,
    });
    if (!r.ok) {
      const msg = r.erro ?? "falha ao consultar o sistema da loja";
      console.error("vr-proxy falha", JSON.stringify({ store_id, relatorio, erro: msg }));
      const u = await ultima();
      if (u) {
        return json({
          ok: true, relatorio, dados: u.dados, origem: "cache",
          cache_em: u.atualizado_em, modo: "ao_vivo", aviso: "dados da ultima atualizacao",
        });
      }
      return json({ erro: msg, dados: [] }, 200);
    }
    // guarda a leitura para servir de historico quando a loja cair
    const em = await gravarUltimaLeitura({
      supabaseUrl, serviceKey, storeId: store_id, relatorio, params, dados: r.dados, origem: "proxy",
    });
    return json({ ok: true, relatorio, dados: r.dados, modo: "ao_vivo", origem: "ponte", cache_em: em });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
