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
  isGlobalAdmin: boolean,
): Promise<LojaSimples[]> {
  if (isGlobalAdmin) {
    const { data } = await supabase.from("stores").select("id, name").order("name");
    return (data as LojaSimples[]) || [];
  }
  if (!userId) return [];
  const { data: access } = await supabase
    .from("user_store_access")
    .select("store_id")
    .eq("user_id", userId)
    .eq("approved", true);
  const ids = (access || []).map((a) => a.store_id);
  if (!ids.length) return [];
  const { data } = await supabase
    .from("stores")
    .select("id, name")
    .in("id", ids)
    .order("name");
  return (data as LojaSimples[]) || [];
}
