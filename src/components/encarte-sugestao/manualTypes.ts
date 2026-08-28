import { pick, num, txt } from "@/lib/vrReport";

export type PosicaoManual = "capa" | "verso";

export interface LinhaManual {
  uid: string;
  ordem: number;
  codigo_digitado: string;
  encontrado: boolean;
  codigo: string;
  ean: string;
  descricao: string;
  descricao_encarte: string;
  secao: string;
  grupo: string;
  estoque: number;
  custo: number;
  preco_venda: number;
  margem_pct: number;
  em_oferta_hoje: boolean;
  preco_ultima_oferta: number | null;
  data_fim_ultima_oferta: string | null;
  dias_desde_ultima_oferta: number | null;
  semanas: { qtd: number; oferta: boolean }[];
  qtd_4sem: number;
  media_semanal_qtd: number;
  preco_encarte: number | null;
  posicao: PosicaoManual;
  ja_saiu_recente?: boolean;
  bruto: Record<string, unknown>;
}

const boolOf = (v: unknown) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "t" || s === "1" || s === "s" || s === "sim" || s === "y";
};

/** Normaliza a colagem do Excel: quebras, ; , TAB e espaco viram separador. */
export const normalizarCodigos = (texto: string): string[] => {
  const brutos = texto.split(/[\s;,\t\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const c of brutos) {
    const k = c.replace(/^0+/, "") || c;
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(c);
  }
  return saida;
};

export const linhaDoRetorno = (r: Record<string, unknown>, fallbackCodigo: string, ordem: number): LinhaManual => {
  const semanas = [1, 2, 3, 4].map((n) => ({
    qtd: num(pick(r, `s${n}_qtd`)),
    oferta: boolOf(pick(r, `s${n}_oferta`)),
  }));
  const descricao = txt(pick(r, "descricao", "descricao_reduzida", "produto", "nome"));
  const precoUlt = num(pick(r, "preco_ultima_oferta"));
  return {
    uid: `${ordem}-${fallbackCodigo}`,
    ordem,
    codigo_digitado: txt(pick(r, "codigo_digitado"), fallbackCodigo),
    encontrado: r ? boolOf(pick(r, "encontrado")) || !!txt(pick(r, "codigo")) : false,
    codigo: txt(pick(r, "codigo", "codigo_interno", "cod_reduzido")),
    ean: txt(pick(r, "ean", "codigo_barras", "cod_barras", "gtin")),
    descricao,
    descricao_encarte: descricao,
    secao: txt(pick(r, "secao", "departamento")),
    grupo: txt(pick(r, "grupo", "categoria")),
    estoque: num(pick(r, "estoque")),
    custo: num(pick(r, "custo", "custo_ultima_entrada", "custo_atual_cadastro", "custo_medio")),
    preco_venda: num(pick(r, "preco_venda")),
    margem_pct: num(pick(r, "margem_pct")),
    em_oferta_hoje: boolOf(pick(r, "em_oferta_hoje")),
    preco_ultima_oferta: precoUlt > 0 ? precoUlt : null,
    data_fim_ultima_oferta: txt(pick(r, "data_fim_ultima_oferta")) || null,
    dias_desde_ultima_oferta: pick(r, "dias_desde_ultima_oferta") != null
      ? num(pick(r, "dias_desde_ultima_oferta"))
      : null,
    semanas,
    qtd_4sem: num(pick(r, "qtd_4sem")),
    media_semanal_qtd: num(pick(r, "media_semanal_qtd")),
    preco_encarte: null,
    posicao: "capa",
    bruto: r,
  };
};

export const linhaNaoLocalizada = (codigo: string, ordem: number): LinhaManual => ({
  uid: `${ordem}-${codigo}`,
  ordem,
  codigo_digitado: codigo,
  encontrado: false,
  codigo: "",
  ean: "",
  descricao: "",
  descricao_encarte: "",
  secao: "",
  grupo: "",
  estoque: 0,
  custo: 0,
  preco_venda: 0,
  margem_pct: 0,
  em_oferta_hoje: false,
  preco_ultima_oferta: null,
  data_fim_ultima_oferta: null,
  dias_desde_ultima_oferta: null,
  semanas: [1, 2, 3, 4].map(() => ({ qtd: 0, oferta: false })),
  qtd_4sem: 0,
  media_semanal_qtd: 0,
  preco_encarte: null,
  posicao: "capa",
  bruto: {},
});

export const pmzDe = (custo: number, cargaPct: number) =>
  cargaPct > 0 ? custo / (1 - cargaPct / 100) : custo;

export const margemEncarte = (preco: number | null, custo: number) =>
  preco && preco > 0 ? ((preco - custo) / preco) * 100 : null;

export const corMargem = (m: number | null) =>
  m == null ? "" : m < 0 ? "text-destructive" : m <= 5 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
