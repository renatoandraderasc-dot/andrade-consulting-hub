import { chamarRelatorio, avisoRelatorio, pick as col } from "@/lib/vrReport";

// ==========================================================
// Catalogo unificado de produtos.
//
// Nem todo conector publica o relatorio "catalogo_produtos"
// (os conectores VR, por exemplo, expoem "produtos",
// "produtos_precos" e "estoque_atual"). Aqui montamos uma base
// unica combinando o que a loja tiver disponivel, para que
// Catalogo e Consulta de Precos funcionem em qualquer cliente.
// ==========================================================

export interface CatalogoItem {
  codigo: string;
  descricao: string;
  ean: string;
  custo: number | null;
  preco: number | null;
  precoOferta: number | null;
  estoque: number | null;
  n1: string;
  n2: string;
  n3: string;
  n4: string;
  /** true quando o preco veio da media de venda (ERP sem tabela de precos completa) */
  precoEstimado?: boolean;
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};

/** Remove zeros a esquerda para casar codigos entre relatorios distintos. */
export const normalizarCodigo = (valor: unknown) => {
  const c = String(valor ?? "").trim();
  return c.replace(/^0+/, "") || c;
};

export function mapearLinhaCatalogo(l: any): CatalogoItem {
  return {
    codigo: String(col(l, "codigo", "cod_produto", "codigo_reduzido", "id_produto", "produto_id") ?? ""),
    descricao: String(col(l, "descricao", "produto", "nome") ?? ""),
    ean: String(col(l, "codigo_barras", "ean", "barras") ?? ""),
    custo: numOrNull(col(l, "custo", "preco_custo")),
    preco: numOrNull(col(l, "preco_venda", "preco", "venda")),
    precoOferta: numOrNull(col(l, "preco_oferta", "oferta")),
    estoque: numOrNull(col(l, "estoque", "saldo_estoque", "qtd_estoque", "estoque_atual")),
    n1: String(col(
      l,
      "m1_departamento",
      "mercadologico1",
      "mercadologico_1",
      "departamento",
      "nivel1",
      "secao",
      "desc_secao",
      "descricao_secao",
      "sec",
      "dept",
      "grupo_1",
    ) ?? ""),
    n2: String(col(l, "m2_grupo", "grupo", "nivel2", "categoria") ?? ""),
    n3: String(col(l, "m3_subgrupo", "subgrupo", "nivel3") ?? ""),
    n4: String(col(l, "m4_familia", "familia", "nivel4") ?? ""),
  };
}

const cache = new Map<string, CatalogoItem[]>();

/**
 * Monta a base completa da loja usando os relatorios "produtos",
 * "produtos_precos" e "estoque_atual". Usado quando a loja nao
 * publica "catalogo_produtos" (ou quando ele volta vazio).
 */
