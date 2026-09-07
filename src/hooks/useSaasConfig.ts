import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, number>();

/**
 * Lê um parâmetro numérico de saas_config (Parametrizações Gerais).
 * Retorna o padrão enquanto carrega ou se o parâmetro não existir.
 */
export function useSaasNumber(chave: string, padrao: number) {
  const [valor, setValor] = useState<number>(cache.get(chave) ?? padrao);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data } = await supabase
        .from("saas_config")
        .select("valor")
        .eq("chave", chave)
        .maybeSingle();
      const n = Number(data?.valor);
      if (!ativo || !Number.isFinite(n)) return;
      cache.set(chave, n);
      setValor(n);
    })();
    return () => {
      ativo = false;
    };
  }, [chave]);

  return valor;
}
