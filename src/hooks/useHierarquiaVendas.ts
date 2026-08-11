import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, num, pick } from "@/lib/vrReport";

// ============================================================
// Hierarquia mercadologica de vendas AO VIVO (nada e gravado).
// Retorna sempre linhas planas: nivel1 / nivel2 / nivel3 / produto.
//
//  - WebSac: relatorio vendas_hierarquia_periodo (SQL com depto,
//    grupo, subgrupo e produto).
//  - VR / ORACLE: quando nao existe relatorio hierarquico, combinamos
//    ranking_produtos com o cadastro produtos; se o conector nao
//    publicar esses relatorios, caimos para secao/categoria.
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

const txt = (v: unknown, fallback: string) => {
  const s = String(v ?? "").trim();
  return s || fallback;
};

// Relatorio indisponivel no conector da loja nao e erro: devolve vazio
// e a UI cai para o nivel de abertura que a loja suporta.
async function chamar(storeId: string, relatorio: string, params: Record<string, unknown>) {
  const r = await chamarRelatorio(storeId, relatorio, params);
  if (r.erro) throw new Error(r.erro);
  return r.dados;
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

  // ---------- VR / ORACLE ----------
  // Cascata de relatorios ate achar um que abra em nivel produto.
  const CANDIDATOS: { nome: string; params: Record<string, unknown> }[] = [
    { nome: "ranking_produtos", params: { inicio, fim, limite: 200000 } },
    { nome: "catalogo_produtos_vendidos", params: { inicio, fim } },
    { nome: "vendas_produto_periodo", params: { inicio, fim } },
    { nome: "compras_vendas_periodo", params: { inicio, fim } },
    { nome: "mix_positivacao_periodo", params: { inicio, fim } },
  ];

  let ranking: any[] = [];
  for (const c of CANDIDATOS) {
    const r = await chamar(storeId, c.nome, c.params).catch(() => [] as any[]);
    // so aceita se realmente vier abertura por produto
    const temProduto = r.some(
      (l: any) => !!pick(l, "codigo", "codigo_produto", "cod_produto", "ean") ||
        !!pick(l, "produto", "descricao", "descricao_produto"),
    );
    if (r.length > 0 && temProduto) {
      ranking = r;
      break;
    }
  }

  const catalogo = ranking.length
    ? await chamar(storeId, "produtos", {}).catch(() => [] as any[])
    : ([] as any[]);

  // Nenhum relatorio de produto disponivel: cai para secao/categoria.
  if (ranking.length === 0) {
    const dados = await chamar(storeId, "vendas_secao_periodo", { inicio, fim });
    const acc = new Map<string, LinhaHierarquia>();
    for (const l of dados) {
      const n1 = txt(pick(l, "secao", "departamento"), "SEM DEPARTAMENTO").toUpperCase();
      const n2 = txt(pick(l, "categoria", "grupo"), "SEM GRUPO").toUpperCase();
      const k = `${n1}|${n2}`;
      const cur = acc.get(k) ?? { n1, n2, n3: "SEM SUBGRUPO", produto: n2, codigo: "", vendas: 0, lucro: 0, volume: 0 };
      cur.vendas += num(pick(l, "total_vendido", "venda", "vendas"));
      cur.lucro += num(pick(l, "lucro"));
      cur.volume += num(pick(l, "volume", "qtde", "quantidade"));
      acc.set(k, cur);
    }
    return [...acc.values()];
  }


  const cat = new Map<string, { n1: string; n2: string; n3: string; descricao: string }>();
  for (const p of catalogo) {
    cat.set(String(pick(p, "codigo") ?? ""), {
      n1: txt(pick(p, "secao"), "SEM DEPARTAMENTO").toUpperCase(),
      n2: txt(pick(p, "grupo"), "SEM GRUPO").toUpperCase(),
      n3: txt(pick(p, "subgrupo"), "SEM SUBGRUPO").toUpperCase(),
      descricao: txt(pick(p, "descricao"), "SEM DESCRIÇÃO").toUpperCase(),
    });
  }

  return ranking.map((l) => {
    const codigo = String(pick(l, "codigo") ?? "");
    const c = cat.get(codigo);
    const vendas = num(pick(l, "total_vendido", "venda", "vendas"));
    return {
      n1: c?.n1 ?? txt(pick(l, "secao"), "SEM DEPARTAMENTO").toUpperCase(),
      n2: c?.n2 ?? "SEM GRUPO",
      n3: c?.n3 ?? "SEM SUBGRUPO",
      produto: c?.descricao ?? txt(pick(l, "produto", "descricao"), "SEM DESCRIÇÃO").toUpperCase(),
      codigo,
      vendas,
      lucro: num(pick(l, "lucro")) || (vendas * num(pick(l, "margem_pct"))) / 100,
      volume: num(pick(l, "quantidade", "volume", "qtde")),
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

  // Falso quando o conector da loja nao publica relatorio de produto e
  // caimos para a abertura por secao/categoria.
  const nivelProduto = useMemo(
    () => (linhas ?? []).some((l) => !!l.codigo),
    [linhas],
  );

  return { linhas, total, loading, errorMsg, updatedAt, refresh, nivelProduto };
}
