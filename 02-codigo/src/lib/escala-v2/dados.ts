/**
 * Escala V2 — leitura e gravação no banco do Hub (tabelas escala2_*).
 * Nada aqui lê ou grava as tabelas da Escala atual, a não ser a leitura
 * única de `escala_funcionarios` quando o usuário pede para importar a equipe.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { feriadosNacionais } from "./leis";
import {
  REGRAS_PADRAO, diasDoMes, numData,
  type Ausencia, type DiaEscala, type Feriado, type Pessoa, type RegrasLoja, type TipoDia, type TurnoPreferido,
} from "./motor";

// As tabelas novas ainda não estão nos tipos gerados do Supabase.
const db = supabase as unknown as SupabaseClient;

export interface PessoaRow extends Pessoa {
  store_id: string;
  cargo: string | null;
  ativo: boolean;
}
export interface AusenciaRow extends Ausencia {
  id: string;
  store_id: string;
  observacao: string | null;
}
export interface FeriadoRow extends Feriado {
  id: string;
  store_id: string;
}
export interface MesRow {
  id: string;
  store_id: string;
  ano: number;
  mes: number;
  status: "rascunho" | "publicada";
  erros: number;
  alertas: number;
  parecer_ia: string | null;
  gerada_em: string | null;
  publicada_em: string | null;
  justificativa: string | null;
}
export interface FeriadoMes extends Feriado {
  /** nacional = calculado pelo sistema; loja = cadastrado pela loja */
  origem: "nacional" | "loja";
  id?: string;
}

export interface DadosEscalaV2 {
  storeId: string;
  ano: number;
  mes: number;
  podeGerir: boolean;
  regras: RegrasLoja;
  instrucoes: string;
  pessoas: PessoaRow[];
  ausencias: AusenciaRow[];
  feriados: FeriadoMes[];
  mesRow: MesRow | null;
  dias: DiaEscala[];
  historico: DiaEscala[];
}

/** O banco ainda não recebeu a migration da Escala V2. */
export class BancoNaoPreparado extends Error {
  constructor() {
    super("As tabelas da Escala IA ainda não foram criadas no banco do Hub.");
  }
}

function conferir<T>(r: { data: T; error: { code?: string; message: string } | null }): T {
  if (r.error) {
    if (r.error.code === "42P01" || r.error.code === "PGRST205" || r.error.code === "PGRST202" || /escala2_/.test(r.error.message) && /does not exist|not find|schema cache/i.test(r.error.message)) throw new BancoNaoPreparado();
    throw new Error(r.error.message);
  }
  return r.data;
}

const hhmm = (v: unknown): string | null => (typeof v === "string" && v ? v.slice(0, 5) : null);

function normalizarRegras(bruto: unknown): RegrasLoja {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Partial<RegrasLoja>;
  const horario = Array.isArray(r.horario) && r.horario.length === 7 ? r.horario.map(h => ({ abre: hhmm(h?.abre), fecha: hhmm(h?.fecha) })) : REGRAS_PADRAO.horario;
  const pesos = Array.isArray(r.pesos_dia) && r.pesos_dia.length === 7 ? r.pesos_dia.map(x => (Number(x) > 0 ? Number(x) : 1)) : REGRAS_PADRAO.pesos_dia;
  const setores = Array.isArray(r.setores)
    ? r.setores.filter(s => s && typeof s.setor === "string" && s.setor.trim()).map(s => ({ setor: s.setor.trim(), minimo: Math.max(0, Math.round(Number(s.minimo) || 0)), antes_min: Math.max(0, Math.round(Number(s.antes_min) || 0)), depois_min: Math.max(0, Math.round(Number(s.depois_min) || 0)) }))
    : [];
  return {
    ...REGRAS_PADRAO,
    ...r,
    horario,
    pesos_dia: pesos,
    setores,
    domingo_cada_semanas: r.domingo_cada_semanas === 2 ? 2 : 3,
    cct_intervalo_min: r.cct_intervalo_min ? Math.max(30, Number(r.cct_intervalo_min)) : null,
    cct_diaria_max_min: r.cct_diaria_max_min ? Math.min(600, Number(r.cct_diaria_max_min)) : null,
    antecipar_desde: r.antecipar_desde || null,
  };
}

