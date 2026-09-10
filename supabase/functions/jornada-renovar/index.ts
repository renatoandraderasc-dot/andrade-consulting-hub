// =====================================================================
// Edge Function: jornada-renovar
// Cron: 0 7 * * * (04:00 Brasília / 07:00 UTC)
// Para cada template ATIVO, cria uma execução por LOJA se ainda não existir
// no período atual (dia p/ diarias, semana ISO p/ semanais, mês p/ mensais).
// =====================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Formata "period_ref" no padrão da tabela
function periodoRef(cad: "diaria" | "semanal" | "mensal", d = new Date()) {
  // ajusta pra Brasília (UTC-3), sem DST
  const br = new Date(d.getTime() - 3 * 3600 * 1000);
  const y = br.getUTCFullYear();
  const m = String(br.getUTCMonth() + 1).padStart(2, "0");
  const day = String(br.getUTCDate()).padStart(2, "0");

  if (cad === "mensal") return `${y}-${m}`;
  if (cad === "diaria") return `${y}-${m}-${day}`;

  // semanal — ISO week
  const tmp = new Date(Date.UTC(y, br.getUTCMonth(), br.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) templates ativos
    const { data: templates, error: e1 } = await sb
      .from("jornada_templates")
      .select("id, cadencia")
      .eq("ativo", true);
    if (e1) throw new Error(e1.message);

    // 2) lojas do Hub (a tabela stores não tem coluna ativo)
    const { data: stores, error: e2 } = await sb
      .from("stores")
      .select("id");
    if (e2) throw new Error(e2.message);

    const rows: {
      template_id: string;
      store_id: string;
      periodo_ref: string;
      avulsa: boolean;
    }[] = [];

    for (const t of templates ?? []) {
      const ref = periodoRef(t.cadencia as "diaria" | "semanal" | "mensal");
      for (const s of stores ?? []) {
        rows.push({
          template_id: t.id,
          store_id: s.id,
          periodo_ref: ref,
          avulsa: false,
        });
      }
    }

    // 3) UPSERT — se já existir (template+loja+período), ignora
    let criadas = 0;
    if (rows.length > 0) {
      const { error: e3, count } = await sb
        .from("jornada_execucoes")
        .upsert(rows, {
          onConflict: "template_id,store_id,periodo_ref",
          ignoreDuplicates: true,
          count: "exact",
        });
      if (e3) throw new Error(e3.message);
      criadas = count ?? 0;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        templates: templates?.length ?? 0,
        lojas: stores?.length ?? 0,
        execucoes_novas: criadas,
        quando: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
});
