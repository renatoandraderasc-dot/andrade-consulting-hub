import { supabase } from "@/integrations/supabase/client";

export interface LojaSimples {
  id: string;
  name: string;
}

/**
 * Lista as lojas que o usuario pode gerenciar.
 * Admin global ve a rede inteira; supervisor/usuario comum ve apenas as lojas
 * liberadas em user_store_access (approved = true) - mesmo criterio do
 * StoreSwitcher, para nao oferecer loja que o RLS bloqueia depois.
 */
export async function carregarLojasPermitidas(
  userId: string | null | undefined,
  _isGlobalAdmin: boolean,
): Promise<LojaSimples[]> {
  if (!userId) return [];
  // O banco já aplica a regra correta por usuário: administrador recebe a
  // rede inteira; os demais recebem apenas as lojas aprovadas.
  const { data } = await supabase
    .from("stores")
    .select("id, name")
    .order("name");
  return (data as LojaSimples[]) || [];
}

/**
 * Loja escolhida no login (sessionStorage). Telas de Metas usam só ela,
 * sem seletor de loja. Cai na primeira permitida se não houver loja salva.
 */
export async function carregarLojaLogin(
  userId: string | null | undefined,
  isGlobalAdmin = false,
): Promise<LojaSimples[]> {
  if (!userId) return [];
  const sid = sessionStorage.getItem("selectedStoreId");
  if (sid) {
    const { data } = await supabase.from("stores").select("id, name").eq("id", sid).maybeSingle();
    if (data) return [data as LojaSimples];
  }
  const todas = await carregarLojasPermitidas(userId, isGlobalAdmin);
  return todas.slice(0, 1);
}
