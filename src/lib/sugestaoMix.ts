export interface MixSugestao {
  categoria: string;
  prioridade: number;
  grupo: string;
  ean: string;
  descricao: string;
  situacao: "Não cadastrado" | "Cadastrado, sem venda";
  lojas_vendem: number;
  lojas_base: number;
  presenca_pct: number;
  lojas_curva_a: number;
  lojas_curva_ab: number;
  venda_mes_loja: number;
  unid_mes_loja: number;
  preco_medio: number;
  margem_pct: number | null;
  part_secao_pct: number;
}

export interface MixBaseResumo {
  store_id: string;
  loja: string;
  dias: number;
  eans: number;
  vendas: number;
  atualizado_em: string;
}

export type MixSortKey =
  | "prioridade"
  | "grupo"
  | "ean"
  | "descricao"
  | "situacao"
  | "presenca_pct"
  | "lojas_curva_a"
  | "lojas_curva_ab"
  | "venda_mes_loja"
  | "unid_mes_loja"
  | "preco_medio"
  | "margem_pct"
  | "part_secao_pct";

export interface MixFiltros {
  categorias: string[];
  situacao: string;
  busca: string;
  soCurvaA3: boolean;
}

const texto = (valor: unknown) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

const numero = (valor: unknown) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

export function normalizarSugestao(linha: Record<string, unknown>): MixSugestao {
  return {
    categoria: String(linha.categoria ?? "SEM CATEGORIA"),
    prioridade: numero(linha.prioridade) ?? 0,
    grupo: String(linha.grupo ?? ""),
    ean: String(linha.ean ?? ""),
    descricao: String(linha.descricao ?? ""),
    situacao: linha.situacao === "Cadastrado, sem venda" ? "Cadastrado, sem venda" : "Não cadastrado",
    lojas_vendem: numero(linha.lojas_vendem) ?? 0,
    lojas_base: numero(linha.lojas_base) ?? 0,
    presenca_pct: numero(linha.presenca_pct) ?? 0,
    lojas_curva_a: numero(linha.lojas_curva_a) ?? 0,
    lojas_curva_ab: numero(linha.lojas_curva_ab) ?? 0,
    venda_mes_loja: numero(linha.venda_mes_loja) ?? 0,
    unid_mes_loja: numero(linha.unid_mes_loja) ?? 0,
    preco_medio: numero(linha.preco_medio) ?? 0,
    margem_pct: numero(linha.margem_pct),
    part_secao_pct: numero(linha.part_secao_pct) ?? 0,
  };
}

export function normalizarBaseResumo(linha: Record<string, unknown>): MixBaseResumo {
  return {
    store_id: String(linha.store_id ?? ""),
    loja: String(linha.loja ?? ""),
    dias: numero(linha.dias) ?? 0,
    eans: numero(linha.eans) ?? 0,
    vendas: numero(linha.vendas) ?? 0,
    atualizado_em: String(linha.atualizado_em ?? ""),
  };
}

export function filtrarSugestoes(linhas: MixSugestao[], filtros: MixFiltros): MixSugestao[] {
  const busca = texto(filtros.busca.trim());
  const buscaEan = filtros.busca.replace(/\D/g, "");
  return linhas.filter((linha) => {
    if (filtros.categorias.length > 0 && !filtros.categorias.includes(linha.categoria)) return false;
    if (filtros.situacao !== "todas" && linha.situacao !== filtros.situacao) return false;
    if (filtros.soCurvaA3 && linha.lojas_curva_a < 3) return false;
    if (busca && !texto(linha.descricao).includes(busca) && !texto(linha.ean).includes(busca)) {
      if (!buscaEan || !linha.ean.replace(/\D/g, "").includes(buscaEan)) return false;
    }
    return true;
  });
}

export function ordenarSugestoes(
  linhas: MixSugestao[],
  key: MixSortKey,
  direcao: "asc" | "desc",
): MixSugestao[] {
  const sinal = direcao === "asc" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va === null && vb === null) return a.ean.localeCompare(b.ean, "pt-BR");
    if (va === null) return 1;
    if (vb === null) return -1;
    const comparacao = typeof va === "number" && typeof vb === "number"
      ? va - vb
      : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    if (comparacao === 0) return a.prioridade - b.prioridade || a.ean.localeCompare(b.ean, "pt-BR");
    return comparacao * sinal;
  });
}

export function agruparSugestoes(linhas: MixSugestao[]): Array<[string, MixSugestao[]]> {
  const grupos = new Map<string, MixSugestao[]>();
  for (const linha of linhas) {
    const atual = grupos.get(linha.categoria) ?? [];
    atual.push(linha);
    grupos.set(linha.categoria, atual);
  }
  return Array.from(grupos.entries())
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([categoria, itens]) => [categoria, ordenarSugestoes(itens, "prioridade", "asc")]);
}

export function resumoSugestoes(linhas: MixSugestao[]) {
  return {
    total: linhas.length,
    naoCadastrados: linhas.filter((l) => l.situacao === "Não cadastrado").length,
    cadastradosSemVenda: linhas.filter((l) => l.situacao === "Cadastrado, sem venda").length,
    vendaPotencial: linhas.reduce((total, l) => total + l.venda_mes_loja, 0),
  };
}

export function contarPorCategoria(linhas: MixSugestao[]) {
  const contagem = new Map<string, number>();
  for (const linha of linhas) contagem.set(linha.categoria, (contagem.get(linha.categoria) ?? 0) + 1);
  return Array.from(contagem, ([categoria, quantidade]) => ({ categoria, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.categoria.localeCompare(b.categoria, "pt-BR"));
}

export function dataBaseMaisRecente(base: MixBaseResumo[]): string | null {
  const validas = base.map((b) => b.atualizado_em).filter((data) => Number.isFinite(Date.parse(data)));
  if (!validas.length) return null;
  return validas.reduce((maisRecente, data) => Date.parse(data) > Date.parse(maisRecente) ? data : maisRecente);
}

export function nomeAbaCategoria(categoria: string, usados: Set<string>): string {
  const base = (categoria.replace(/[\\/*?:[\]]/g, " ").trim() || "Categoria").slice(0, 31);
  let nome = base;
  let sequencia = 2;
  while (usados.has(nome.toLocaleLowerCase("pt-BR"))) {
    const sufixo = ` ${sequencia++}`;
    nome = `${base.slice(0, 31 - sufixo.length)}${sufixo}`;
  }
  usados.add(nome.toLocaleLowerCase("pt-BR"));
  return nome;
}

export function sugestaoParaExcel(l: MixSugestao): Record<string, string | number | null> {
  return {
    "Categoria": l.categoria,
    "#": l.prioridade,
    "Grupo": l.grupo,
    "EAN": l.ean,
    "Descrição": l.descricao,
    "Situação": l.situacao,
    "Lojas que vendem": l.lojas_vendem,
    "Lojas da base": l.lojas_base,
    "Presença %": l.presenca_pct,
    "Curva A (lojas)": l.lojas_curva_a,
    "Curva A/B (lojas)": l.lojas_curva_ab,
    "Venda/mês por loja (R$)": l.venda_mes_loja,
    "Unid./mês por loja": l.unid_mes_loja,
    "Preço médio (R$)": l.preco_medio,
    "Margem %": l.margem_pct,
    "Part. na seção %": l.part_secao_pct,
  };
}
