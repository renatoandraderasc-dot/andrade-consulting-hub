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
  codigo_loja?: number | null;
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
    .select("api_url, api_key, sistema, codigo_loja")
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
  const sistema = (cfg.sistema ?? "VR").toUpperCase();

  // ---------- WebSac ----------
  if (sistema === "WEBSAC") {
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

  // ---------- VR / ORACLE (mesmo contrato HTTP) ----------
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  // ORACLE exige o codigo da loja em todos os relatorios (bind :loja).
  // Nos demais conectores (VR) o parametro e enviado quando a loja tem codigo
  // cadastrado — conectores que nao filtram por loja simplesmente o ignoram.
  if (!qs.has("loja") && cfg.codigo_loja != null) {
    qs.set("loja", String(cfg.codigo_loja));
  }

  qs.set("chave", cfg.api_key);

  const base = (n: string) => n.toLowerCase().replace(/^[\s\d]*[-_.]?\s*/, "").trim();

  // Sinonimos conhecidos por relatorio (nomes usados por pontes diferentes).
  const SINONIMOS: Record<string, string[]> = {
    compras_vendas_periodo: ["compras_x_vendas", "compras_vendas", "compras_periodo", "compras_por_secao"],
    compras_por_fornecedor: ["compras_fornecedor", "fornecedores_compras"],
  };

  async function chamar(nome: string): Promise<ResultadoConsulta> {
    const url = `${cfg!.api_url.replace(/\/+$/, "")}/relatorios/${nome}?${qs.toString()}`;
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
        if (dados && !Array.isArray(dados) && dados.erro) {
          return { ok: false, dados: [], erro: String(dados.erro) };
        }
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

  // 1a tentativa: nome pedido
  const primeira = await chamar(relatorio);
  const faltando = (msg?: string) =>
    !!msg && /404|relatorio nao encontrado|nao encontrado|nao existe|nao cadastrado/i.test(msg);
  if (primeira.ok || primeira.semConexao || !faltando(primeira.erro)) return primeira;

  // 2a: nomes com prefixo numerico e sinonimos conhecidos
  const alvo = base(relatorio);
  const tentativas = new Set<string>();
  for (const p of ["01", "02", "03", "04", "05"]) tentativas.add(`${p}-${alvo}`);
  for (const s of SINONIMOS[alvo] ?? []) {
    tentativas.add(s);
    for (const p of ["01", "02", "03", "04", "05"]) tentativas.add(`${p}-${s}`);
  }

  // Se a ponte listou os relatorios disponiveis no erro, usamos essa lista.
  const lista = primeira.erro?.match(/"disponiveis"\s*:\s*\[([^\]]*)/);
  if (lista) {
    const nomes = lista[1].split(",").map((s) => s.replace(/[\\"\s]/g, "")).filter(Boolean);
    const candidatos = nomes.filter((n) => base(n) === alvo || (SINONIMOS[alvo] ?? []).includes(base(n)));
    for (const n of candidatos) tentativas.add(n);
  }

  let ultimo = primeira;
  for (const nome of tentativas) {
    if (nome === relatorio) continue;
    const r = await chamar(nome);
    if (r.ok) return r;
    if (r.semConexao) return r;
    if (!faltando(r.erro)) ultimo = r;
  }
  return ultimo;
}

