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
  if (await usaCustoReposicao(storeId)) {
    for (const l of dados) if (l && typeof l === "object") (l as any).__custoReposicao = true;
  }
  return { dados, indisponivel: false, offline: false, erro: null };
}

// ============================================================
// Lojas que calculam a margem pelo CUSTO DE REPOSICAO.
// (Sm Maninho pediu esse criterio; as demais seguem custo com imposto.)
// ============================================================

const LOJAS_CUSTO_REPOSICAO = /maninho/i;
const prefCusto = new Map<string, Promise<boolean>>();

export async function usaCustoReposicao(storeId: string): Promise<boolean> {
  if (!storeId) return false;
  let p = prefCusto.get(storeId);
  if (!p) {
    p = supabase
      .from("stores")
      .select("name")
      .eq("id", storeId)
      .maybeSingle()
      .then(({ data }) => LOJAS_CUSTO_REPOSICAO.test(String((data as any)?.name ?? "")));
    prefCusto.set(storeId, p);
  }
  return p;
}


/** Texto padrao de aviso para a UI. */
export function avisoRelatorio(r: { indisponivel: boolean; offline: boolean; erro: string | null }): string | null {
  if (r.indisponivel) return "Este relatório ainda não está disponível no sistema desta loja.";
  if (r.offline) return "Sem conexão com o sistema da loja.";
  return r.erro;
}

// ============================================================
// Custo com imposto.
// A margem e sempre (Venda - Custo com imposto) / Venda, usando o
// custo com imposto que o proprio sistema da loja devolve.
// ============================================================

const CHAVES_CUSTO = [
  "custo_com_imposto",
  "custo_c_imposto",
  "custo_com_impostos",
  "custo_imposto",
  "cmv_com_imposto",
  "custo_liquido",
  "custo_total",
  "custo_medio",
  "custo",
  "cmv",
];

/** Custo com imposto da linha do relatorio (null quando o conector nao devolve). */
export function custoComImposto(l: any): number | null {
  const v = pick(l, ...CHAVES_CUSTO);
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = num(v);
  return n > 0 ? n : null;
}

/** Lucro = Venda - Custo com imposto (usa o lucro do conector so quando nao ha custo). */
export function lucroDaLinha(l: any, vendas: number, lucroFallback?: number): number {
  const custo = custoComImposto(l);
  if (custo !== null) return vendas - custo;
  return lucroFallback ?? num(pick(l, "lucro"));
}

