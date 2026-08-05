// ============================================================
// importar-lancamentos-vr
// Le os PAGAMENTOS REALIZADOS no VR (por data de pagamento) e grava
// em public.lancamentos ja classificados no tipo/subtipo da Cont Rede,
// usando o de-para vr_lancamento_map.
//
// Body: { store_id, user_id, inicio: "AAAA-MM-DD", fim: "AAAA-MM-DD" }
//   ou  { store_id, user_id, meses_atras: 3 }
//
// Reimportar o mesmo periodo ATUALIZA os lancamentos (nao duplica),
// gracas ao indice unico (store_id, origem, origem_ref).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function blocosMensais(inicio: string, fim: string) {
  const out: { ini: string; fim: string }[] = [];
  const dIni = new Date(inicio + "T00:00:00Z");
  const dFim = new Date(fim + "T00:00:00Z");
  let cur = new Date(Date.UTC(dIni.getUTCFullYear(), dIni.getUTCMonth(), 1));
  while (cur <= dFim) {
    const ultimo = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const ini = cur < dIni ? dIni : cur;
    const f = ultimo > dFim ? dFim : ultimo;
    out.push({ ini: fmt(ini), fim: fmt(f) });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

interface LinhaVr {
  data_pagamento: string;
  vencimento: string;
  valor: string;
  acrescimo: string;
  valor_pago: string;
  fornecedor: string | null;
  documento: number | null;
  id_tipo: number | null;
  observacao: string | null;
  origem: string;
  ref: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const { store_id, user_id } = body;
    if (!store_id || !user_id) return json({ erro: "informe store_id e user_id" }, 400);

    let inicio = body.inicio;
    let fim = body.fim;
    if (body.meses_atras) {
      const hoje = new Date();
      fim = fmt(hoje);
      inicio = fmt(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - Number(body.meses_atras) + 1, 1)));
    }
    if (!inicio || !fim) return json({ erro: "informe inicio e fim, ou meses_atras" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase.from("store_vr_config")
      .select("api_url, api_key, sistema").eq("store_id", store_id).single();
    if (!cfg) return json({ erro: "loja sem conexao VR cadastrada" }, 400);

    // de-para: excecao da loja tem prioridade sobre o padrao (store_id NULL)
    const { data: mapas } = await supabase.from("vr_lancamento_map")
      .select("store_id, id_tipo, tipo, subtipo")
      .or(`store_id.eq.${store_id},store_id.is.null`);
    const padrao = new Map<number, { tipo: string; subtipo: string }>();
    const daLoja = new Map<number, { tipo: string; subtipo: string }>();
    for (const m of mapas ?? []) {
      (m.store_id ? daLoja : padrao).set(m.id_tipo, { tipo: m.tipo, subtipo: m.subtipo });
    }
    const classificar = (idTipo: number | string | null) => {
      const n = idTipo === null || idTipo === "" ? NaN : Number(idTipo);
      if (Number.isNaN(n)) return undefined;
      return daLoja.get(n) ?? padrao.get(n);
    };

    const blocos = blocosMensais(inicio, fim);
    const detalhe: Record<string, unknown>[] = [];
    const naoClassificados = new Map<number, { qtd: number; valor: number; exemplo: string }>();
    let gravadosTotal = 0;

    for (const b of blocos) {
      const r = await consultarRelatorioLoja({
        supabaseUrl: Deno.env.get("SUPABASE_URL")!,
        serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        storeId: store_id,
        relatorio: "pagamentos_periodo",
        params: { inicio: b.ini, fim: b.fim },
        cfg,
        timeoutMs: 90000,
      });
      if (!r.ok) {
        detalhe.push({ periodo: b.ini, erro: r.erro });
        continue;
      }
      const linhas = r.dados as unknown as LinhaVr[];

      const registros = [];
      const vistos = new Set<string>();
      for (const l of linhas) {
        const ref = String(l.ref ?? "");
        if (!ref || vistos.has(ref)) continue;
        vistos.add(ref);
        // transferencias entre lojas nao sao despesa nem compra
        if (l.origem === "TRANSFERENCIA") continue;

        const cls = classificar(l.id_tipo);
        const data = String(l.data_pagamento).slice(0, 10);
        const [ano, mes] = data.split("-").map(Number);
        const valor = parseFloat(String(l.valor_pago)) || 0;

        if (!cls) {
          const at = naoClassificados.get(Number(l.id_tipo ?? -1)) ??
            { qtd: 0, valor: 0, exemplo: l.fornecedor ?? "" };
          at.qtd++; at.valor += valor;
          naoClassificados.set(Number(l.id_tipo ?? -1), at);
        }

        const partes = [l.fornecedor, l.documento ? `Doc ${l.documento}` : null, l.observacao]
          .filter(Boolean).join(" · ");

        registros.push({
          store_id,
          user_id,
          data,
          competencia_mes: mes,
          competencia_ano: ano,
          tipo: cls?.tipo ?? "Despesas",
          subtipo: cls?.subtipo ?? "OUTROS",
          descricao: partes.slice(0, 300) || "Pagamento VR",
          valor: Math.round(valor * 100) / 100,
          observacao: cls ? null : `NAO CLASSIFICADO — tipo ${l.id_tipo}`,
          status: "ativo",
          origem: "VR",
          origem_ref: ref,
        });
      }

      let gravados = 0;
      for (let i = 0; i < registros.length; i += 500) {
        const lote = registros.slice(i, i + 500);
        const { error } = await supabase.from("lancamentos")
          .upsert(lote, { onConflict: "store_id,origem,origem_ref" });
        if (error) { detalhe.push({ periodo: b.ini, erro: error.message, gravados }); break; }
        gravados += lote.length;
      }
      gravadosTotal += gravados;
      detalhe.push({ periodo: b.ini, linhas_api: linhas.length, gravados });
    }

    const pendentes = [...naoClassificados.entries()]
      .map(([id_tipo, v]) => ({ id_tipo, lancamentos: v.qtd, valor: Math.round(v.valor * 100) / 100, exemplo: v.exemplo }))
      .sort((a, b) => b.valor - a.valor);

    return json({ ok: true, inicio, fim, meses: blocos.length, gravados: gravadosTotal, detalhe, pendentes });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
