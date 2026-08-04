// ============================================================
// importar-historico-vr
// Importa o REALIZADO de um periodo (ex.: o mes base das metas)
// para store_daily_metrics. Funciona tanto para lojas VR quanto
// WebSac (delegando para a websac-proxy).
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

// Fallback quando a loja nao tem mapeamento secao->departamento cadastrado
function inferirDepartamento(texto: string): string {
  const t = norm(texto);
  if (/PADAR|PANIF|CONFEIT|BOLO|PAO/.test(t)) return "PADARIA";
  if (/ACOUG|CARNE|BOVIN|SUIN|AVE|FRANGO|FRIOS E CARNES|PEIXE|PESCAD/.test(t)) return "AÇOUGUE";
  if (/HORTI|FRUTA|VERDUR|LEGUM|FLV/.test(t)) return "HORTIFRUTI";
  return "OUTROS";
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: cfg, error: cfgErr } = await supabase
      .from("store_vr_config")
      .select("api_url, api_key, sistema")
      .eq("store_id", store_id)
      .single();
    if (cfgErr || !cfg) return json({ erro: "loja sem conexao cadastrada" }, 400);

    const { data: mapas } = await supabase
      .from("vr_secao_departamento")
      .select("secao_vr, department")
      .eq("store_id", store_id);
    const mapa = new Map<string, string>();
    for (const m of mapas ?? []) mapa.set(norm(m.secao_vr), m.department);

    // --- busca as vendas por secao no periodo -----------------
    let linhas: Record<string, string>[] = [];

    if ((cfg.sistema ?? "VR") === "WEBSAC") {
      const resp = await fetch(`${supabaseUrl}/functions/v1/websac-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          store_id,
          relatorio: "vendas_secao_periodo",
          params: { inicio, fim },
        }),
        signal: AbortSignal.timeout(120000),
      });
      const body = await resp.json().catch(() => null);
      if (!resp.ok || (body && (body as { erro?: string }).erro)) {
        return json({ erro: `WebSac: ${(body as { erro?: string })?.erro ?? resp.status}` }, 502);
      }
      linhas = Array.isArray(body) ? body : (body?.dados ?? []);
    } else {
      const url = `${cfg.api_url.replace(/\/+$/, "")}/relatorios/vendas_secao_periodo` +
        `?inicio=${inicio}&fim=${fim}&chave=${encodeURIComponent(cfg.api_key)}`;
      const resp = await fetch(url, {
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: AbortSignal.timeout(120000),
      });
      const texto = await resp.text();
      const pareceHtml = /^\s*<(!doctype|html)/i.test(texto) || /ngrok/i.test(texto.slice(0, 500));
      if (!resp.ok || pareceHtml) {
        return json({ erro: `sem conexao VR (servidor respondeu ${resp.status})` }, 502);
      }
      linhas = JSON.parse(texto);
    }

    // --- agrega por (data, departamento) + total da LOJA -------
    const acc = new Map<string, { date: string; department: string; vendas: number; lucro: number; volume: number }>();
    const somar = (date: string, department: string, vendas: number, lucro: number, volume: number) => {
      const k = `${date}|${department}`;
      const cur = acc.get(k) ?? { date, department, vendas: 0, lucro: 0, volume: 0 };
      cur.vendas += vendas; cur.lucro += lucro; cur.volume += volume;
      acc.set(k, cur);
    };

    for (const l of linhas) {
      const secao = String(l.secao ?? "");
      const dep = mapa.get(norm(secao)) ??
        inferirDepartamento(`${secao} ${l.categoria ?? ""} ${l.grupo ?? ""}`);
      const date = String(l.data).slice(0, 10);
      const vendas = parseFloat(String(l.total_vendido)) || 0;
      const lucro = parseFloat(String(l.lucro)) || 0;
      const volume = parseFloat(String(l.volume)) || 0;
      somar(date, dep, vendas, lucro, volume);
      somar(date, "LOJA", vendas, lucro, volume);
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

    let gravadas = 0;
    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500);
      const { error } = await supabase
        .from("store_daily_metrics")
        .upsert(lote, { onConflict: "store_id,department,date" });
      if (error) return json({ erro: error.message, gravadas }, 500);
      gravadas += lote.length;
    }

    return json({
      ok: true,
      periodo: { inicio, fim },
      linhas_api: linhas.length,
      gravadas,
      linhas_gravadas: gravadas,
    });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
