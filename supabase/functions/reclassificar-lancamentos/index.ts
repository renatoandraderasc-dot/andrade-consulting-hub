// ============================================================
// reclassificar-lancamentos
// Aplica a classificacao automatica deterministica nos lancamentos
// que ficaram sem classificacao (subtipo OUTROS / "NAO CLASSIFICADO").
//
// Body: { store_id?: uuid, todas?: boolean }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classificarAuto } from "../_shared/classificarAuto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function nomeTipoDaObs(obs: string | null): string | null {
  if (!obs) return null;
  const m = obs.match(/Tipo de Entrada:\s*(.*?)\s*\(ID/i);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const storeId: string | undefined = body.store_id;
    if (!storeId && !body.todas) return json({ erro: "informe store_id ou todas=true" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Modo "Reclassificar pelo tipo de entrada" (somente lancamentos VR) ----
    if (body.por_tipo_entrada) {
      const resumoTE = new Map<string, number>();
      const contas = new Map<string, string>();
      let lidosTE = 0;
      let atualizadosTE = 0;
      const tam = 1000;
      for (let off = 0; off < 200000; off += tam) {
        let q = supabase
          .from("lancamentos")
          .select("id, tipo, subtipo, tipo_entrada, observacao")
          .eq("origem", "VR")
          .eq("classificacao_manual", false)
          .range(off, off + tam - 1);
        if (storeId) q = q.eq("store_id", storeId);
        const { data, error } = await q;
        if (error) return json({ erro: error.message }, 500);
        if (!data || data.length === 0) break;
        lidosTE += data.length;

        const grupos = new Map<string, string[]>();
        for (const l of data) {
          const nome = (l.tipo_entrada || nomeTipoDaObs(l.observacao) || "").trim();
          if (!nome || /^VR\s*0?$/i.test(nome) || nome === "NÃO CADASTRADO" || nome === "NAO CADASTRADO") continue;
          if (l.subtipo === nome && l.tipo_entrada === nome) continue;
          const g = grupos.get(nome) ?? [];
          g.push(l.id);
          grupos.set(nome, g);
          contas.set(nome, l.tipo || "Despesas");
          resumoTE.set(nome, (resumoTE.get(nome) ?? 0) + 1);
        }

        for (const [nome, ids] of grupos) {
          for (let i = 0; i < ids.length; i += 200) {
            const lote = ids.slice(i, i + 200);
            const { error: e2 } = await supabase
              .from("lancamentos")
              .update({ subtipo: nome, tipo_entrada: nome })
              .in("id", lote);
            if (e2) return json({ erro: e2.message, atualizados: atualizadosTE }, 500);
            atualizadosTE += lote.length;
          }
        }
        if (data.length < tam) break;
      }

      if (storeId && contas.size) {
        const linhas = [...contas.entries()].map(([nome, tipo]) => ({ store_id: storeId, nome, tipo }));
        for (let i = 0; i < linhas.length; i += 200) {
          await supabase.from("controladoria_conta")
            .upsert(linhas.slice(i, i + 200), { onConflict: "store_id,nome", ignoreDuplicates: true });
        }
      }

      return json({
        ok: true,
        modo: "tipo_entrada",
        lidos: lidosTE,
        atualizados: atualizadosTE,
        resumo: Object.fromEntries([...resumoTE.entries()].sort((a, b) => b[1] - a[1])),
      });
    }

    const resumo = new Map<string, number>();
    let lidos = 0;
    let atualizados = 0;
    const pagina = 1000;


    // Os registros saem do filtro (subtipo OUTROS) conforme sao classificados,
    // por isso lemos sempre a primeira pagina ate zerar.
    for (let volta = 0; volta < 200; volta++) {
      let q = supabase
        .from("lancamentos")
        .select("id, descricao, observacao")
        .eq("subtipo", "OUTROS")
        .limit(pagina);
      if (storeId) q = q.eq("store_id", storeId);

      const { data, error } = await q;
      if (error) return json({ erro: error.message }, 500);
      if (!data || data.length === 0) break;
      lidos += data.length;

      // agrupa por classificacao para atualizar em lote
      const grupos = new Map<string, { tipo: string; subtipo: string; ids: string[] }>();
      for (const l of data) {
        const cls = classificarAuto({
          nomeTipo: nomeTipoDaObs(l.observacao),
          somenteTipo: true,
        });
        const chave = `${cls.tipo}||${cls.subtipo}`;
        const g = grupos.get(chave) ?? { tipo: cls.tipo, subtipo: cls.subtipo, ids: [] };
        g.ids.push(l.id);
        grupos.set(chave, g);
        resumo.set(`${cls.tipo} / ${cls.subtipo}`, (resumo.get(`${cls.tipo} / ${cls.subtipo}`) ?? 0) + 1);
      }

      for (const g of grupos.values()) {
        for (let i = 0; i < g.ids.length; i += 200) {
          const lote = g.ids.slice(i, i + 200);
          const { error: e2 } = await supabase
            .from("lancamentos")
            .update({ tipo: g.tipo, subtipo: g.subtipo })
            .in("id", lote);
          if (e2) return json({ erro: e2.message, atualizados }, 500);
          atualizados += lote.length;
        }
      }

      if (data.length < pagina) break;
    }

    return json({
      ok: true,
      lidos,
      atualizados,
      resumo: Object.fromEntries([...resumo.entries()].sort((a, b) => b[1] - a[1])),
    });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
