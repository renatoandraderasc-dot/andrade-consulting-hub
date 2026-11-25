import { useEffect, useMemo, useState } from "react";
import { useHierarquiaVendas } from "@/hooks/useHierarquiaVendas";
import { analisarProdutosGestao, periodosGestao } from "@/lib/gestaoProdutos";
import { ALIAS_EAN, ALIAS_ESTOQUE, chamarRelatorio, num, pick } from "@/lib/vrReport";
import { carregarBaseCatalogo, normalizarCodigo } from "@/lib/catalogoProdutos";

export function useGestaoProdutos(storeId: string, ano: number, mes: number) {
  const periodos = useMemo(() => periodosGestao(ano, mes), [ano, mes]);
  const atual = useHierarquiaVendas(storeId, periodos[0].inicio, periodos[0].fim);
  const m1 = useHierarquiaVendas(storeId, periodos[1].inicio, periodos[1].fim);
  const m2 = useHierarquiaVendas(storeId, periodos[2].inicio, periodos[2].fim);
  const m3 = useHierarquiaVendas(storeId, periodos[3].inicio, periodos[3].fim);
  const itens = useMemo(() => analisarProdutosGestao(atual.linhas ?? [], [m1.linhas ?? [], m2.linhas ?? [], m3.linhas ?? []]), [atual.linhas, m1.linhas, m2.linhas, m3.linhas]);
  const [base, setBase] = useState<{ estoque: Map<string, number>; ean: Map<string, string> } | null>(null);
  const fim = periodos[0].fim;

  useEffect(() => {
    let ativo = true;
    setBase(null);
    if (!storeId) return;
    const d = new Date(`${fim}T12:00:00`);
    d.setDate(d.getDate() - 89);
    const inicio = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    void (async () => {
      const estoque = new Map<string, number>();
      const ean = new Map<string, string>();
      const r = await chamarRelatorio(storeId, "estoque_dinamico", { inicio, fim }).catch(() => null);
      for (const linha of r?.dados ?? []) {
        const cod = normalizarCodigo(pick(linha, "codigo", "cod_produto", "id_produto"));
        const cb = String(pick(linha, ...ALIAS_EAN) ?? "").trim();
        const estRaw = pick(linha, "estoque_dinamico") ?? pick(linha, ...ALIAS_ESTOQUE);
        const valor = estRaw !== undefined && String(estRaw).trim() !== "" ? num(estRaw) : num(pick(linha, "qtd_compra", "quantidade_compra")) - num(pick(linha, "qtd_venda", "quantidade_venda"));
        if (cod) estoque.set(`c:${cod}`, valor);
        if (cb) estoque.set(`e:${cb}`, valor);
        if (cod && cb) ean.set(cod, cb);
      }
      for (const p of await carregarBaseCatalogo(storeId).catch(() => [])) {
        const cod = normalizarCodigo(p.codigo), cb = String(p.ean ?? "").trim();
        if (cod && cb && !ean.has(cod)) ean.set(cod, cb);
        if (p.estoque !== null && p.estoque !== undefined) {
          if (cod && !estoque.has(`c:${cod}`)) estoque.set(`c:${cod}`, p.estoque);
          if (cb && !estoque.has(`e:${cb}`)) estoque.set(`e:${cb}`, p.estoque);
        }
      }
      if (ativo) setBase({ estoque, ean });
    })();
    return () => { ativo = false; };
  }, [storeId, fim]);

  const produtos = useMemo(() => itens.map((p) => {
    const codigo = normalizarCodigo(p.codigo);
    const ean = p.ean || base?.ean.get(codigo) || "";
    return { ...p, ean, estoque: base?.estoque.get(`c:${codigo}`) ?? base?.estoque.get(`e:${ean}`) ?? null };
  }), [itens, base]);
  return {
    produtos,
    fim,
    loading: atual.loading || m1.loading || m2.loading || m3.loading || !atual.linhas || !m1.linhas || !m2.linhas || !m3.linhas,
    erro: [atual.errorMsg, m1.errorMsg, m2.errorMsg, m3.errorMsg].filter(Boolean).join(" · "),
    nivelProduto: [atual, m1, m2, m3].some((r) => r.nivelProduto),
    refresh: async () => { for (const r of [atual, m1, m2, m3]) await r.refresh(); },
  };
}