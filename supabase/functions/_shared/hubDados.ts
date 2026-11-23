// Shared by the browser and edge functions; no runtime dependencies.
export type LinhaHub = Record<string, unknown>;
export const RELATORIOS_DIARIOS = ["ranking_produtos", "compras_vendas_periodo", "analise_compras"] as const;
export const diario = (relatorio: string) => (RELATORIOS_DIARIOS as readonly string[]).includes(relatorio);

export function diasEntre(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const d = new Date(`${inicio}T12:00:00Z`);
  const f = new Date(`${fim}T12:00:00Z`);
  while (d <= f && dias.length < 400) {
    dias.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

const IDENT = /^(codigo|barras|ean|cod_.*|id_.*|loja)$/i;
const NAO_SOMA = /(_pct|percent|preco|mix|margem|estoque|saldo|custo_medio|custo_unit)/i;
const DATA = /^(data|dia|mes|ano|inicio|fim|data_.*|dt_.*|ultima_.*)$/i;
const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v.trim())) return null;
  return Number(v);
};

/** Movement reports add amounts, not identifiers, prices, stock or percentages. */
export function agregarDias(dias: LinhaHub[][]): LinhaHub[] {
  const mapa = new Map<string, LinhaHub>();
  for (const linhas of dias) for (const l of linhas) {
    if (!l || typeof l !== "object") continue;
    const ident = Object.entries(l).filter(([k, v]) => !DATA.test(k) && (IDENT.test(k) || numero(v) === null));
    const chave = JSON.stringify(ident.sort(([a], [b]) => a.localeCompare(b)));
    const acc = mapa.get(chave);
    if (!acc) { mapa.set(chave, { ...l }); continue; }
    for (const [k, v] of Object.entries(l)) {
      const n = numero(v);
      if (n !== null && !IDENT.test(k) && !NAO_SOMA.test(k) && !DATA.test(k)) acc[k] = (numero(acc[k]) ?? 0) + n;
    }
  }
  const out = [...mapa.values()];
  for (const l of out) {
    const entrada = Object.entries(l);
    const venda = entrada.find(([k]) => /^(vendas|total_venda|total_vendido|valor_venda|faturamento)$/i.test(k));
    const lucro = entrada.find(([k]) => /^lucro$/i.test(k));
    const v = numero(venda?.[1]);
    const p = numero(lucro?.[1]);
    if (v && p !== null) for (const k of Object.keys(l)) if (/^margem_pct$/i.test(k)) l[k] = Math.round(p / v * 10000) / 100;
  }
  return out;
}

/** Purchase entries are individual invoices; they must not be merged. */
export const juntarDias = (relatorio: string, dias: LinhaHub[][]): LinhaHub[] =>
  relatorio === "analise_compras" ? dias.flat() : agregarDias(dias);

export function chaveDia(params: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.keys(params).sort()
    .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== "" && k !== "chave")
    .map(k => [k, String(params[k])])));
}

export interface LeituraSalva { params: unknown; fim?: unknown; atualizado_em: string; linhas?: number | null }

/**
 * Loja fora do ar: escolhe a leitura salva mais recente do MESMO periodo em
 * aberto. No modo D-1 o fim gravado e sempre "ontem" e muda todo dia, entao a
 * chave exata do pedido (ex.: mes inteiro) nunca existe. So vale para periodos
 * que chegam ate ontem/hoje; um periodo ja fechado nunca recebe leitura parcial.
 */
export function escolherLeituraAnterior<T extends LeituraSalva>(registros: T[], params: Record<string, unknown>, ontem: string): T | null {
  const iso = (v: unknown) => { const s = String(v ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; };
  const inicio = iso(params.inicio), fim = iso(params.fim);
  if (!inicio || !fim || fim < ontem) return null;
  const semFim = (p: Record<string, unknown>) => chaveDia(Object.fromEntries(Object.entries(p).filter(([k]) => k !== "fim")));
  const alvo = semFim(params);
  let melhor: T | null = null, melhorFim = "";
  for (const r of registros) {
    if (!r.params || typeof r.params !== "object" || Array.isArray(r.params)) continue;
    const p = r.params as Record<string, unknown>;
    const f = iso(p.fim);
    if (!f || f < inicio || f > fim || f > ontem || semFim(p) !== alvo) continue;
    if (r.linhas !== undefined && r.linhas !== null && r.linhas <= 0) continue;
    if (!melhor || f > melhorFim || (f === melhorFim && r.atualizado_em > melhor.atualizado_em)) { melhor = r; melhorFim = f; }
  }
  return melhor;
}

export interface TarefaSync { relatorio: string; params: Record<string, unknown> }
export function planejarSincronizacao(d1: string, existentes: TarefaSync[], soExistentes = false, backfill?: { inicio: string; fim: string }): TarefaSync[] {
  const tarefas = new Map<string, TarefaSync>();
  const add = (relatorio: string, params: Record<string, unknown>) => tarefas.set(`${relatorio}|${chaveDia(params)}`, { relatorio, params });
  const inicioMes = `${d1.slice(0, 7)}-01`;
  const anterior = new Date(`${inicioMes}T12:00:00Z`); anterior.setUTCDate(0);
  const fimAnterior = anterior.toISOString().slice(0, 10);
  const inicioAnterior = `${fimAnterior.slice(0, 7)}-01`;
  const ja = new Set(existentes.map(t => `${t.relatorio}|${chaveDia(t.params)}`));
  const adicionarDias = (inicio: string, fim: string, renovarD1: boolean) => {
    for (const d of diasEntre(inicio, fim)) for (const r of RELATORIOS_DIARIOS) {
      const p = { inicio: d, fim: d };
      if ((renovarD1 && d === d1) || !ja.has(`${r}|${chaveDia(p)}`)) add(r, p);
    }
  };
  if (backfill) { adicionarDias(backfill.inicio, backfill.fim < d1 ? backfill.fim : d1, false); return [...tarefas.values()]; }
  // Yesterday first; historical days are reused permanently.
  adicionarDias(d1, d1, true);
  for (const t of existentes) {
    if (diario(t.relatorio) || t.relatorio === "estoque_dinamico") continue;
    const fim = String(t.params.fim ?? t.params.data ?? "");
    if (fim && fim < inicioAnterior) continue;
    if (!fim) add(t.relatorio, t.params);
    else if (t.relatorio === "dre_periodo" && String(t.params.inicio).slice(0, 7) === fimAnterior.slice(0, 7)) add(t.relatorio, t.params);
    else add(t.relatorio, { ...t.params, ...(t.params.data ? { data: d1 } : { inicio: inicioMes, fim: d1 }) });
  }
  if (!soExistentes) {
    for (const r of ["kpis_periodo", "kpis_pic_periodo", "vendas_secao_periodo", "cupons_e_ticket", "dre_periodo", "receber_periodo", "pagamentos_periodo", "contas_a_pagar", "compras_por_fornecedor"]) add(r, { inicio: inicioMes, fim: d1 });
    for (const r of ["produtos", "produtos_precos", "estoque_atual", "produtos_ativos_12m"]) add(r, {});
    add("dre_periodo", { inicio: inicioAnterior, fim: fimAnterior });
    adicionarDias(inicioMes, d1, false);
  }
  return [...tarefas.values()];
}