// ============================================================
// sync-diario-d1
// Roda as 08:00 (cron) ou sob demanda (botao Atualizar / body.store_id).
// Para cada loja com modo_sync = 'diario_d1':
//  1. renova as consultas ja existentes no cache cujo periodo termina nos
//     ultimos 8 dias (janelas "mes corrente", "ultimos 7 dias" etc.) —
//     a janela e ROLADA para terminar em ontem (D-1)
//  2. renova as consultas sem data (produtos, precos, estoque atual...)
//  3. pre-aquece as janelas padrao dos relatorios principais
//  4. apaga cache com mais de 60 dias sem uso
// Loja offline nao apaga nada do cache.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarComCache, ontemBrasilia, type ConfigLojaCache } from "../_shared/cacheRelatorio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

// Relatorios pre-aquecidos todas as manhas (janelas padrao das telas)
const PERIODICOS = [
  "kpis_periodo", "kpis_pic_periodo", "vendas_secao_periodo", "vendas_secao_dia",
  "vendas_departamento_dia", "vendas_dep_periodo", "compras_vendas_periodo",
  "ranking_produtos", "cupons_e_ticket", "receber_periodo", "pagamentos_periodo",
  "contas_a_pagar", "dre_periodo", "estoque_dinamico", "compras_por_fornecedor",
];
const SNAPSHOT = ["produtos", "produtos_precos", "estoque_atual", "produtos_ativos_12m"];
const MESES_HISTORICO = ["resultados_mensais", "resultados_mensais_depto", "rede_mensal", "mix_trimestre"];

function addDias(d: string, n: number): string {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function janelasPadrao(ontem: string): Array<Record<string, string>> {
  const [ano, mes] = ontem.split("-");
  const inicioMes = `${ano}-${mes}-01`;
  const mesAnteriorFim = addDias(inicioMes, -1);
  const mesAnteriorIni = mesAnteriorFim.slice(0, 8) + "01";
  return [
    { inicio: inicioMes, fim: ontem },          // mes corrente ate ontem
    { inicio: addDias(ontem, -6), fim: ontem }, // ultimos 7 dias
    { inicio: addDias(ontem, -29), fim: ontem },// ultimos 30 dias
    { inicio: mesAnteriorIni, fim: mesAnteriorFim }, // mes anterior fechado
  ];
}

async function comLimite<T, R>(itens: T[], limite: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (idx < itens.length) { const i = idx++; out[i] = await fn(itens[i]); }
  });
  await Promise.all(workers);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const segredo = Deno.env.get("SYNC_VR_SECRET");
  const temSegredo = segredo && req.headers.get("x-sync-secret") === segredo;
  const temApiKey = !!(req.headers.get("apikey") || req.headers.get("authorization"));
  if (!temSegredo && !temApiKey) return json({ erro: "nao autorizado" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(supabaseUrl, serviceKey);

  let body: { store_id?: string; so_existentes?: boolean } = {};
  try { body = await req.json(); } catch { /* sem corpo */ }

  let q = service
    .from("store_vr_config")
    .select("store_id, api_url, api_key, sistema, codigo_loja, modo_sync, enabled")
    .eq("modo_sync", "diario_d1");
  if (body.store_id) q = q.eq("store_id", body.store_id);
  const { data: configs, error } = await q;
  if (error) return json({ erro: error.message }, 500);

  const ontem = ontemBrasilia();
  const limiteRenovar = addDias(ontem, -8);
  const resumo: Record<string, unknown>[] = [];

  for (const cfg of (configs ?? []) as (ConfigLojaCache & { store_id: string; enabled?: boolean })[]) {
    if (cfg.enabled === false) continue;
    const storeId = cfg.store_id;
    const alvos = new Map<string, { relatorio: string; params: Record<string, unknown> }>();
    const add = (relatorio: string, params: Record<string, unknown>) =>
      alvos.set(`${relatorio}|${JSON.stringify(params)}`, { relatorio, params });

    // 1+2. o que ja esta no cache (rolando a janela para terminar em ontem)
    const { data: existentes } = await service
      .from("relatorio_cache")
      .select("relatorio, params, fim")
      .eq("store_id", storeId);
    for (const e of existentes ?? []) {
      const p = { ...(e.params as Record<string, unknown>) };
      const fim = e.fim as string | null;
      if (!fim) { add(e.relatorio as string, p); continue; }           // snapshot
      if (fim < limiteRenovar) continue;                               // periodo antigo, fica como esta
      if (p.data !== undefined) { p.data = ontem; }
      else if (p.fim !== undefined) {
        const dias = Math.round((Date.parse(fim) - Date.parse(String(p.inicio ?? fim))) / 86400000);
        const eraInicioMes = String(p.inicio ?? "").endsWith("-01");
        p.fim = ontem;
        // janela relativa (7/30 dias) rola inteira; janela "desde o dia 1" so estica o fim
        if (!eraInicioMes && dias >= 0) p.inicio = addDias(ontem, -dias);
      }
      add(e.relatorio as string, p);
    }

    // 3. pre-aquecimento padrao
    if (!body.so_existentes) {
      for (const r of PERIODICOS) for (const j of janelasPadrao(ontem)) add(r, j);
      for (const r of SNAPSHOT) add(r, {});
      for (const r of MESES_HISTORICO) add(r, { inicio: `${ontem.slice(0, 4)}-01-01`, fim: ontem });
    }

    const inicioMs = Date.now();
    let ok = 0, falhas = 0, semRelatorio = 0;
    await comLimite([...alvos.values()], 2, async (a) => {
      const r = await consultarComCache({
        supabaseUrl, serviceKey, storeId, relatorio: a.relatorio, params: a.params,
        cfg, forcar: true, origem: "job", timeoutMs: 180000,
      });
      if (r.ok) ok++;
      else if (/nao encontrado|nao existe|404/i.test(r.erro ?? "")) semRelatorio++;
      else { falhas++; console.error("sync-diario-d1", storeId, a.relatorio, r.erro); }
    });

    // 4. limpeza de cache velho
    await service.from("relatorio_cache").delete()
      .eq("store_id", storeId)
      .lt("atualizado_em", new Date(Date.now() - 60 * 86400000).toISOString());

    resumo.push({ store_id: storeId, consultas: alvos.size, ok, falhas, sem_relatorio: semRelatorio,
      segundos: Math.round((Date.now() - inicioMs) / 1000) });
  }

  return json({ ok: true, d1: ontem, lojas: resumo });
});
