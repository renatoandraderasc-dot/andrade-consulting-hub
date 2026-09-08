// ============================================================
// reclassificar-lancamentos
// Aplica a classificacao automatica deterministica nos lancamentos
// que ficaram sem classificacao (subtipo OUTROS / "NAO CLASSIFICADO").
//
// Body: { store_id?: uuid, todas?: boolean, forcar?: boolean }
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

    const resumo = new Map<string, number>();
    let lidos = 0;
    let atualizados = 0;
    const pagina = 1000;

    for (let offset = 0; ; offset += pagina) {
      let q = supabase
        .from("lancamentos")
        .select("id, descricao, observacao, tipo, subtipo")
        .order("id")
        .range(offset, offset + pagina - 1);
      if (storeId) q = q.eq("store_id", storeId);
      if (!body.forcar) q = q.eq("subtipo", "OUTROS");

      const { data, error } = await q;
      if (error) return json({ erro: error.message }, 500);
      if (!data || data.length === 0) break;
      lidos += data.length;

      const updates: { id: string; tipo: string; subtipo: string; observacao: string }[] = [];
      for (const l of data) {
        const nomeTipo = nomeTipoDaObs(l.observacao);
        const cls = classificarAuto({
          nomeTipo,
          descricao: l.descricao,
          observacao: l.observacao,
          temDocumento: /·\s*Doc\s/i.test(l.descricao || ""),
        });
        if (cls.tipo === l.tipo && cls.subtipo === l.subtipo) continue;
        const obsLimpa = (l.observacao || "").replace(/^N[ÃA]O CLASSIFICADO — /i, "");
        updates.push({
          id: l.id,
          tipo: cls.tipo,
          subtipo: cls.subtipo,
          observacao: `CLASSIFICADO AUTOMATICAMENTE — ${obsLimpa}`.slice(0, 500),
        });
        resumo.set(`${cls.tipo} / ${cls.subtipo}`, (resumo.get(`${cls.tipo} / ${cls.subtipo}`) ?? 0) + 1);
      }

      for (const u of updates) {
        const { error: e2 } = await supabase
          .from("lancamentos")
          .update({ tipo: u.tipo, subtipo: u.subtipo, observacao: u.observacao })
          .eq("id", u.id);
        if (!e2) atualizados++;
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
