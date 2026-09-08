// ============================================================
// consultar-lancamentos-vr
// Consulta os pagamentos do periodo direto na ponte do cliente VR
// e devolve as linhas. NAO grava nada no banco.
//
// Body: { store_id, inicio: "AAAA-MM-DD", fim: "AAAA-MM-DD" }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pick(x: Record<string, unknown>, nomes: string[]) {
  const mapa = new Map<string, unknown>();
  for (const k of Object.keys(x)) mapa.set(k.toLowerCase().trim(), x[k]);
  for (const n of nomes) {
    const v = mapa.get(n);
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { store_id, inicio, fim } = await req.json();
    if (!store_id || !inicio || !fim) return json({ erro: "informe store_id, inicio e fim" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: cfg } = await supabase.from("store_vr_config")
      .select("api_url, api_key, sistema, codigo_loja").eq("store_id", store_id).single();
    if (!cfg) return json({ erro: "loja sem conexao VR cadastrada" }, 400);

    const base = {
      supabaseUrl: Deno.env.get("SUPABASE_URL")!,
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      storeId: store_id,
      params: { inicio, fim },
      cfg,
      timeoutMs: 90000,
    };

    let r = await consultarRelatorioLoja({ ...base, relatorio: "pagamentos_periodo" });
    if (!r.ok || r.dados.length === 0) {
      const alt = await consultarRelatorioLoja({ ...base, relatorio: "contas_a_pagar" });
      if (alt.ok && alt.dados.length) r = alt;
    }
    if (!r.ok) return json({ erro: r.erro }, 502);

    const NOMES_TIPO = ["tipo", "tipo_entrada", "tipoentrada", "descricao_tipo", "nome_tipo", "tipo_de_entrada", "desc_tipo"];
    const NOMES_ID_TIPO = ["id_tipo", "id_tipo_entrada", "tipo_entrada_id", "cod_tipo_entrada", "codigo_tipo"];

    const linhas = (r.dados as Record<string, unknown>[]).map((x) => {
      const t = pick(x, NOMES_TIPO);
      return {
        data: String(x.vencimento ?? x.data_pagamento ?? "").slice(0, 10),
        pagamento: String(x.data_pagamento ?? x.vencimento ?? "").slice(0, 10),
        fornecedor: x.fornecedor ?? null,
        documento: x.documento ?? null,
        tipo_entrada: t ? String(t).trim() : null,
        id_tipo: pick(x, NOMES_ID_TIPO),
        valor: Number(x.valor_pago ?? x.valor ?? 0) || 0,
        observacao: x.observacao ?? null,
      };
    });

    return json({ ok: true, inicio, fim, total: linhas.length, linhas });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
