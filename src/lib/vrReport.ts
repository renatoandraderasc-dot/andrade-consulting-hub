import { supabase } from "@/integrations/supabase/client";

// ============================================================
// Utilitario compartilhado para consultar relatorios ao vivo
// pela edge function vr-proxy (roteia VR / WEBSAC / ORACLE).
//
// Os conectores respondem colunas em caixa alta (ORACLE/VR) ou
// baixa (WebSac) e nem toda loja publica todos os relatorios.
// Aqui isso e tratado de forma uniforme: em vez de estourar erro
// na tela, devolvemos sinalizadores para a UI mostrar um aviso.
// ============================================================

export interface RelatorioResultado {
  dados: any[];
  /** relatorio nao existe/nao e suportado pelo conector da loja */
  indisponivel: boolean;
  /** loja sem conexao com o sistema (tunel fora do ar) */
  offline: boolean;
  /** falha real, para exibir ao usuario */
  erro: string | null;
}

const INDISPONIVEL = /relatorio nao encontrado|nao encontrado|nao existe|nao cadastrado|parametro ausente|parametros obrigatorios|404|ORA-\d+|illegal variable|invalid identifier|not supported/i;
const OFFLINE = /sem conexao|connection refused|failed to fetch|timeout|ngrok|tunnel|econnrefused/i;

/** Le uma coluna sem se importar com a caixa do nome. */
export function pick(o: any, ...keys: string[]): any {
  if (!o) return undefined;
  for (const k of keys) {
    for (const v of [k, k.toUpperCase(), k.toLowerCase()]) {
      if (o[v] !== undefined && o[v] !== null) return o[v];
    }
  }
  // ultima tentativa: comparacao normalizada das chaves do objeto
  const alvo = keys.map((k) => k.toLowerCase());
  for (const key of Object.keys(o)) {
    if (alvo.includes(key.toLowerCase()) && o[key] !== undefined && o[key] !== null) return o[key];
  }
  return undefined;
}

export const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/\s/g, ""));
  return isNaN(n) ? 0 : n;
};

export const txt = (v: unknown, fallback = "") => {
  const s = String(v ?? "").trim();
  return s || fallback;
};

/** Consulta um relatorio sem lancar excecao. */
export async function chamarRelatorio(
  storeId: string,
  relatorio: string,
  params: Record<string, unknown> = {},
): Promise<RelatorioResultado> {
  const vazio = { dados: [] as any[], indisponivel: false, offline: false, erro: null as string | null };
  if (!storeId) return vazio;

  const { data, error } = await supabase.functions.invoke("vr-proxy", {
    body: { store_id: storeId, relatorio, params },
  });

  let msg = "";
  if (error) {
    let corpo: any = null;
    try {
      corpo = await (error as any)?.context?.json?.();
    } catch {
      corpo = null;
    }
    msg = String(corpo?.erro ?? error.message ?? "");
  } else if ((data as any)?.erro) {
    msg = String((data as any).erro);
  }

  if (msg) {
    if (INDISPONIVEL.test(msg)) return { ...vazio, indisponivel: true };
    if (OFFLINE.test(msg)) return { ...vazio, offline: true };
    return { ...vazio, erro: msg };
  }

  const d = (data as any)?.dados ?? data;
  const dados = Array.isArray(d) ? d : Array.isArray(d?.dados) ? d.dados : [];
  return { dados, indisponivel: false, offline: false, erro: null };
}

/** Texto padrao de aviso para a UI. */
export function avisoRelatorio(r: { indisponivel: boolean; offline: boolean; erro: string | null }): string | null {
  if (r.indisponivel) return "Este relatório ainda não está disponível no sistema desta loja.";
  if (r.offline) return "Sem conexão com o sistema da loja.";
  return r.erro;
}

// ============================================================
// Carga tributaria sobre o custo (CMV).
// Os conectores devolvem o CMV SEM imposto; a margem correta e
// (Faturamento - CMV com imposto) / Faturamento. O percentual e
// configurado por loja em store_margem_config (admin) e usado em
// todas as telas que calculam margem ao vivo.
// ============================================================

const cargaCache = new Map<string, Promise<number>>();

export function carregarCargaCmv(storeId: string): Promise<number> {
  if (!storeId) return Promise.resolve(0);
  const cached = cargaCache.get(storeId);
  if (cached) return cached;
  const p = (supabase as any)
    .from("store_margem_config")
    .select("carga_tributaria_cmv_pct")
    .eq("store_id", storeId)
    .maybeSingle()
    .then(({ data }: any) => Number(data?.carga_tributaria_cmv_pct) || 0)
    .catch(() => 0);
  cargaCache.set(storeId, p);
  return p;
}

export function limparCacheCargaCmv(storeId?: string) {
  if (storeId) cargaCache.delete(storeId);
  else cargaCache.clear();
}

/** Recalcula o lucro aplicando a carga tributaria sobre o custo. */
export function ajustarLucro(faturamento: number, lucro: number, cargaPct: number) {
  if (!cargaPct) return lucro;
  const cmv = faturamento - lucro;
  return faturamento - cmv * (1 + cargaPct / 100);
}

/** Aplica a carga tributaria sobre um CMV vindo do conector. */
export function ajustarCmv(cmv: number, cargaPct: number) {
  return cargaPct ? cmv * (1 + cargaPct / 100) : cmv;
}
