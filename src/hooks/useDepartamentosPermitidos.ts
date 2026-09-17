import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  carregarDepartamentosPermitidos,
  permiteDept as permite,
  chaveDept,
} from "@/lib/departamentosPermitidos";

/**
 * Departamentos que o usuario logado pode ver.
 * permitidos === null => sem restricao.
 */
export function useDepartamentosPermitidos() {
  const { user, isGlobalAdmin, loading: authLoading } = useAuth();
  const [permitidos, setPermitidos] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    if (authLoading) return;
    carregarDepartamentosPermitidos(user?.id, isGlobalAdmin).then((lista) => {
      if (!vivo) return;
      setPermitidos(lista);
      setLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, [user?.id, isGlobalAdmin, authLoading]);

  return useMemo(
    () => ({
      permitidos,
      restrito: !!permitidos,
      loading,
      permiteDept: (d: string | null | undefined) => permite(permitidos, d),
      filtrarDepts: (lista: string[]) => (permitidos ? lista.filter((d) => permite(permitidos, d)) : lista),
      chaveDept,
    }),
    [permitidos, loading],
  );
}
