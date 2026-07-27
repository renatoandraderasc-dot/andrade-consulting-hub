// ============================================================
// importar-historico-vr
// Importa o REALIZADO de um periodo (ex.: o mes base das metas)
// da API do VR para store_daily_metrics, usando o mesmo
// mapeamento secao->departamento da sincronizacao diaria.
// Body: { store_id, inicio: "AAAA-MM-DD", fim: "AAAA-MM-DD" }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function norm(s: string): string {
  return (s || "").toUpperCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { store_id, inicio, fim } = await req.json();
    if (!store_id || !inicio || !fim) {
      return json({ erro: "informe store_id, inicio e fim" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg, error: cfgErr } = await supabase
      .from("store_vr_config")
      .select("api_url, api_key")
      .eq("store_id", store_id)
      .single();
    if (cfgErr || !cfg) return json({ erro: "loja sem conexao VR cadastrada" }, 400);

    const { data: mapas } = await supabase
      .from("vr_secao_departamento")
      .select("secao_vr, department")
      .eq("store_id", store_id);
    const mapa = new Map<string, string>();
    for (const m of mapas ?? []) mapa.set(norm(m.secao_vr), m.department);

    const url = `${cfg.api_url.replace(/\/+$/, "")}/relatorios/vendas_secao_periodo` +
      `?inicio=${inicio}&fim=${fim}&chave=${encodeURIComponent(cfg.api_key)}`;
    const resp = await fetch(url, {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) {
      const corpo = await resp.text();
      return json({ erro: `API VR respondeu ${resp.status}: ${corpo.slice(0, 300)}` }, 502);
    }
    const linhas: Record<string, string>[] = await resp.json();

    // agrega por (data, departamento)
    const acc = new Map<string, { date: string; department: string; vendas: number; lucro: number; volume: number }>();
    for (const l of linhas) {
      const dep = mapa.get(norm(l.secao)) ?? "OUTROS";
      const date = String(l.data).slice(0, 10);
      const k = `${date}|${dep}`;
      const cur = acc.get(k) ?? { date, department: dep, vendas: 0, lucro: 0, volume: 0 };
      cur.vendas += parseFloat(String(l.total_vendido)) || 0;
      cur.lucro += parseFloat(String(l.lucro)) || 0;
      cur.volume += parseFloat(String(l.volume)) || 0;
      acc.set(k, cur);
    }

    const registros = [...acc.values()].map((r) => ({
      store_id,
      department: r.department,
      date: r.date,
      realizado_vendas: Math.round(r.vendas * 100) / 100,
      realizado_lucro: Math.round(r.lucro * 100) / 100,
      realizado_margem_pct: r.vendas > 0 ? Math.round((r.lucro / r.vendas) * 10000) / 100 : 0,
      realizado_volume: Math.round(r.volume * 1000) / 1000,
    }));

    // grava em lotes de 500
    let gravadas = 0;
    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500);
      const { error } = await supabase
        .from("store_daily_metrics")
        .upsert(lote, { onConflict: "store_id,department,date" });
      if (error) return json({ erro: error.message, gravadas }, 500);
      gravadas += lote.length;
    }

    return json({ ok: true, periodo: { inicio, fim }, linhas_api: linhas.length, gravadas });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
