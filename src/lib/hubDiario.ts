import { supabase } from "@/integrations/supabase/client";
import { RELATORIOS_DIARIOS, diasEntre, juntarDias, chaveDia, type LinhaHub } from "../../supabase/functions/_shared/hubDados";
export { RELATORIOS_DIARIOS, diasEntre, agregarDias } from "../../supabase/functions/_shared/hubDados";

// ============================================================
// Hub diario: relatorios pesados guardados DIA A DIA no banco
// (o sync-diario-d1 grava o dia de ontem toda manha). Um periodo
// passado com todos os dias guardados e montado aqui, sem consultar
// a maquina do cliente.
// ============================================================

export function ontemIso() {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

type LeituraHub = { dados: LinhaHub[]; atualizadoEm: string | null };
type RegistroHub = { params: unknown; dados: unknown; atualizado_em: string };

function linhasHub(dados: unknown): LinhaHub[] | null {
  if (!Array.isArray(dados)) return null;
  return dados.filter((v): v is LinhaHub => v !== null && typeof v === "object" && !Array.isArray(v));
}

/** Uma leitura anterior ao fechamento não certifica o período completo. */
export function leituraCompleta(params: Record<string, unknown>, atualizadoEm: string): boolean {
  const fim = String(params.fim ?? params.data ?? "");
  if (!fim) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fim) || !Number.isFinite(Date.parse(atualizadoEm))) return false;
  const gravado = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(atualizadoEm));
  return fim < gravado && fim <= ontemIso();
}

/** Limite de linhas não é um filtro; leituras truncadas nunca servem como total. */
export function selecionarLeituraHub(registros: RegistroHub[], params: Record<string, unknown>): LeituraHub | null {
  const normalizar = (p: Record<string, unknown>) => chaveDia(Object.fromEntries(Object.entries(p).filter(([k]) => k !== "limite")));
  const chave = normalizar(params);
  const candidatos = registros.filter(r => {
    if (!r.params || typeof r.params !== "object" || Array.isArray(r.params)) return false;
    const p = r.params as Record<string, unknown>;
    const dados = linhasHub(r.dados);
    const limite = Number(p.limite) || 0;
    return dados !== null && (!limite || dados.length < limite) && normalizar(p) === chave && leituraCompleta(p, r.atualizado_em);
  }).sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  const atual = candidatos[0];
  return atual ? { dados: linhasHub(atual.dados) ?? [], atualizadoEm: atual.atualizado_em } : null;
}

/** Última leitura exata do Hub, sem chamar nenhuma função ou sistema da loja. */
export async function lerRelatorioSalvo(storeId: string, relatorio: string, params: Record<string, unknown> = {}): Promise<LeituraHub | null> {
  if (!storeId) return null;
  let query = supabase.from("relatorio_cache").select("params, dados, atualizado_em").eq("store_id", storeId).eq("relatorio", relatorio);
  for (const [k, v] of Object.entries(params)) {
    if (k === "limite" || k === "chave" || v === undefined || v === null || v === "") continue;
    query = query.eq(`params->>${k}`, String(v));
  }
  const { data, error } = await query.order("atualizado_em", { ascending: false });
  if (error || !data) return null;
  return selecionarLeituraHub(data, params);
}

/** Monta o periodo a partir dos dias guardados; null se faltar algum dia. */
async function montarDiasDoHub(storeId: string, relatorio: string, params: Record<string, unknown>): Promise<LeituraHub | null> {
  if (!(RELATORIOS_DIARIOS as readonly string[]).includes(relatorio)) return null;
  const inicio = String(params.inicio ?? ""), fim = String(params.fim ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || fim > ontemIso()) return null;
  const extras = Object.keys(params).filter((k) => !["inicio", "fim", "limite"].includes(k));
  if (extras.length) return null;
  const dias = diasEntre(inicio, fim);
  if (dias.length < 2) return null;
  const chaves = dias.map((d) => chaveDia({ fim: d, inicio: d }));
  const { data, error } = await supabase.from("relatorio_cache")
    .select("params_chave, params, dados, atualizado_em")
    .eq("store_id", storeId).eq("relatorio", relatorio).in("params_chave", chaves);
  if (error || !data || data.length < dias.length || data.some(r => !leituraCompleta(r.params as Record<string, unknown>, r.atualizado_em) || linhasHub(r.dados) === null)) return null;
  const ordenados = [...data].sort((a, b) => a.params_chave.localeCompare(b.params_chave));
  const linhas: LinhaHub[][] = ordenados.map(r => Array.isArray(r.dados)
    ? r.dados.filter((v): v is Record<string, import("@/integrations/supabase/types").Json> => v !== null && typeof v === "object" && !Array.isArray(v))
    : []);
  const atualizadoEm = (data as any[]).map((r) => r.atualizado_em).sort().pop() ?? null;
  return { dados: juntarDias(relatorio, linhas), atualizadoEm };
}

/** Todas as telas usam a leitura completa mais recente, não uma variante antiga. */
export async function montarDoHub(storeId: string, relatorio: string, params: Record<string, unknown>): Promise<LeituraHub | null> {
  const periodo = await lerRelatorioSalvo(storeId, relatorio, params);
  const dias = await montarDiasDoHub(storeId, relatorio, params);
  if (dias && (!periodo || String(dias.atualizadoEm) > String(periodo.atualizadoEm))) return dias;
  return periodo ?? dias;
}
