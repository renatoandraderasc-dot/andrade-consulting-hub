import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// plataforma -> edge function do coletor
export const COLETORES: Record<string, string> = {
  vtex: "vtex-catalog-collector",
  opencart: "opencart-collector",
};

const NOMES: Record<string, string> = {
  vtex: "VTEX",
  opencart: "OpenCart",
  regex_solutions: "Regex Solutions",
  shopify: "Shopify",
  magento: "Magento",
  tray: "Tray",
  nuvemshop: "Nuvemshop",
  woocommerce: "WooCommerce",
  desconhecida: "não identificada",
};

async function chamar(fn: string, body: unknown) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "start";
    const siteId = body.site_id ?? body.site_concorrente_id;

    // ações sobre um job já existente: descobrir a plataforma pelo job
    let plataforma = String(body.plataforma || "");
    let siteNome = "";
    let site: any = null;

    if (siteId) {
      const { data } = await supabase
        .from("sites_concorrentes").select("*").eq("id", siteId).maybeSingle();
      if (!data) throw new Error("site não encontrado no catálogo");
      site = data;
      plataforma = String(data.plataforma || "");
      siteNome = data.nome;
    } else if (body.jobId) {
      const { data: job } = await supabase
        .from("scrape_jobs").select("site_concorrente_id").eq("id", body.jobId).maybeSingle();
      if (job?.site_concorrente_id) {
        const { data } = await supabase
          .from("sites_concorrentes").select("*").eq("id", job.site_concorrente_id).maybeSingle();
        site = data;
        plataforma = String(data?.plataforma || "");
        siteNome = data?.nome || "";
      }
    }

    if (!plataforma) throw new Error("não foi possível identificar a plataforma do site");

    const fn = COLETORES[plataforma];
    if (!fn) {
      const msg =
        `Plataforma ${NOMES[plataforma] || plataforma} reconhecida, mas ainda não há coletor implementado.`;
      if (action === "start" && siteId) {
        await supabase.from("scrape_jobs").insert({
          competitor_url: `https://${site?.host || ""}`,
          competitor_name: siteNome,
          site_concorrente_id: siteId,
          host: site?.host || "",
          status: "error",
          progress_pct: 0,
          error_message: msg,
          log_lines: [msg],
          fila: [],
          finished_at: new Date().toISOString(),
        });
        await supabase.from("sites_concorrentes")
          .update({ status_ultima_coleta: "sem coletor" }).eq("id", siteId);
      }
      return json({ success: false, error: msg, coletor_disponivel: false }, 400);
    }

    const data = await chamar(fn, {
      ...body,
      action,
      site_id: siteId,
      host: body.host ?? site?.host,
      sc: body.sc ?? site?.sc ?? 1,
      cep: body.cep ?? site?.cep_referencia,
      store_id: body.store_id ?? site?.loja_externa_id,
    });
    return json(data, data?.success === false ? 400 : 200);
  } catch (e) {
    return json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      400,
    );
  }
});