/** Feriados nacionais + os da loja para o mês e a semana seguinte (o gerador olha a semana inteira). */
export function feriadosDoPeriodo(ano: number, mes: number, daLoja: FeriadoRow[]): FeriadoMes[] {
  const dias = diasDoMes(ano, mes);
  const ini = numData(dias[0] - 7);
  const fim = numData(dias[dias.length - 1] + 7);
  const mapa = new Map<string, FeriadoMes>();
  for (const a of [ano - 1, ano, ano + 1])
    for (const f of feriadosNacionais(a)) if (f.data >= ini && f.data <= fim) mapa.set(f.data, { ...f, loja_abre: false, origem: "nacional" });
  for (const f of daLoja) {
    if (f.data < ini || f.data > fim) continue;
    const nacional = mapa.get(f.data);
    mapa.set(f.data, { data: f.data, nome: nacional?.nome || f.nome, loja_abre: f.loja_abre, origem: nacional ? "nacional" : "loja", id: f.id });
  }
  return [...mapa.values()].sort((x, y) => x.data.localeCompare(y.data));
}

async function diasEntre(storeId: string, inicio: string, fim: string): Promise<DiaEscala[]> {
  const out: DiaEscala[] = [];
  for (let offset = 0; ; offset += 1000) {
    const linhas = conferir(await db.from("escala2_dias").select("pessoa_id,data,tipo,inicio,fim,intervalo_min,travado,manual").eq("store_id", storeId).gte("data", inicio).lte("data", fim).order("data").order("pessoa_id").range(offset, offset + 999)) as Record<string, unknown>[];
    for (const l of linhas || [])
      out.push({ pessoa_id: String(l.pessoa_id), data: String(l.data), tipo: l.tipo as TipoDia, inicio: hhmm(l.inicio), fim: hhmm(l.fim), intervalo_min: l.intervalo_min === null ? null : Number(l.intervalo_min), travado: !!l.travado, manual: !!l.manual });
    if ((linhas?.length || 0) < 1000) return out;
  }
}

export async function carregarEscalaV2(storeId: string, ano: number, mes: number): Promise<DadosEscalaV2> {
  const dias = diasDoMes(ano, mes);
  const inicio = numData(dias[0]);
  const fim = numData(dias[dias.length - 1]);
  const historicoDesde = numData(dias[0] - 42);
  const pode = conferir(await db.rpc("escala2_pode_gerir", { p_store: storeId })) === true;
  const [regras, pessoas, feriados, mesRow, todos] = await Promise.all([
    db.from("escala2_regras").select("regras,instrucoes_ia").eq("store_id", storeId).maybeSingle(),
    db.from("escala2_pessoas").select("*").eq("store_id", storeId).or(`ativo.eq.true,desligamento.gte.${inicio}`).order("setor").order("nome"),
    db.from("escala2_feriados").select("*").eq("store_id", storeId).gte("data", numData(dias[0] - 7)).lte("data", numData(dias[dias.length - 1] + 7)).order("data"),
    db.from("escala2_meses").select("*").eq("store_id", storeId).eq("ano", ano).eq("mes", mes).maybeSingle(),
    diasEntre(storeId, historicoDesde, fim),
  ]);
  // ausências só são visíveis para quem gere a escala
  const ausencias = pode ? conferir(await db.from("escala2_ausencias").select("*").eq("store_id", storeId).lte("inicio", numData(dias[dias.length - 1] + 7)).gte("fim", historicoDesde).order("inicio")) : [];
  const regrasRow = conferir(regras) as { regras: unknown; instrucoes_ia: string | null } | null;
  const pessoasRows = ((conferir(pessoas) as Record<string, unknown>[]) || []).map(p => ({
    id: String(p.id), store_id: String(p.store_id), nome: String(p.nome), setor: String(p.setor), cargo: (p.cargo as string) || null,
    turno: (p.turno as TurnoPreferido) || "auto", folga_fixa: p.folga_fixa === null || p.folga_fixa === undefined ? null : Number(p.folga_fixa),
    carga_semanal: p.carga_semanal === null || p.carga_semanal === undefined ? null : Number(p.carga_semanal),
    nascimento: (p.nascimento as string) || null, aprendiz: !!p.aprendiz, domingo_quinzenal: !!p.domingo_quinzenal,
    admissao: (p.admissao as string) || null, desligamento: (p.desligamento as string) || null, ativo: !!p.ativo,
  })) as PessoaRow[];
  const feriadosLoja = ((conferir(feriados) as Record<string, unknown>[]) || []).map(f => ({ id: String(f.id), store_id: String(f.store_id), data: String(f.data), nome: String(f.nome), loja_abre: !!f.loja_abre })) as FeriadoRow[];
  return {
    storeId, ano, mes, podeGerir: pode,
    regras: normalizarRegras(regrasRow?.regras),
    instrucoes: regrasRow?.instrucoes_ia || "",
    pessoas: pessoasRows,
    ausencias: (ausencias as AusenciaRow[]) || [],
    feriados: feriadosDoPeriodo(ano, mes, feriadosLoja),
    mesRow: (conferir(mesRow) as MesRow | null) || null,
    dias: todos.filter(d => d.data >= inicio),
    historico: todos.filter(d => d.data < inicio),
  };
}

