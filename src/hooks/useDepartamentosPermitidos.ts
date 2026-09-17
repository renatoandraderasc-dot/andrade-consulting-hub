import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canonDept } from "@/hooks/useVrRealizado";

/**
 * Restricao de departamentos por usuario.
 * - Admin global: sempre ve tudo (retorna null).
 * - Usuario sem nenhuma linha em user_department_access: ve tudo (null).
 * - Usuario com linhas: ve somente esses departamentos (chaves canonicas).
 */
export function useDepartamentosPermitidos() {
  const { user, isGlobalAdmin, loading: authLoading } = useAuth();
  const [permitidos, setPermitidos] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (authLoading) return;
      if (!user || isGlobalAdmin) {
        if (vivo) { setPermitidos(null); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("user_department_access")
        .select("department")
        .eq("user_id", user.id);
      if (!vivo) return;
      const lista = (data || []).map((d) => canonDept(String(d.department)));
      setPermitidos(lista.length ? lista : null);
      setLoading(false);
    })();
    return () => { vivo = false; };
  }, [user?.id, isGlobalAdmin, authLoading]);

  const permiteDept = (dep: string | null | undefined) => {
    if (!permitidos) return true;
    const k = canonDept(String(dep ?? ""));
    if (!k) return false;
    // metas de subgrupo "DEPTO / GRUPO" seguem o departamento pai
    const pai = k.includes("/") ? canonDept(k.split("/")[0]) : k;
    return permitidos.includes(k) || permitidos.includes(pai);
  };

  /** Quando restrito, "LOJA"/total geral nao pode ser exibido */
  const podeVerLoja = !permitidos;

  const filtrarDepts = (lista: string[]) => lista.filter(permiteDept);

  return { permitidos, loading, permiteDept, podeVerLoja, filtrarDepts };
}
