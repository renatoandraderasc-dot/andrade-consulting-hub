// ============================================================
// consultaLoja — roteamento por sistema (VR x WEBSAC x ORACLE)
//
// Dado um store_id, um nome de relatorio e os parametros:
//  - le `sistema` em store_vr_config
//  - sistema = 'WEBSAC' -> invoca a edge function websac-proxy
//    com { store_id, relatorio, params }
//  - sistema = 'VR' | 'ORACLE' (ou nulo) -> monta
//    {api_url}/relatorios/{relatorio} com os parametros + chave
//    (GET) e o header ngrok-skip-browser-warning. O JSON de retorno
//    do ORACLE e identico ao do VR, entao nada mais muda.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ConfigLoja {
  api_url: string;
  api_key: string;
  sistema?: string | null;
}

export interface ResultadoConsulta {
  ok: boolean;
  dados: Record<string, unknown>[];
  erro?: string;
  /** true quando o tunel/servidor da loja esta fora do ar (HTML/ngrok) */
  semConexao?: boolean;
  /** true quando a loja nao possui conexao cadastrada */
  semConfig?: boolean;
}

export async function carregarConfigLoja(
  supabaseUrl: string,
  serviceKey: string,
  storeId: string,
): Promise<ConfigLoja | null> {
  const service = createClient(supabaseUrl, serviceKey);
  const { data } = await service
    .from("store_vr_config")
    .select("api_url, api_key, sistema")
    .eq("store_id", storeId)
    .single();
  return (data as ConfigLoja) ?? null;
}

export async function consultarRelatorioLoja(opts: {
  supabaseUrl: string;
  serviceKey: string;
  storeId: string;
  relatorio: string;
  params?: Record<string, unknown>;
  /** evita reler store_vr_config quando o chamador ja tem a config */
  cfg?: ConfigLoja | null;
  timeoutMs?: number;
}): Promise<ResultadoConsulta> {
  const { supabaseUrl, serviceKey, storeId, relatorio, params, timeoutMs = 120000 } = opts;

  const cfg = opts.cfg !== undefined
    ? opts.cfg
    : await carregarConfigLoja(supabaseUrl, serviceKey, storeId);

  if (!cfg) {
    return { ok: false, dados: [], semConfig: true, erro: "loja sem conexao cadastrada" };
  }

  // ---------- WebSac ----------
  if ((cfg.sistema ?? "VR").toUpperCase() === "WEBSAC") {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/websac-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({ store_id: storeId, relatorio, params: params ?? {} }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await resp.json().catch(() => null) as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null;
      const erro = !Array.isArray(body) ? (body?.erro as string | undefined) : undefined;
      if (!resp.ok || erro) {
        return { ok: false, dados: [], erro: `WebSac: ${erro ?? resp.status}` };
      }
      const dados = Array.isArray(body)
        ? body
        : ((body?.dados as Record<string, unknown>[]) ?? []);
      return { ok: true, dados };
    } catch (e) {
      return { ok: false, dados: [], erro: e instanceof Error ? e.message : String(e) };
    }
  }

  // ---------- VR (comportamento original) ----------
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  qs.set("chave", cfg.api_key);
  const url = `${cfg.api_url.replace(/\/+$/, "")}/relatorios/${relatorio}?${qs.toString()}`;

  try {
    const resp = await fetch(url, {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const texto = await resp.text();
    const pareceHtml = /^\s*<(!doctype|html)/i.test(texto) || /ngrok/i.test(texto.slice(0, 500));
    if (!resp.ok) {
      if (pareceHtml) {
        return {
          ok: false, dados: [], semConexao: true,
          erro: `sem conexao VR (servidor respondeu ${resp.status})`,
        };
      }
      return { ok: false, dados: [], erro: `API VR ${resp.status}: ${texto.slice(0, 300)}` };
    }
    try {
      const dados = JSON.parse(texto);
      return { ok: true, dados: Array.isArray(dados) ? dados : (dados?.dados ?? []) };
    } catch {
      if (pareceHtml) {
        return { ok: false, dados: [], semConexao: true, erro: "sem conexao VR (resposta invalida do tunel)" };
      }
      return { ok: false, dados: [], erro: "resposta VR nao e JSON" };
    }
  } catch (e) {
    return { ok: false, dados: [], erro: e instanceof Error ? e.message : String(e) };
  }
}