export async function carregarBaseCatalogo(storeId: string): Promise<CatalogoItem[]> {
  if (!storeId) return [];
  const emCache = cache.get(storeId);
  if (emCache) return emCache;

  // Alguns conectores (ORACLE/Intersolid) so publicam parte do cadastro em
  // cada relatorio: "produtos" traz EAN/descricao de todos os itens, mas o
  // preco so aparece em "estoque_atual"/"catalogo_produtos" (subconjuntos).
  // Para nao deixar o item sem preco, usamos como ultimo recurso o preco
  // medio de venda dos ultimos 90 dias (ranking_produtos).
  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const inicio90 = new Date(hoje.getTime() - 90 * 86400000);

  const [rp, rpp, re, rc, rr] = await Promise.all([
    chamarRelatorio(storeId, "produtos", {}),
    chamarRelatorio(storeId, "produtos_precos", {}),
    chamarRelatorio(storeId, "estoque_atual", {}),
    chamarRelatorio(storeId, "catalogo_produtos", {}),
    chamarRelatorio(storeId, "ranking_produtos", { inicio: iso(inicio90), fim: iso(hoje) }),
  ]);

  const chaveLinha = (l: any) => normalizarCodigo(col(l, "id_produto", "codigo", "produto_id"));

  const indexar = (linhas: any[]) => {
    const m = new Map<string, CatalogoItem>();
    for (const l of linhas || []) {
      const k = chaveLinha(l);
      if (k) m.set(k, mapearLinhaCatalogo(l));
    }
    return m;
  };

  // EAN / preco vindos de produtos_precos
  const precos = indexar(rpp.dados || []);
  // Estoque e preco vindos de estoque_atual
  const estoques = indexar(re.dados || []);
  // Preco e oferta vindos de catalogo_produtos (quando publicado sem filtro)
  const catalogo = indexar(rc.dados || []);

  // Preco medio de venda (fallback): VENDAS / VOLUME
  const medios = new Map<string, number>();
  for (const l of rr.dados || []) {
    const k = chaveLinha(l);
    const vendas = numOrNull(col(l, "vendas", "total_vendido", "valor_venda", "total")) ?? 0;
    const volume = numOrNull(col(l, "volume", "quantidade", "qtd")) ?? 0;
    if (k && vendas > 0 && volume > 0) medios.set(k, Math.round((vendas / volume) * 100) / 100);
  }

  const base = (rp.dados || []).length
    ? rp.dados
    : (rc.dados || []).length
      ? rc.dados
      : (rpp.dados || []).length
        ? rpp.dados
        : re.dados || [];

  const lista: CatalogoItem[] = (base || []).map((l: any) => {
    const item = mapearLinhaCatalogo(l);
    const k = normalizarCodigo(item.codigo);
    const p = precos.get(k);
    const e = estoques.get(k);
    const c = catalogo.get(k);
    const medio = medios.get(k) ?? null;
    const preco = item.preco || p?.preco || c?.preco || e?.preco || null;
    return {
      ...item,
      ean: item.ean || p?.ean || c?.ean || "",
      custo: item.custo ?? p?.custo ?? c?.custo ?? e?.custo ?? null,
      preco: preco ?? medio,
      precoEstimado: !preco && medio != null,
      precoOferta: item.precoOferta || p?.precoOferta || c?.precoOferta || e?.precoOferta || null,
      estoque: item.estoque ?? e?.estoque ?? null,
      n1: item.n1 || c?.n1 || e?.n1 || "",
      n2: item.n2 || c?.n2 || e?.n2 || "",
      n3: item.n3 || c?.n3 || e?.n3 || "",
      n4: item.n4 || c?.n4 || e?.n4 || "",
    };
  });

  if (lista.length) cache.set(storeId, lista);
  return lista;
}

export function limparCacheCatalogo(storeId?: string) {
  if (storeId) cache.delete(storeId);
  else cache.clear();
}

const soDigitos = (s: string) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");

/** Variantes do codigo lido (EAN-13/12, com e sem digito verificador). */
export function variantesCodigo(termo: string): string[] {
  const t = String(termo ?? "").trim();
  const d = soDigitos(t);
  const vs = new Set<string>([t]);
  if (d) {
    vs.add(d);
    if (d.length === 12) vs.add("0" + d);
    if (d.length === 13 && d.startsWith("0")) vs.add(d.slice(1));
  }
  return [...vs].filter(Boolean);
}

/** Busca local por EAN, codigo reduzido ou parte da descricao. */
export function filtrarCatalogo(base: CatalogoItem[], termo: string, limite = 200): CatalogoItem[] {
  const t = String(termo ?? "").trim();
  if (!t) return base.slice(0, limite);
  const alvos = variantesCodigo(t).map(soDigitos).filter(Boolean);
  if (alvos.length) {
    const porCodigo = base.filter(
      (p) => alvos.includes(soDigitos(p.ean)) || alvos.includes(soDigitos(p.codigo)),
    );
    if (porCodigo.length) return porCodigo.slice(0, limite);
  }
  const termoLower = t.toLowerCase();
  return base.filter((p) => p.descricao.toLowerCase().includes(termoLower)).slice(0, limite);
}

export { avisoRelatorio };
