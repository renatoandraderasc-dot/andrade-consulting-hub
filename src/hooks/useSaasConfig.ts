import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, number>();

/**
 * Lê um parâmetro numérico de saas_config (Parametrizações Gerais).
 * Retorna o padrão enquanto carrega ou se o parâmetro não existir.
 * Reage em tempo real quando o valor é alterado na tela de parametrizações.
 */
export function useSaasNumber(chave: string, padrao: number) {
  const [valor, setValor] = useState<number>(cache.get(chave) ?? padrao);

  useEffect(() => {
    let ativo = true;
    const aplicar = (bruto: unknown) => {
      const n = Number(bruto);
      if (!ativo || !Number.isFinite(n)) return;
      cache.set(chave, n);
      setValor(n);
    };

    (async () => {
      const { data } = await supabase
        .from("saas_config")
        .select("valor")
        .eq("chave", chave)
        .maybeSingle();
      aplicar(data?.valor);
    })();

    const channel = supabase
      .channel(`saas_config_${chave}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "saas_config", filter: `chave=eq.${chave}` },
        (payload: any) => aplicar(payload.new?.valor),
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(channel);
    };
  }, [chave]);

  return valor;
}

/**
 * Atualização automática parametrizável.
 * O intervalo (em segundos) vem de saas_config; 0 ou vazio desliga a atualização.
 * Retorna o intervalo em uso, para exibir na tela quando necessário.
 */
export function useAutoRefresh(chave: string, callback: () => void, padrao = 0) {
  const segundos = useSaasNumber(chave, padrao);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!segundos || segundos <= 0) return;
    const id = setInterval(() => cbRef.current(), segundos * 1000);
    return () => clearInterval(id);
  }, [segundos]);

  return segundos;
}
