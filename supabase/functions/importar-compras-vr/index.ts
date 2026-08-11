// ============================================================
// importar-compras-vr
// Importa venda, CMV e compra por departamento/mes da API do VR
// para compras_historico. Usa o mesmo mapeamento secao->departamento.
// Body: { store_id, inicio: "AAAA-MM-DD", fim: "AAAA-MM-DD" }
// (o periodo e quebrado mes a mes automaticamente)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { data: cfg } = await supabase.from("store_vr_config")
      .select("api_url, api_key, sistema, codigo_loja").eq("store_id", store_id).single();
    if (!cfg) return json({ erro: "loja sem conexao cadastrada" }, 400);

    const { data: mapas } = await supabase.from("vr_secao_departamento")
      .select("secao_vr, department").eq("store_id", store_id);
    const mapa = new Map<string, string>();
    for (const m of mapas ?? []) mapa.set(norm(m.secao_vr), m.department);

    // busca compras x vendas no sistema da loja (VR ou WebSac)
    async function buscar(ini: string, fimM: string): Promise<Record<string, string>[]> {
      const r = await consultarRelatorioLoja({
        supabaseUrl, serviceKey, storeId: store_id,
        relatorio: "compras_vendas_periodo",
        params: { inicio: ini, fim: fimM },
        cfg,
      });
      if (!r.ok) throw new Error(r.erro ?? "falha ao consultar o sistema da loja");
      return r.dados as Record<string, string>[];
    }

    const registros: Record<string, unknown>[] = [];
    const meses = mesesDoPeriodo(inicio, fim);

    for (const m of meses) {
      let linhas: Record<string, string>[] = [];
      try {
        linhas = await buscar(m.ini, m.fim);
      } catch (e) {
        return json({ erro: e instanceof Error ? e.message : String(e) }, 502);
      }

      const acc = new Map<string, { venda: number; cmv: number; compra: number }>();
      for (const l of linhas) {
        // departamento nivel 1 vindo do proprio relatorio; mapeamento so como fallback
        const dep = String(l.departamento ?? "").trim() ||
          mapa.get(norm(l.secao)) || "SEM DEPARTAMENTO";
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


    // O histórico é um retrato mensal. Remova o retrato anterior antes de
    // gravar o atual para não manter departamentos/valores de consultas antigas.
    let gravadas = 0;
    for (const m of meses) {
      const { error: deleteError } = await supabase.from("compras_historico")
        .delete()
        .eq("store_id", store_id)
        .eq("ano", m.ano)
        .eq("mes", m.mes);
      if (deleteError) return json({ erro: deleteError.message, gravadas }, 500);

      const registrosMes = registros.filter((r) => r.ano === m.ano && r.mes === m.mes);
      for (let i = 0; i < registrosMes.length; i += 500) {
        const lote = registrosMes.slice(i, i + 500);
        const { error } = await supabase.from("compras_historico").insert(lote);
        if (error) return json({ erro: error.message, gravadas }, 500);
        gravadas += lote.length;
      }
    }

    return json({ ok: true, meses: meses.length, gravadas });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
