// ============================================================
// sync-rede-mensal
// Consulta o relatorio `rede_mensal` de cada loja conectada e grava
// o resultado em rede_metricas_mensais (cache da Visao da Rede).
// Loja offline / sem relatorio NAO apaga o que ja esta gravado.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

type Linha = Record<string, unknown>;

function pick(l: Linha, nome: string): unknown {
  for (const k of Object.keys(l)) {
    if (k.toLowerCase().trim() === nome) return l[k];
  }
  return undefined;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).replace(/[^\d,.-]/g, "");
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  return num(v);
}

function mesNormalizado(v: unknown, ano: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${String(Number(m[1])).padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})$/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 12) return `${ano}-${String(n).padStart(2, "0")}`;
  }
  return null;
}

async function comLimite<T, R>(itens: T[], limite: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (idx < itens.length) {
      const i = idx++;
      out[i] = await fn(itens[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const segredo = Deno.env.get("SYNC_VR_SECRET");
  const temSegredo = segredo && req.headers.get("x-sync-secret") === segredo;
  const temApiKey = !!(req.headers.get("apikey") || req.headers.get("authorization"));
  if (!temSegredo && !temApiKey) {
    return new Response(JSON.stringify({ erro: "nao autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(supabaseUrl, serviceKey);

  let body: { ano?: number; store_id?: string } = {};
  try {
    body = await req.json();
  } catch { /* sem corpo */ }

  const ano = Number(body.ano) || new Date().getFullYear();
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-31`;

  let q = service
    .from("store_vr_config")
    .select("store_id, api_url, api_key, sistema, codigo_loja, enabled")
    .eq("enabled", true);
  if (body.store_id) q = q.eq("store_id", body.store_id);
  const { data: configs, error } = await q;

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: lojas } = await service.from("stores").select("id, name");
  const nomePorId = new Map((lojas || []).map((l) => [l.id as string, l.name as string]));

  const resumo = await comLimite(configs || [], 4, async (cfg) => {
    const loja = nomePorId.get(cfg.store_id as string) || (cfg.store_id as string);
    try {
      const r = await consultarRelatorioLoja({
        supabaseUrl,
        serviceKey,
        storeId: cfg.store_id as string,
        relatorio: "rede_mensal",
        params: { inicio, fim },
        cfg: cfg as never,
        timeoutMs: 120000,
      });

      if (!r.ok) {
        const status = r.semConexao || r.semConfig
          ? "offline"
          : /nao encontrado|nao existe|404|nao cadastrado/i.test(r.erro || "")
          ? "sem_relatorio"
          : "erro";
        return { loja, status, meses_gravados: 0, erro: r.erro };
      }

      const linhas = (r.dados || []) as Linha[];
      const registros = linhas
        .map((l) => {
          const mes = mesNormalizado(pick(l, "mes"), ano);
          if (!mes) return null;
          return {
            store_id: cfg.store_id,
            mes,
            faturamento: num(pick(l, "faturamento")),
            cmv: num(pick(l, "cmv")),
            arrecadacao: num(pick(l, "arrecadacao")),
            margem_pct: numOrNull(pick(l, "margem_pct")),
            volume: num(pick(l, "volume")),
            cupons: Math.round(num(pick(l, "cupons"))),
            ticket_medio: numOrNull(pick(l, "ticket_medio")),
            compras: num(pick(l, "compras")),
            pct_compras_vendas: numOrNull(pick(l, "pct_compras_vendas")),
            atualizado_em: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      if (registros.length === 0) {
        return { loja, status: "sem_relatorio", meses_gravados: 0, erro: "relatorio vazio" };
      }

      const { error: upErr } = await service
        .from("rede_metricas_mensais")
        .upsert(registros as never[], { onConflict: "store_id,mes" });
      if (upErr) return { loja, status: "erro", meses_gravados: 0, erro: upErr.message };

      return { loja, status: "ok", meses_gravados: registros.length };
    } catch (e) {
      return {
        loja,
        status: "erro",
        meses_gravados: 0,
        erro: e instanceof Error ? e.message : String(e),
      };
    }
  });

  return new Response(JSON.stringify({ ano, resultados: resumo }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
