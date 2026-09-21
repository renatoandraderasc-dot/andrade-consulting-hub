import { supabase } from "@/integrations/supabase/client";

// ============================================================
// Cache de relatorios por periodo.
// Periodos ja encerrados (que terminam antes do mes corrente)
// nunca mudam — por isso ficam gravados e nao sao consultados
// de novo no sistema da loja.
// ============================================================

/** Primeiro dia do mes corrente (America/Sao_Paulo) em ISO. */
function inicioMesCorrente(): string {
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-01`;
}

/** true quando o periodo ja terminou antes do mes corrente. */
export function periodoFechado(ate: string): boolean {
  return !!ate && ate < inicioMesCorrente();
}

/** Le um periodo gravado. Devolve null quando nao ha nada guardado. */
export async function lerPeriodoCache(
  storeId: string,
  relatorio: string,
  departamento: string,
  de: string,
  ate: string,
): Promise<any[] | null> {
  if (!storeId || !periodoFechado(ate)) return null;
  const { data } = await supabase
    .from("painel_periodo_cache")
    .select("dados")
    .eq("store_id", storeId)
    .eq("relatorio", relatorio)
    .eq("departamento", departamento || "")
    .eq("de", de)
    .eq("ate", ate)
    .maybeSingle();
  const dados = (data as any)?.dados;
  return Array.isArray(dados) ? dados : null;
}

/** Grava um periodo encerrado. Periodo em andamento nao e gravado. */
export async function gravarPeriodoCache(
  storeId: string,
  relatorio: string,
  departamento: string,
  de: string,
  ate: string,
  dados: any[],
): Promise<void> {
  if (!storeId || !periodoFechado(ate) || !Array.isArray(dados) || !dados.length) return;
  await supabase.from("painel_periodo_cache").upsert(
    {
      store_id: storeId,
      relatorio,
      departamento: departamento || "",
      de,
      ate,
      dados: dados as any,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "store_id,relatorio,departamento,de,ate" },
  );
}

/** Apaga o que estiver guardado de um relatorio/periodo (usado no "refazer consulta"). */
export async function limparPeriodoCache(
  storeId: string,
  relatorio: string,
  departamento: string,
  de: string,
  ate: string,
): Promise<void> {
  if (!storeId) return;
  await supabase
    .from("painel_periodo_cache")
    .delete()
    .eq("store_id", storeId)
    .eq("relatorio", relatorio)
    .eq("departamento", departamento || "")
    .eq("de", de)
    .eq("ate", ate);
}
