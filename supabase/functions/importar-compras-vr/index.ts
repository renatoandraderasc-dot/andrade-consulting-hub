// ============================================================
// importar-compras-vr
// Importa venda, CMV e compra por departamento/mes da API do VR
// para compras_historico. Usa o mesmo mapeamento secao->departamento.
// Body: { store_id, inicio: "AAAA-MM-DD", fim: "AAAA-MM-DD" }
// (o periodo e quebrado mes a mes automaticamente)
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

function mesesDoPeriodo(inicio: string, fim: string) {
  const out: { ano: number; mes: number; ini: string; fim: string }[] = [];
  const [ai, mi] = inicio.split("-").map(Number);
  const [af, mf] = fim.split("-").map(Number);
  let ano = ai, mes = mi;
  while (ano < af || (ano === af && mes <= mf)) {
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    out.push({
      ano, mes,
      ini: `${ano}-${String(mes).padStart(2, "0")}-01`,
      fim: `${ano}-${String(mes).padStart(2, "0")}-${ultimo}`,
    });
    mes++; if (mes > 12) { mes = 1; ano++; }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { store_id, inicio, fim } = await req.json();
    if (!store_id || !inicio || !fim) return json({ erro: "informe store_id, inicio e fim" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase.from("store_vr_config")
      .select("api_url, api_key").eq("store_id", store_id).single();
    if (!cfg) return json({ erro: "loja sem conexao VR cadastrada" }, 400);

    const { data: mapas } = await supabase.from("vr_secao_departamento")
      .select("secao_vr, department").eq("store_id", store_id);
    const mapa = new Map<string, string>();
    for (const m of mapas ?? []) mapa.set(norm(m.secao_vr), m.department);

    const registros: Record<string, unknown>[] = [];
    const meses = mesesDoPeriodo(inicio, fim);

    for (const m of meses) {
      const url = `${cfg.api_url.replace(/\/+$/, "")}/relatorios/compras_vendas_periodo` +
        `?inicio=${m.ini}&fim=${m.fim}&chave=${encodeURIComponent(cfg.api_key)}`;
      const resp = await fetch(url, {
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: AbortSignal.timeout(120000),
      });
      if (!resp.ok) {
        const corpo = await resp.text();
        return json({ erro: `API VR ${resp.status} em ${m.ini}: ${corpo.slice(0, 300)}` }, 502);
      }
      const linhas: Record<string, string>[] = await resp.json();

      const acc = new Map<string, { venda: number; cmv: number; compra: number }>();
      for (const l of linhas) {
        const dep = mapa.get(norm(l.secao)) ?? "OUTROS";
        const cur = acc.get(dep) ?? { venda: 0, cmv: 0, compra: 0 };
        cur.venda += parseFloat(String(l.total_venda)) || 0;
        cur.cmv += parseFloat(String(l.cmv)) || 0;
        cur.compra += parseFloat(String(l.total_compra)) || 0;
        acc.set(dep, cur);
      }
      for (const [departamento, t] of acc) {
        registros.push({
          store_id, departamento, ano: m.ano, mes: m.mes,
          venda: Math.round(t.venda * 100) / 100,
          cmv: Math.round(t.cmv * 100) / 100,
          compra: Math.round(t.compra * 100) / 100,
          atualizado_em: new Date().toISOString(),
        });
      }
    }

    let gravadas = 0;
    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500);
      const { error } = await supabase.from("compras_historico")
        .upsert(lote, { onConflict: "store_id,departamento,ano,mes" });
      if (error) return json({ erro: error.message, gravadas }, 500);
      gravadas += lote.length;
    }

    return json({ ok: true, meses: meses.length, gravadas });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