// ------------------------------------------------------------ gravação

export async function salvarRegras(storeId: string, regras: RegrasLoja, instrucoes: string): Promise<void> {
  conferir(await db.from("escala2_regras").upsert({ store_id: storeId, regras, instrucoes_ia: instrucoes.trim() || null }, { onConflict: "store_id" }));
}

export type PessoaForm = Omit<PessoaRow, "id" | "store_id"> & { id?: string };

export async function salvarPessoa(storeId: string, p: PessoaForm): Promise<void> {
  const linha = {
    store_id: storeId, nome: p.nome.trim(), setor: p.setor.trim(), cargo: p.cargo?.trim() || null, turno: p.turno, folga_fixa: p.folga_fixa,
    carga_semanal: p.carga_semanal || null, nascimento: p.nascimento || null, aprendiz: p.aprendiz, domingo_quinzenal: p.domingo_quinzenal,
    admissao: p.admissao || null, desligamento: p.desligamento || null, ativo: p.ativo,
  };
  conferir(p.id ? await db.from("escala2_pessoas").update(linha).eq("id", p.id) : await db.from("escala2_pessoas").insert(linha));
}

export async function salvarPessoasEmLote(storeId: string, lista: { nome: string; setor: string }[]): Promise<number> {
  const linhas = lista.filter(p => p.nome.trim() && p.setor.trim()).map(p => ({ store_id: storeId, nome: p.nome.trim(), setor: p.setor.trim() }));
  if (!linhas.length) return 0;
  conferir(await db.from("escala2_pessoas").insert(linhas));
  return linhas.length;
}

export async function desativarPessoa(id: string): Promise<void> {
  conferir(await db.from("escala2_pessoas").update({ ativo: false, desligamento: new Date().toISOString().slice(0, 10) }).eq("id", id));
}

