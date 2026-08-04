// ============================================================
// sync-vr-metrics
// Para cada loja com conexao VR ativa, busca as vendas por secao
// (hoje e ontem) na API do VR e grava o REALIZADO em
// store_daily_metrics — as metas continuam vindo do Admin Metas.
// Protegida pelo header x-sync-secret (env SYNC_VR_SECRET).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

// Normaliza nomes de secao para casar com o mapeamento
function norm(s: string): string {
  return (s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferirDepartamento(secaoNormalizada: string, mapaLoja: Map<string, string>): string {
  const mapeadoExato = mapaLoja.get(secaoNormalizada);
  if (mapeadoExato) return mapeadoExato;

  for (const [secaoMapeada, department] of mapaLoja) {
    if (secaoMapeada.includes(secaoNormalizada) || secaoNormalizada.includes(secaoMapeada)) {
      return department;
    }
  }

  if (/HORT|FRUTA|VERD|LEGUME|FLV|SACOLAO|BANANA|TOMATE|BATATA|CEBOLA/.test(secaoNormalizada)) {
    return "HORTIFRUTI";
  }
  if (/ACOUG|CARNE|BOVIN|SUIN|AVE|FRANGO|PEIX|LINGUICA|FRIOS|RESFRIADO/.test(secaoNormalizada)) {
    return "AÇOUGUE";
  }
  if (/PADAR| PAO|^PAO|CONFEIT|BOLO|SALGADO/.test(secaoNormalizada)) {
    return "PADARIA";
  }

  return "OUTROS";
}

// Datas de hoje e ontem no fuso de Brasilia
function datasParaSincronizar(): string[] {
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  return [fmt(ontem), fmt(agora)];
}

interface LinhaVr {
  secao: string;
  total_vendido: string | number;
  custo_total?: string | number;
  lucro: string | number;
  margem_pct?: string | number;
  volume?: string | number;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Autorizacao: aceita x-sync-secret (chamadas manuais/protegidas) OU
  // presenca do header apikey/authorization (cron via pg_net com anon key).
  const segredo = Deno.env.get("SYNC_VR_SECRET");
  const temSegredo = segredo && req.headers.get("x-sync-secret") === segredo;
  const temApiKey = !!(req.headers.get("apikey") || req.headers.get("authorization"));
  if (!temSegredo && !temApiKey) {
    return new Response(JSON.stringify({ erro: "nao autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ erro: "configuracao do backend ausente" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: configs, error: cfgErr } = await supabase
    .from("store_vr_config")
    .select("store_id, api_url, api_key, sistema")
    .eq("enabled", true);
  if (cfgErr) {
    return new Response(JSON.stringify({ erro: cfgErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: mapas } = await supabase
    .from("vr_secao_departamento")
    .select("store_id, secao_vr, department");

  const [dataOntem, dataHoje] = datasParaSincronizar();
  const datas = [dataOntem, dataHoje];

  const resumo: Record<string, unknown>[] = [];

  for (const cfg of configs ?? []) {
    const mapaLoja = new Map<string, string>();
    for (const m of mapas ?? []) {
      if (m.store_id === cfg.store_id) mapaLoja.set(norm(m.secao_vr), m.department);
    }

    let gravadas = 0;
    let erroLoja: string | null = null;

    for (const dataDia of datas) {
      try {
        const relatorio = dataDia === dataHoje ? "vendas_secao_agora" : "vendas_secao_dia";
        const r = await consultarRelatorioLoja({
          supabaseUrl, serviceKey: serviceRoleKey, storeId: cfg.store_id,
          relatorio, params: { data: dataDia }, cfg, timeoutMs: 60000,
        });
        if (!r.ok) throw new Error(`${r.erro ?? "falha"} em ${dataDia}`);
        const linhas = r.dados as unknown as LinhaVr[];

        const porDepto = new Map<string, { vendas: number; lucro: number; volume: number; temVolume: boolean }>();
        for (const l of linhas) {
          const depto = inferirDepartamento(norm(l.secao), mapaLoja);
          const atual = porDepto.get(depto) ?? { vendas: 0, lucro: 0, volume: 0, temVolume: false };
          atual.vendas += parseFloat(String(l.total_vendido)) || 0;
          atual.lucro += parseFloat(String(l.lucro)) || 0;
          if (l.volume !== undefined && l.volume !== null) {
            atual.volume += parseFloat(String(l.volume)) || 0;
            atual.temVolume = true;
          }
          porDepto.set(depto, atual);
        }

        // Agrega LOJA (Supermercado — Total) como soma de todos os departamentos do dia
        const totalLoja = { vendas: 0, lucro: 0, volume: 0, temVolume: false };
        for (const tot of porDepto.values()) {
          totalLoja.vendas += tot.vendas;
          totalLoja.lucro += tot.lucro;
          totalLoja.volume += tot.volume;
          if (tot.temVolume) totalLoja.temVolume = true;
        }
        porDepto.set("LOJA", totalLoja);

        for (const [department, tot] of porDepto) {
          const payload: Record<string, unknown> = {
            store_id: cfg.store_id,
            department,
            date: dataDia,
            realizado_vendas: Math.round(tot.vendas * 100) / 100,
            realizado_lucro: Math.round(tot.lucro * 100) / 100,
            realizado_margem_pct: tot.vendas > 0
              ? Math.round((tot.lucro / tot.vendas) * 10000) / 100
              : 0,
          };
          if (tot.temVolume) {
            payload.realizado_volume = Math.round(tot.volume * 1000) / 1000;
          }
          const { error: upErr } = await supabase
            .from("store_daily_metrics")
            .upsert(payload, { onConflict: "store_id,department,date" });
          if (upErr) throw new Error(`upsert ${department} ${dataDia}: ${upErr.message}`);
          gravadas++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        erroLoja = erroLoja ? `${erroLoja} | ${msg}` : msg;
      }
    }

    await supabase
      .from("store_vr_config")
      .update({ last_sync_at: new Date().toISOString(), last_error: erroLoja })
      .eq("store_id", cfg.store_id);

    resumo.push({ store_id: cfg.store_id, gravadas, erro: erroLoja });
  }

  return new Response(JSON.stringify({ ok: true, datas, lojas: resumo }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
