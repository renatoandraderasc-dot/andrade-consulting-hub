import { supabase } from "@/integrations/supabase/client";

// ============================================================
// Regras de margem padrao da loja (produto > fornecedor > departamento).
// Leitura/escrita direto no banco — nao passa pela ponte.
// ============================================================

export type TipoMargem = "produto" | "fornecedor" | "departamento";

export interface MargemPadrao {
  id: string;
  store_id: string;
  tipo: TipoMargem;
  referencia_id: number;
  referencia_nome: string | null;
  margem_pct: number;
  margem_min: number | null;
  margem_max: number | null;
  observacao: string | null;
  updated_at: string;
}

export async function carregarMargens(storeId: string): Promise<MargemPadrao[]> {
  if (!storeId) return [];
  const { data } = await supabase
    .from("margens_padrao")
    .select("*")
    .eq("store_id", storeId)
    .order("updated_at", { ascending: false });
  return (data || []) as MargemPadrao[];
}

const chave = (tipo: TipoMargem, ref: unknown) => {
  const n = parseInt(String(ref ?? "").replace(/\D/g, ""), 10);
  return isNaN(n) ? null : `${tipo}:${n}`;
};

/** Indexa as regras para consulta rapida por tipo + referencia. */
export function indexarMargens(margens: MargemPadrao[]) {
  const mapa = new Map<string, MargemPadrao>();
  for (const m of margens) mapa.set(`${m.tipo}:${m.referencia_id}`, m);
  return mapa;
}

/** Precedencia: produto -> fornecedor -> departamento. Primeira que casar ganha. */
export function resolverMargem(
  mapa: Map<string, MargemPadrao>,
  alvo: { produto?: unknown; fornecedor?: unknown; departamento?: unknown },
): MargemPadrao | null {
  const ordem: [TipoMargem, unknown][] = [
    ["produto", alvo.produto],
    ["fornecedor", alvo.fornecedor],
    ["departamento", alvo.departamento],
  ];
  for (const [tipo, ref] of ordem) {
    const k = chave(tipo, ref);
    if (k && mapa.has(k)) return mapa.get(k)!;
  }
  return null;
}

/** Preco que entrega a margem meta (markdown sobre o preco final). */
export function precoMeta(custo: number, margemPct: number | null | undefined): number | null {
  if (!custo || custo <= 0 || margemPct == null) return null;
  const d = 1 - margemPct / 100;
  if (d <= 0) return null;
  return Math.round((custo / d) * 100) / 100;
}