/** Copia a equipe ativa da Escala atual (somente leitura lá) para a Escala V2. */
export async function importarDaEscalaAtual(storeId: string, jaExistem: PessoaRow[]): Promise<number> {
  const r = await supabase.from("escala_funcionarios").select("nome,departamento,cargo,data_nascimento,aprendiz,domingo_quinzenal,carga_semanal_contratual,folga_preferida,admissao").eq("store_id", storeId).eq("ativo", true).order("nome");
  if (r.error) throw new Error(r.error.message);
  const chave = (nome: string, setor: string) => `${nome.trim().toLowerCase()}|${setor.trim().toLowerCase()}`;
  const tem = new Set(jaExistem.map(p => chave(p.nome, p.setor)));
  const linhas = (r.data || []).filter(f => !tem.has(chave(f.nome, f.departamento))).map(f => ({
    store_id: storeId, nome: f.nome, setor: f.departamento, cargo: f.cargo, nascimento: f.data_nascimento, aprendiz: f.aprendiz,
    domingo_quinzenal: f.domingo_quinzenal, carga_semanal: f.carga_semanal_contratual, folga_fixa: f.folga_preferida, admissao: f.admissao,
  }));
  if (linhas.length) conferir(await db.from("escala2_pessoas").insert(linhas));
  return linhas.length;
}

export async function salvarAusencia(storeId: string, a: { pessoa_id: string; tipo: Ausencia["tipo"]; inicio: string; fim: string; observacao?: string | null }): Promise<void> {
  conferir(await db.from("escala2_ausencias").insert({ store_id: storeId, ...a, observacao: a.observacao?.trim() || null }));
}
export async function excluirAusencia(id: string): Promise<void> {
  conferir(await db.from("escala2_ausencias").delete().eq("id", id));
}

export async function salvarFeriado(storeId: string, f: { data: string; nome: string; loja_abre: boolean }): Promise<void> {
  conferir(await db.from("escala2_feriados").upsert({ store_id: storeId, data: f.data, nome: f.nome.trim() || "Feriado", loja_abre: f.loja_abre }, { onConflict: "store_id,data" }));
}
export async function excluirFeriado(id: string): Promise<void> {
  conferir(await db.from("escala2_feriados").delete().eq("id", id));
}

export async function salvarEscalaGerada(storeId: string, ano: number, mes: number, dias: DiaEscala[], erros: number, alertas: number, parecer: string | null): Promise<void> {
  conferir(await db.rpc("escala2_salvar", {
    p_store: storeId, p_ano: ano, p_mes: mes,
    p_dias: dias.map(d => ({ pessoa_id: d.pessoa_id, data: d.data, tipo: d.tipo, inicio: d.inicio || "", fim: d.fim || "", intervalo_min: d.intervalo_min ?? "", travado: !!d.travado })),
    p_erros: erros, p_alertas: alertas, p_parecer: parecer,
  }));
}

export async function salvarDia(d: DadosEscalaV2, dia: DiaEscala): Promise<void> {
  let mesId = d.mesRow?.id;
  if (!mesId) {
    conferir(await db.from("escala2_meses").upsert({ store_id: d.storeId, ano: d.ano, mes: d.mes }, { onConflict: "store_id,ano,mes", ignoreDuplicates: true }));
    const linha = conferir(await db.from("escala2_meses").select("id").eq("store_id", d.storeId).eq("ano", d.ano).eq("mes", d.mes).single()) as { id: string };
    mesId = linha.id;
  }
  const trabalho = dia.tipo === "T";
  conferir(await db.from("escala2_dias").upsert({
    mes_id: mesId, store_id: d.storeId, pessoa_id: dia.pessoa_id, data: dia.data, tipo: dia.tipo,
    inicio: trabalho ? dia.inicio : null, fim: trabalho ? dia.fim : null, intervalo_min: trabalho ? dia.intervalo_min ?? 0 : null,
    travado: !!dia.travado, manual: true,
  }, { onConflict: "pessoa_id,data" }));
}

export async function atualizarContagem(mesId: string, erros: number, alertas: number): Promise<void> {
  conferir(await db.from("escala2_meses").update({ erros, alertas }).eq("id", mesId));
}

export async function publicarEscala(mesId: string, erros: number, alertas: number, justificativa: string): Promise<void> {
  conferir(await db.from("escala2_meses").update({ status: "publicada", erros, alertas, justificativa: justificativa.trim() || null }).eq("id", mesId));
}
export async function reabrirEscala(mesId: string): Promise<void> {
  conferir(await db.from("escala2_meses").update({ status: "rascunho" }).eq("id", mesId));
}
