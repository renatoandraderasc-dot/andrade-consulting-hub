import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// Hierarquia mercadologica de vendas AO VIVO (nada e gravado).
// Retorna sempre linhas planas: nivel1 / nivel2 / nivel3 / produto.
//
//  - WebSac: relatorio vendas_hierarquia_periodo (SQL com depto,
//    grupo, subgrupo e produto).
//  - VR: nao existe relatorio hierarquico no servidor da loja, entao
//    combinamos ranking_produtos (venda por produto) com o cadastro
//    produtos (secao / grupo / subgrupo) e montamos a arvore no front.
//
// Cache leve de 60s por (loja + periodo).
// ============================================================

export interface LinhaHierarquia {
  n1: string;
  n2: string;
  n3: string;
  produto: string;
  codigo: string;
  vendas: number;
  lucro: number;
  volume: number;
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; promise: Promise<LinhaHierarquia[]> }>();

const num = (v: unknown) => parseFloat(String(v ?? "").replace(",", ".")) || 0;
const txt = (v: unknown, fallback: string) => {
  const s = String(v ?? "").trim();
  return s || fallback;
};

async function chamar(storeId: string, relatorio: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("vr-proxy", {
    body: { store_id: storeId, relatorio, params },
  });
  if (error) {
    let corpo: any = null;
    try {
      corpo = await (error as any)?.context?.json?.();
    } catch {
      corpo = null;
    }
    throw new Error(String(corpo?.erro ?? error.message));
  }
  if ((data as any)?.erro) throw new Error(String((data as any).erro));
  const dados = (data as any)?.dados;
  return Array.isArray(dados) ? (dados as any[]) : [];
}

async function carregar(storeId: string, inicio: string, fim: string): Promise<LinhaHierarquia[]> {
  const { data: cfg } = await supabase
    .from("store_vr_config")
    .select("sistema")
    .eq("store_id", storeId)
    .maybeSingle();

  const sistema = String((cfg as any)?.sistema ?? "VR").toUpperCase();

  if (sistema === "WEBSAC") {
    const dados = await chamar(storeId, "vendas_hierarquia_periodo", { inicio, fim });
    return dados.map((l) => ({
      n1: txt(l.nivel1, "SEM DEPARTAMENTO").toUpperCase(),
      n2: txt(l.nivel2, "SEM GRUPO").toUpperCase(),
      n3: txt(l.nivel3, "SEM SUBGRUPO").toUpperCase(),
      produto: txt(l.produto, "SEM DESCRIÇÃO").toUpperCase(),
      codigo: String(l.codigo ?? ""),
      vendas: num(l.total_vendido),
      lucro: num(l.lucro),
      volume: num(l.volume),
    }));
  }

  // ---------- VR ----------
  const [ranking, catalogo] = await Promise.all([
    chamar(storeId, "ranking_produtos", { inicio, fim, limite: 200000 }),
    chamar(storeId, "produtos", {}).catch(() => [] as any[]),
  ]);

  const cat = new Map<string, { n1: string; n2: string; n3: string; descricao: string }>();
  for (const p of catalogo) {
    cat.set(String(p.codigo ?? ""), {
      n1: txt(p.secao, "SEM DEPARTAMENTO").toUpperCase(),
      n2: txt(p.grupo, "SEM GRUPO").toUpperCase(),
      n3: txt(p.subgrupo, "SEM SUBGRUPO").toUpperCase(),
      descricao: txt(p.descricao, "SEM DESCRIÇÃO").toUpperCase(),
    });
  }

  return ranking.map((l) => {
    const codigo = String(l.codigo ?? "");
    const c = cat.get(codigo);
    const vendas = num(l.total_vendido);
    return {
      n1: c?.n1 ?? txt(l.secao, "SEM DEPARTAMENTO").toUpperCase(),
      n2: c?.n2 ?? "SEM GRUPO",
      n3: c?.n3 ?? "SEM SUBGRUPO",
      produto: c?.descricao ?? txt(l.produto, "SEM DESCRIÇÃO").toUpperCase(),
      codigo,
      vendas,
      lucro: (vendas * num(l.margem_pct)) / 100,
      volume: num(l.quantidade),
    };
  });
}

export function useHierarquiaVendas(storeId: string, inicio: string, fim: string) {
  const [linhas, setLinhas] = useState<LinhaHierarquia[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const reqRef = useRef(0);

  const run = useCallback(
    async (force: boolean) => {
      if (!storeId || !inicio || !fim) return;
      const key = `${storeId}|${inicio}|${fim}`;
      const cached = cache.get(key);
      const fresh = cached && Date.now() - cached.at < TTL_MS && !force;
      const entry = fresh ? cached! : { at: Date.now(), promise: carregar(storeId, inicio, fim) };
      cache.set(key, entry);

      const id = ++reqRef.current;
      setLoading(true);
      try {
        const result = await entry.promise;
        if (id !== reqRef.current) return;
        setLinhas(result);
        setErrorMsg(null);
        setUpdatedAt(new Date(entry.at));
      } catch (e) {
        cache.delete(key);
        if (id !== reqRef.current) return;
        setLinhas(null);
        setErrorMsg(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    },
    [storeId, inicio, fim],
  );

  useEffect(() => {
    run(false);
  }, [run]);

  const refresh = useCallback(() => run(true), [run]);

  const total = useMemo(
    () => (linhas ?? []).reduce((s, l) => s + l.vendas, 0),
    [linhas],
  );

  return { linhas, total, loading, errorMsg, updatedAt, refresh };
}
