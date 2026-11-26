/**
 * Escala V2 — motor (validador + gerador)
 * ------------------------------------------------------------------
 * Arquivo puro: sem Supabase, sem React, sem relógio do sistema.
 * Datas são 'YYYY-MM-DD' (dia corrido, sem fuso) e horários 'HH:MM'.
 *
 * Duas funções públicas:
 *   validar(ctx)  confere QUALQUER escala (gerada ou editada à mão)
 *                 contra as regras de leis.ts e devolve cada pendência
 *                 com a base legal;
 *   gerar(ctx)    monta a escala do mês: testa várias combinações de
 *                 folgas e turnos e fica com a melhor segundo o próprio
 *                 validador. Quem garante a lei é sempre o validador.
 *
 * A semana vai de segunda a domingo. Na semana em que a regra muda
 * (14 a 20/12/2026 e 13 a 19/12/2027) vale a regra nova para a semana
 * inteira, que é a leitura mais protetiva.
 */
import { BASE, LIMITES, faseEm, type FaseLegal } from "./leis";

// ============================================================ TIPOS

/** T trabalho · F folga (repouso semanal) · FR feriado · FER férias · AT atestado · AF afastado */
export type TipoDia = "T" | "F" | "FR" | "FER" | "AT" | "AF";
export type TurnoPreferido = "auto" | "abertura" | "intermediario" | "fechamento";
export type Nivel = "erro" | "alerta" | "info";

export interface HorarioDia {
  abre: string | null;
  fecha: string | null;
}

export interface SetorRegra {
  setor: string;
  /** Mínimo de pessoas presentes enquanto o setor funciona. */
  minimo: number;
  /** Minutos que o setor começa antes de a loja abrir (ex.: padaria 120). */
  antes_min: number;
  /** Minutos que o setor continua depois de a loja fechar. */
  depois_min: number;
}

export interface RegrasLoja {
  /** Índice 0 = domingo ... 6 = sábado. */
  horario: HorarioDia[];
  setores: SetorRegra[];
  /** Movimento relativo de cada dia (0 = domingo ... 6 = sábado). */
  pesos_dia: number[];
  /** Usa 5 dias de 8h24 na fase de 42h (liminar do STF). Falso = 8h por dia. */
  jornada_8h24: boolean;
  /** Data a partir da qual a loja adota as 2 folgas antes do prazo legal. */
  antecipar_desde: string | null;
  preferir_folgas_juntas: boolean;
  revezar_turnos: boolean;
  /** Folga no domingo a cada N semanas (3 = comércio; a CCT pode pedir 2). */
  domingo_cada_semanas: number;
  tem_cct: boolean;
  cct_intervalo_min: number | null;
  cct_diaria_max_min: number | null;
  cct_feriado_autorizado: boolean;
  cct_repousos_media_mensal: boolean;
}

export const REGRAS_PADRAO: RegrasLoja = {
  horario: [
    { abre: "08:00", fecha: "20:00" },
    { abre: "07:00", fecha: "22:00" },
    { abre: "07:00", fecha: "22:00" },
    { abre: "07:00", fecha: "22:00" },
    { abre: "07:00", fecha: "22:00" },
    { abre: "07:00", fecha: "22:00" },
    { abre: "07:00", fecha: "22:00" },
  ],
  setores: [],
  pesos_dia: [1, 0.85, 0.85, 0.9, 0.95, 1.15, 1.3],
  jornada_8h24: true,
  antecipar_desde: null,
  preferir_folgas_juntas: true,
  revezar_turnos: false,
  domingo_cada_semanas: LIMITES.domingo_comercio_semanas,
  tem_cct: false,
  cct_intervalo_min: null,
  cct_diaria_max_min: null,
  cct_feriado_autorizado: false,
  cct_repousos_media_mensal: false,
};

export interface Pessoa {
  id: string;
  nome: string;
  setor: string;
  turno: TurnoPreferido;
  /** 0 = domingo ... 6 = sábado; null = sem folga fixa. */
  folga_fixa: number | null;
  /** Horas semanais do contrato; null = limite legal. */
  carga_semanal: number | null;
  nascimento: string | null;
  aprendiz: boolean;
  /** CLT art. 386: folga no domingo a cada duas semanas. */
  domingo_quinzenal: boolean;
  admissao: string | null;
  desligamento: string | null;
}

export interface Ausencia {
  pessoa_id: string;
  tipo: "FER" | "AT" | "AF";
  inicio: string;
  fim: string;
}

export interface Feriado {
  data: string;
  nome: string;
  loja_abre: boolean;
}

export interface DiaEscala {
  pessoa_id: string;
  data: string;
  tipo: TipoDia;
  inicio?: string | null;
  fim?: string | null;
  intervalo_min?: number | null;
  travado?: boolean;
  manual?: boolean;
}

export interface Contexto {
  ano: number;
  /** 1 a 12 */
  mes: number;
  regras: RegrasLoja;
  pessoas: Pessoa[];
  ausencias: Ausencia[];
  /** Feriados do mês e dos 7 dias seguintes, já com a decisão de abrir ou não. */
  feriados: Feriado[];
  /** Dias do mês: para validar, a escala inteira; para gerar, só importam os travados. */
  dias: DiaEscala[];
  /** Dias anteriores ao mês (cerca de 35) para dar continuidade a folgas e domingos. */
  historico: DiaEscala[];
}

export interface Violacao {
  nivel: Nivel;
  regra: RegraId;
  mensagem: string;
  base_legal: string;
  pessoa_id?: string;
  data?: string;
  setor?: string;
}

export interface SemanaPessoa {
  inicio: string;
  minutos: number;
  limite_min: number;
  folgas: number;
}

export interface ResumoPessoa {
  pessoa_id: string;
  minutos: number;
  dias_trabalhados: number;
  folgas: number;
  domingos_trabalhados: number;
  domingos_folga: number;
  minutos_noturnos: number;
  feriados_trabalhados: number;
  semanas: SemanaPessoa[];
}

export type RegraId =
  | "semanal"
  | "repousos"
  | "consecutivos"
  | "domingo"
  | "descanso"
  | "intervalo"
  | "diaria"
  | "menor"
  | "feriado"
  | "ausencia"
  | "definicao"
  | "cobertura";

export const REGRAS: { id: RegraId; titulo: string; base_legal: string; legal: boolean }[] = [
  { id: "semanal", titulo: "Limite de horas na semana", base_legal: BASE.semanal, legal: true },
  { id: "repousos", titulo: "Repousos semanais remunerados", base_legal: BASE.repousos, legal: true },
  { id: "consecutivos", titulo: "No máximo 6 dias seguidos de trabalho", base_legal: BASE.consecutivos, legal: true },
  { id: "domingo", titulo: "Folga coincidindo com o domingo", base_legal: `${BASE.domingo} · ${BASE.domingo_quinzenal}`, legal: true },
  { id: "descanso", titulo: "11h entre jornadas e 35h no repouso", base_legal: BASE.repouso35, legal: true },
  { id: "diaria", titulo: "Jornada diária", base_legal: BASE.diaria, legal: true },
  { id: "intervalo", titulo: "Intervalo para refeição e descanso", base_legal: BASE.intervalo, legal: true },
  { id: "menor", titulo: "Menores de 18 anos e aprendizes", base_legal: `${BASE.menor_noturno} · ${BASE.aprendiz}`, legal: true },
  { id: "feriado", titulo: "Trabalho em feriado", base_legal: BASE.feriado, legal: true },
  { id: "ausencia", titulo: "Férias, atestados e afastamentos", base_legal: `${BASE.ausencia} · ${BASE.ferias}`, legal: true },
  { id: "definicao", titulo: "Todos os dias definidos", base_legal: "Organização da escala", legal: false },
  { id: "cobertura", titulo: "Cobertura mínima dos setores", base_legal: BASE.cobertura, legal: false },
];

export interface ItemChecklist {
  regra: RegraId;
  titulo: string;
  base_legal: string;
  legal: boolean;
  erros: number;
  alertas: number;
}

export interface Validacao {
  violacoes: Violacao[];
  erros: number;
  alertas: number;
  resumo: ResumoPessoa[];
  checklist: ItemChecklist[];
}

export interface Geracao {
  dias: DiaEscala[];
  validacao: Validacao;
  avisos: string[];
  tentativas: number;
}

export interface OpcoesGeracao {
  /** Quantas escalas completas testar antes de escolher (padrão 30). */
  tentativas?: number;
  semente?: number;
}

export interface DiagnosticoSetor {
  setor: string;
  pessoas: number;
  necessarias: number;
  faltam: number;
  turnos_por_dia: number;
  motivo: string;
}

// ============================================================ DATAS E HORAS

const MS_DIA = 86400000;

export function dataNum(d: string): number {
  return Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / MS_DIA);
}
export function numData(n: number): string {
  return new Date(n * MS_DIA).toISOString().slice(0, 10);
}
/** 0 = domingo ... 6 = sábado */
export function diaSemana(n: number): number {
  return (((n + 4) % 7) + 7) % 7;
}
/** Segunda-feira da semana de `n`. */
export function segundaDe(n: number): number {
  return n - ((diaSemana(n) + 6) % 7);
}
export function diasDoMes(ano: number, mes: number): number[] {
  const ini = dataNum(`${ano}-${String(mes).padStart(2, "0")}-01`);
  const fim = Math.round(Date.UTC(ano, mes, 0) / MS_DIA);
  const out: number[] = [];
  for (let n = ini; n <= fim; n++) out.push(n);
  return out;
}
export const NOMES_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const NOMES_DIA_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function hm(h: string | null | undefined): number {
  if (!h) return 0;
  const [a, b] = h.split(":").map(Number);
  return a * 60 + (b || 0);
}
export function fmtHm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
/** 2520 → '42h' · 504 → '8h24' */
export function fmtDur(min: number): string {
  const m = Math.max(0, Math.round(min));
  const r = m % 60;
  return `${Math.floor(m / 60)}h${r ? String(r).padStart(2, "0") : ""}`;
}
export function fmtDataBr(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

function minutosNoturnos(iniAbs: number, fimAbs: number): number {
  // 22:00 → 05:00 de cada dia corrido tocado pelo turno
  let total = 0;
  const diaIni = Math.floor(iniAbs / 1440) - 1;
  const diaFim = Math.floor(fimAbs / 1440);
  for (let d = diaIni; d <= diaFim; d++) {
    const a = d * 1440 + LIMITES.noturno_inicio_min;
    const b = (d + 1) * 1440 + LIMITES.noturno_fim_min;
    total += Math.max(0, Math.min(fimAbs, b) - Math.max(iniAbs, a));
  }
  return total;
}

function idadeEm(nasc: string | null, n: number): number | null {
  if (!nasc) return null;
  const d = numData(n);
  let idade = Number(d.slice(0, 4)) - Number(nasc.slice(0, 4));
  if (d.slice(5) < nasc.slice(5)) idade--;
  return idade;
}

// ============================================================ REGRAS DERIVADAS

interface Base {
  ctx: Contexto;
  regras: RegrasLoja;
  primeiro: number;
  ultimo: number;
  feriados: Map<number, Feriado>;
  setores: Map<string, SetorRegra>;
  ausDe: Map<string, { ini: number; fim: number; tipo: Ausencia["tipo"] }[]>;
}

function montarBase(ctx: Contexto): Base {
  const dias = diasDoMes(ctx.ano, ctx.mes);
  const ausDe = new Map<string, { ini: number; fim: number; tipo: Ausencia["tipo"] }[]>();
  for (const a of ctx.ausencias) {
    if (!ausDe.has(a.pessoa_id)) ausDe.set(a.pessoa_id, []);
    ausDe.get(a.pessoa_id)!.push({ ini: dataNum(a.inicio), fim: dataNum(a.fim), tipo: a.tipo });
  }
  return {
    ctx,
    regras: ctx.regras,
    primeiro: dias[0],
    ultimo: dias[dias.length - 1],
    feriados: new Map(ctx.feriados.map(f => [dataNum(f.data), f])),
    setores: new Map(ctx.regras.setores.map(s => [s.setor, s])),
    ausDe,
  };
}

function ausenciaEm(b: Base, pid: string, n: number): Ausencia["tipo"] | null {
  for (const a of b.ausDe.get(pid) || []) if (n >= a.ini && n <= a.fim) return a.tipo;
  return null;
}

function ativoEm(p: Pessoa, n: number): boolean {
  if (p.admissao && dataNum(p.admissao) > n) return false;
  if (p.desligamento && dataNum(p.desligamento) < n) return false;
  return true;
}

function faseDaSemana(b: Base, segunda: number): FaseLegal {
  return faseEm(numData(segunda + 6), b.regras.antecipar_desde);
}

function feriadoAutorizado(b: Base): boolean {
  return b.regras.tem_cct && b.regras.cct_feriado_autorizado;
}

/** A loja funciona neste dia? Feriado só conta como aberto com autorização em CCT. */
function lojaAberta(b: Base, n: number): boolean {
  const h = b.regras.horario[diaSemana(n)];
  if (!h?.abre || !h?.fecha) return false;
  const f = b.feriados.get(n);
  if (f) return f.loja_abre && feriadoAutorizado(b);
  return true;
}

/** Janela de funcionamento do setor no dia, em minutos do dia. */
function janelaSetor(b: Base, n: number, setor: string): [number, number] | null {
  const h = b.regras.horario[diaSemana(n)];
  if (!h?.abre || !h?.fecha) return null;
  const s = b.setores.get(setor);
  let fim = hm(h.fecha);
  const ini = hm(h.abre);
  if (fim <= ini) fim += 1440;
  return [Math.max(0, ini - (s?.antes_min || 0)), fim + (s?.depois_min || 0)];
}

interface Teto {
  min: number;
  base: string;
  regra: RegraId;
}

function tetoDiario(b: Base, p: Pessoa, fase: FaseLegal): Teto {
  if (p.aprendiz) return { min: LIMITES.aprendiz_diaria_min, base: BASE.aprendiz, regra: "menor" };
  if (b.regras.tem_cct && b.regras.cct_diaria_max_min)
    return { min: Math.min(b.regras.cct_diaria_max_min, LIMITES.diaria_max_cct_min), base: `${BASE.diaria} (compensação em norma coletiva)`, regra: "diaria" };
  if (fase.diaria_liminar_min && b.regras.jornada_8h24) return { min: fase.diaria_liminar_min, base: BASE.diaria_liminar, regra: "diaria" };
  return { min: fase.diaria_min, base: BASE.diaria, regra: "diaria" };
}

function limiteSemanal(p: Pessoa, fase: FaseLegal): number {
  return Math.round(Math.min(p.carga_semanal || fase.horas_semanais, fase.horas_semanais) * 60);
}

function intervaloMinimo(b: Base, liquido: number): number {
  if (liquido > 360) return b.regras.tem_cct && b.regras.cct_intervalo_min ? Math.max(LIMITES.intervalo_longo_cct_min, b.regras.cct_intervalo_min) : LIMITES.intervalo_longo_min;
  if (liquido > 240) return LIMITES.intervalo_curto_min;
  return 0;
}

function domingoCada(b: Base, p: Pessoa): number {
  const loja = Math.max(2, b.regras.domingo_cada_semanas || LIMITES.domingo_comercio_semanas);
  return p.domingo_quinzenal ? Math.min(loja, LIMITES.domingo_quinzenal_semanas) : loja;
}

/** Repousos exigidos numa semana com `disponiveis` dias fora de férias, atestado ou feriado. */
function repousosExigidos(fase: FaseLegal, disponiveis: number): number {
  const r = fase.repousos_semanais;
  const diasTrabalho = 7 - r;
  return Math.min(r, Math.max(0, disponiveis - (diasTrabalho - r)));
}

interface TurnoDia {
  iniAbs: number;
  fimAbs: number;
  intervalo: number;
  liquido: number;
  noturno: number;
}

function turnoDe(d: DiaEscala, n: number): TurnoDia | null {
  if (d.tipo !== "T" || !d.inicio || !d.fim) return null;
  const ini = hm(d.inicio);
  let fim = hm(d.fim);
  if (fim <= ini) fim += 1440;
  const intervalo = d.intervalo_min || 0;
  const iniAbs = n * 1440 + ini;
  const fimAbs = n * 1440 + fim;
  return { iniAbs, fimAbs, intervalo, liquido: Math.max(0, fim - ini - intervalo), noturno: minutosNoturnos(iniAbs, fimAbs) };
}

function mapaDias(...listas: DiaEscala[][]): Map<string, Map<number, DiaEscala>> {
  const mapa = new Map<string, Map<number, DiaEscala>>();
  for (const lista of listas)
    for (const d of lista) {
      if (!mapa.has(d.pessoa_id)) mapa.set(d.pessoa_id, new Map());
      mapa.get(d.pessoa_id)!.set(dataNum(d.data), d);
    }
  return mapa;
}

// ============================================================ VALIDADOR

export function validar(ctx: Contexto): Validacao {
  const b = montarBase(ctx);
  const { primeiro, ultimo } = b;
  const mapa = mapaDias(ctx.historico, ctx.dias);
  const violacoes: Violacao[] = [];
  const resumo: ResumoPessoa[] = [];
  const add = (v: Violacao) => violacoes.push(v);

  for (const p of ctx.pessoas) {
    const dias = mapa.get(p.id) || new Map<number, DiaEscala>();
    const r: ResumoPessoa = { pessoa_id: p.id, minutos: 0, dias_trabalhados: 0, folgas: 0, domingos_trabalhados: 0, domingos_folga: 0, minutos_noturnos: 0, feriados_trabalhados: 0, semanas: [] };
    let algumDiaAtivo = false;

    // ---------- dia a dia
    for (let n = primeiro; n <= ultimo; n++) {
      if (!ativoEm(p, n)) continue;
      algumDiaAtivo = true;
      const data = numData(n);
      const d = dias.get(n);
      const aus = ausenciaEm(b, p.id, n);
      const domingo = diaSemana(n) === 0;
      if (!d) {
        if (!aus) add({ nivel: "alerta", regra: "definicao", mensagem: `${p.nome} está sem definição em ${fmtDataBr(data)}.`, base_legal: "Organização da escala", pessoa_id: p.id, data });
        if (domingo) r.domingos_folga++;
        continue;
      }
      if (d.tipo === "F") r.folgas++;
      if (d.tipo !== "T") {
        if (domingo) r.domingos_folga++;
        continue;
      }
      r.dias_trabalhados++;
      if (domingo) r.domingos_trabalhados++;
      if (aus) add({ nivel: "erro", regra: "ausencia", mensagem: `${p.nome} está escalado em ${fmtDataBr(data)}, dia de ${aus === "FER" ? "férias" : aus === "AT" ? "atestado" : "afastamento"}.`, base_legal: BASE.ausencia, pessoa_id: p.id, data });
      const fer = b.feriados.get(n);
      if (fer) {
        r.feriados_trabalhados++;
        if (!feriadoAutorizado(b)) add({ nivel: "erro", regra: "feriado", mensagem: `${p.nome} está escalado no feriado de ${fer.nome} (${fmtDataBr(data)}) e a loja não informou convenção coletiva que autorize o trabalho.`, base_legal: BASE.feriado, pessoa_id: p.id, data });
        else add({ nivel: "info", regra: "feriado", mensagem: `${p.nome} trabalha no feriado de ${fer.nome} (${fmtDataBr(data)}): pagamento em dobro ou folga compensatória, conforme a convenção.`, base_legal: BASE.feriado, pessoa_id: p.id, data });
      } else if (!janelaSetor(b, n, p.setor)) {
        add({ nivel: "alerta", regra: "definicao", mensagem: `${p.nome} está escalado em ${fmtDataBr(data)}, dia em que a loja não abre.`, base_legal: "Organização da escala", pessoa_id: p.id, data });
      }
      const t = turnoDe(d, n);
      if (!t) {
        add({ nivel: "erro", regra: "definicao", mensagem: `${p.nome} trabalha em ${fmtDataBr(data)} sem horário de entrada e saída.`, base_legal: "Organização da escala", pessoa_id: p.id, data });
        continue;
      }
      r.minutos += t.liquido;
      r.minutos_noturnos += t.noturno;
      const fase = faseDaSemana(b, segundaDe(n));
      const teto = tetoDiario(b, p, fase);
      if (t.liquido > teto.min)
        add({ nivel: "erro", regra: teto.regra, mensagem: `${p.nome} tem ${fmtDur(t.liquido)} de jornada em ${fmtDataBr(data)}; o máximo é ${fmtDur(teto.min)}${p.aprendiz ? " para aprendiz" : ""}.`, base_legal: teto.base, pessoa_id: p.id, data });
      const minInt = intervaloMinimo(b, t.liquido);
      if (t.intervalo < minInt)
        add({ nivel: "erro", regra: "intervalo", mensagem: `${p.nome} tem intervalo de ${t.intervalo} min em ${fmtDataBr(data)}; a jornada de ${fmtDur(t.liquido)} exige pelo menos ${minInt} min.`, base_legal: BASE.intervalo, pessoa_id: p.id, data });
      else if (t.intervalo > LIMITES.intervalo_max_min && !b.regras.tem_cct)
        add({ nivel: "alerta", regra: "intervalo", mensagem: `${p.nome} tem intervalo de ${fmtDur(t.intervalo)} em ${fmtDataBr(data)}; acima de 2h só com acordo escrito ou norma coletiva.`, base_legal: BASE.intervalo, pessoa_id: p.id, data });
      const idade = idadeEm(p.nascimento, n);
      if (idade !== null && idade < 18 && t.noturno > 0)
        add({ nivel: "erro", regra: "menor", mensagem: `${p.nome} tem menos de 18 anos e está com ${fmtDur(t.noturno)} entre 22h e 5h em ${fmtDataBr(data)}.`, base_legal: BASE.menor_noturno, pessoa_id: p.id, data });
    }

    // ---------- semana a semana
    let repousosMes = 0;
    let disponiveisMes = 0;
    for (let seg = segundaDe(primeiro); seg <= ultimo; seg += 7) {
      const fase = faseDaSemana(b, seg);
      let min = 0, folgas = 0, fora = 0, indefinidos = 0;
      for (let n = seg; n < seg + 7; n++) {
        const d = dias.get(n);
        const aus = ausenciaEm(b, p.id, n);
        const noMes = n >= primeiro && n <= ultimo;
        if (!ativoEm(p, n)) { fora++; continue; }
        if (!d) {
          if (aus) fora++; else indefinidos++;
          continue;
        }
        if (d.tipo === "T") min += turnoDe(d, n)?.liquido || 0;
        else if (d.tipo === "F") { folgas++; if (noMes) repousosMes++; }
        else fora++;
        if (noMes && (d.tipo === "T" || d.tipo === "F")) disponiveisMes++;
      }
      const disponiveis = 7 - fora;
      if (disponiveis <= 0) continue;
      const limite = limiteSemanal(p, fase);
      const fimSemana = Math.min(seg + 6, ultimo);
      const rotulo = `semana de ${fmtDataBr(numData(seg))} a ${fmtDataBr(numData(seg + 6))}`;
      r.semanas.push({ inicio: numData(seg), minutos: min, limite_min: limite, folgas });
      if (min > limite)
        add({ nivel: "erro", regra: "semanal", mensagem: `${p.nome} soma ${fmtDur(min)} na ${rotulo}; o limite é ${fmtDur(limite)} (${fmtDur(min - limite)} de hora extra não planejada).`, base_legal: BASE.semanal, pessoa_id: p.id, data: numData(fimSemana) });
      const exigidos = repousosExigidos(fase, disponiveis);
      // dias ainda não definidos (fora do mês) podem virar folga: só é erro o que já não fecha
      if (folgas + indefinidos < exigidos && !(b.regras.tem_cct && b.regras.cct_repousos_media_mensal))
        add({ nivel: "erro", regra: "repousos", mensagem: `${p.nome} tem ${folgas} folga(s) na ${rotulo}; são exigidas ${exigidos}.`, base_legal: BASE.repousos, pessoa_id: p.id, data: numData(fimSemana) });
    }
    if (b.regras.tem_cct && b.regras.cct_repousos_media_mensal && faseDaSemana(b, segundaDe(ultimo)).repousos_semanais >= 2) {
      const exigidosMes = Math.ceil((disponiveisMes * 2) / 7);
      if (repousosMes < exigidosMes)
        add({ nivel: "erro", regra: "repousos", mensagem: `${p.nome} tem ${repousosMes} folgas no mês; a média de 2 por semana exige ${exigidosMes}.`, base_legal: BASE.repousos_mes, pessoa_id: p.id, data: numData(ultimo) });
    }

    // ---------- sequência, descanso entre jornadas e domingos
    let seguidos = 0;
    let anterior: { n: number; fimAbs: number } | null = null;
    let soDescanso = true;
    for (let n = primeiro - 40; n <= ultimo; n++) {
      const d = dias.get(n);
      if (!d || d.tipo !== "T") {
        seguidos = 0;
        if (!d || (d.tipo !== "F" && d.tipo !== "FR")) soDescanso = false;
        continue;
      }
      seguidos++;
      const data = numData(n);
      if (n >= primeiro && seguidos > LIMITES.max_dias_seguidos && (seguidos === LIMITES.max_dias_seguidos + 1 || n === primeiro))
        add({ nivel: "erro", regra: "consecutivos", mensagem: `${p.nome} chega ao ${seguidos}º dia seguido de trabalho em ${fmtDataBr(data)}; o máximo é ${LIMITES.max_dias_seguidos}.`, base_legal: BASE.consecutivos, pessoa_id: p.id, data });
      const t = turnoDe(d, n);
      if (t && anterior && n >= primeiro) {
        const vao = t.iniAbs - anterior.fimAbs;
        if (n - anterior.n === 1) {
          if (vao < LIMITES.interjornada_min)
            add({ nivel: "erro", regra: "descanso", mensagem: `${p.nome} tem só ${fmtDur(vao)} entre a saída de ${fmtDataBr(numData(anterior.n))} e a entrada de ${fmtDataBr(data)}; o mínimo é 11h.`, base_legal: BASE.interjornada, pessoa_id: p.id, data });
        } else if (soDescanso && vao < LIMITES.repouso_mais_interjornada_min) {
          add({ nivel: "erro", regra: "descanso", mensagem: `${p.nome} tem só ${fmtDur(vao)} entre a saída de ${fmtDataBr(numData(anterior.n))} e a volta em ${fmtDataBr(data)}; com a folga no meio o mínimo é 35h.`, base_legal: BASE.repouso35, pessoa_id: p.id, data });
        }
      }
      if (t) { anterior = { n, fimAbs: t.fimAbs }; soDescanso = true; } else { anterior = null; }
    }
    const cada = domingoCada(b, p);
    for (let n = primeiro; n <= ultimo; n++) {
      if (diaSemana(n) !== 0 || dias.get(n)?.tipo !== "T") continue;
      let todos = true;
      for (let k = 1; k < cada; k++) if (dias.get(n - 7 * k)?.tipo !== "T") todos = false;
      if (todos)
        add({ nivel: "erro", regra: "domingo", mensagem: `${p.nome} trabalha ${cada} domingos seguidos até ${fmtDataBr(numData(n))}; precisa folgar ao menos 1 domingo a cada ${cada} semanas.`, base_legal: p.domingo_quinzenal ? BASE.domingo_quinzenal : BASE.domingo, pessoa_id: p.id, data: numData(n) });
    }

    // ---------- início de férias (CLT art. 134 §3º)
    for (const a of b.ausDe.get(p.id) || []) {
      if (a.tipo !== "FER" || a.ini < primeiro || a.ini > ultimo) continue;
      for (const k of [1, 2]) {
        const fer = b.feriados.get(a.ini + k);
        if (fer) add({ nivel: "alerta", regra: "ausencia", mensagem: `As férias de ${p.nome} começam em ${fmtDataBr(numData(a.ini))}, ${k === 1 ? "um dia" : "dois dias"} antes do feriado de ${fer.nome}; o início nesse período é vedado.`, base_legal: BASE.ferias, pessoa_id: p.id, data: numData(a.ini) });
      }
    }
    if (algumDiaAtivo) resumo.push(r);
  }

  // ---------- cobertura mínima por setor (operacional)
  for (const s of ctx.regras.setores) {
    if (!s.minimo) continue;
    const equipe = ctx.pessoas.filter(p => p.setor === s.setor);
    if (!equipe.length) continue;
    for (let n = primeiro; n <= ultimo; n++) {
      if (!lojaAberta(b, n)) continue;
      const janela = janelaSetor(b, n, s.setor);
      if (!janela) continue;
      const turnos: TurnoDia[] = [];
      for (const p of equipe) {
        const d = mapa.get(p.id)?.get(n);
        const t = d ? turnoDe(d, n) : null;
        if (t) turnos.push(t);
      }
      const faixas: [number, number][] = [];
      for (let m = janela[0]; m + 30 <= janela[1]; m += 30) {
        const abs = n * 1440 + m;
        const presentes = turnos.filter(t => t.iniAbs <= abs && t.fimAbs >= abs + 30).length;
        if (presentes >= s.minimo) continue;
        const ult = faixas[faixas.length - 1];
        if (ult && ult[1] === m) ult[1] = m + 30; else faixas.push([m, m + 30]);
      }
      if (faixas.length)
        add({ nivel: "alerta", regra: "cobertura", mensagem: `${s.setor} fica abaixo de ${s.minimo} pessoa(s) em ${fmtDataBr(numData(n))} (${NOMES_DIA[diaSemana(n)]}): ${faixas.map(f => `${fmtHm(f[0])}–${fmtHm(f[1])}`).join(", ")}.`, base_legal: BASE.cobertura, setor: s.setor, data: numData(n) });
    }
  }

  const checklist: ItemChecklist[] = REGRAS.map(x => ({
    regra: x.id, titulo: x.titulo, base_legal: x.base_legal, legal: x.legal,
    erros: violacoes.filter(v => v.regra === x.id && v.nivel === "erro").length,
    alertas: violacoes.filter(v => v.regra === x.id && v.nivel === "alerta").length,
  }));
  return {
    violacoes,
    erros: violacoes.filter(v => v.nivel === "erro").length,
    alertas: violacoes.filter(v => v.nivel === "alerta").length,
    resumo,
    checklist,
  };
}

// ============================================================ GERADOR

function aleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function combinacoes(itens: number[], k: number): number[][] {
  if (k <= 0) return [[]];
  if (k >= itens.length) return [itens.slice()];
  const out: number[][] = [];
  const atual: number[] = [];
  const passo = (i: number) => {
    if (atual.length === k) { out.push(atual.slice()); return; }
    for (let j = i; j < itens.length; j++) { atual.push(itens[j]); passo(j + 1); atual.pop(); }
  };
  passo(0);
  return out;
}

/** Jornada do dia para a pessoa na fase: limite semanal dividido pelos dias de trabalho, sem passar do teto. */
function jornadaDoDia(b: Base, p: Pessoa, fase: FaseLegal): number {
  const diasTrabalho = 7 - fase.repousos_semanais;
  return Math.min(Math.floor(limiteSemanal(p, fase) / diasTrabalho), tetoDiario(b, p, fase).min);
}

/** Maior jornada (já com o intervalo exigido) que cabe em `espaco` minutos. */
function ajustarAoEspaco(b: Base, jornada: number, espaco: number): { liquido: number; intervalo: number } {
  const cheio = intervaloMinimo(b, jornada);
  if (jornada + cheio <= espaco) return { liquido: jornada, intervalo: cheio };
  const longo = intervaloMinimo(b, 361);
  const candidatos = [
    Math.min(jornada, espaco - longo),
    Math.min(jornada, 360, espaco - LIMITES.intervalo_curto_min),
    Math.min(jornada, 240, espaco),
  ];
  let melhor = 0;
  for (const c of candidatos) if (c > melhor && c + intervaloMinimo(b, c) <= espaco) melhor = c;
  return { liquido: melhor, intervalo: melhor ? intervaloMinimo(b, melhor) : 0 };
}

/** Turnos que precisam de gente própria num dia que pede `k` turnos: todos, só abrir e fechar, ou nenhum. */
function turnosObrigatorios(posicoes: number[], k: number): number[] {
  if (posicoes.length <= 1 || k <= 1) return [];
  if (k >= posicoes.length) return posicoes;
  const out = [posicoes[0], posicoes[posicoes.length - 1]];
  for (let i = 1; out.length < k && i < posicoes.length - 1; i++) out.push(posicoes[i]);
  return out;
}

/** Quantos turnos escalonados cobrem a janela do setor no dia. */
function turnosParaCobrir(b: Base, n: number, setor: string, vao: number): number {
  const j = janelaSetor(b, n, setor);
  if (!j) return 0;
  return Math.max(1, Math.ceil((j[1] - j[0] - 15) / vao));
}

type Classe = "X" | "A" | "H" | "C" | "L" | "livre";

interface Estado {
  p: Pessoa;
  /** posição do turno entre abrir (0) e fechar (1) */
  pos: number;
  posBase: number;
  automatico: boolean;
  seguidos: number;
  domingos: boolean[];
  anterior: { n: number; fimAbs: number } | null;
  soDescanso: boolean;
  folgasDomingo: number;
  folgasSabado: number;
  /** folgas seguidas até o dia anterior (evita esticar demais o descanso de uns e faltar para outros) */
  folgados: number;
}

interface PlanoSemana {
  e: Estado;
  classes: Classe[];
  fixos: (DiaEscala | null)[];
  ausencias: (Ausencia["tipo"] | null)[];
  livres: number[];
  opcoes: number[][];
  escolha: number[];
  /** quantas folgas a semana exige; opções maiores são folga extra */
  base: number;
}

interface TurnoMontado {
  inicio: string;
  fim: string;
  intervalo: number;
  fimAbs: number;
  empurrado: boolean;
}

function janelaDaPessoa(b: Base, p: Pessoa, n: number): [number, number] {
  let [ws, we] = janelaSetor(b, n, p.setor) || [8 * 60, 18 * 60];
  const idade = idadeEm(p.nascimento, n);
  if (idade !== null && idade < 18) {
    // menor não trabalha entre 22h e 5h
    ws = Math.max(ws, LIMITES.noturno_fim_min);
    we = Math.min(we, LIMITES.noturno_inicio_min);
  }
  return [ws, we];
}

function montarTurno(b: Base, e: Estado, n: number, pos: number, jornada: number, ignorarAnterior = false): TurnoMontado {
  const [ws, we] = janelaDaPessoa(b, e.p, n);
  let { liquido, intervalo } = ajustarAoEspaco(b, jornada, we - ws);
  const ultimoInicio = we - (liquido + intervalo);
  let ini = pos >= 1 ? ultimoInicio : ws + Math.round((pos * (ultimoInicio - ws)) / 5) * 5;
  ini = Math.max(ws, Math.min(ini, ultimoInicio));
  let empurrado = false;
  if (e.anterior && !ignorarAnterior) {
    const exigido = e.anterior.fimAbs + (n - e.anterior.n === 1 || !e.soDescanso ? LIMITES.interjornada_min : LIMITES.repouso_mais_interjornada_min);
    const minimo = Math.ceil((exigido - n * 1440) / 5) * 5;
    if (ini < minimo) {
      empurrado = true;
      ini = minimo;
      if (ini + liquido + intervalo > we) ({ liquido, intervalo } = ajustarAoEspaco(b, jornada, Math.max(0, we - ini)));
    }
  }
  const fim = ini + liquido + intervalo;
  return { inicio: fmtHm(ini), fim: fmtHm(fim), intervalo, fimAbs: n * 1440 + fim, empurrado };
}

function gerarUma(b: Base, rng: () => number, avisos: Set<string>): DiaEscala[] {
  const { ctx, primeiro, ultimo } = b;
  const hist = mapaDias(ctx.historico);
  const travados = mapaDias(ctx.dias.filter(d => d.travado));
  const plano = new Map<string, Map<number, DiaEscala>>();
  const faseMes = faseDaSemana(b, segundaDe(ultimo));
  const refDe = (setor: string): Pessoa => ({ id: "", nome: "", setor, turno: "auto", folga_fixa: null, carga_semanal: null, nascimento: null, aprendiz: false, domingo_quinzenal: false, admissao: null, desligamento: null });

  // ---------- turno de origem de cada pessoa (abertura, intermediário, fechamento)
  const estados: Estado[] = [];
  const porSetor = new Map<string, Pessoa[]>();
  for (const p of ctx.pessoas) {
    if (!porSetor.has(p.setor)) porSetor.set(p.setor, []);
    porSetor.get(p.setor)!.push(p);
  }
  const posicoesDe = new Map<string, number[]>();
  for (const [setor, equipe] of porSetor) {
    // mês de transição: usa a jornada mais curta do mês para não faltar turno em nenhuma semana
    let vao = Infinity;
    for (const f of [faseDaSemana(b, segundaDe(primeiro)), faseMes]) {
      const jornada = jornadaDoDia(b, refDe(setor), f);
      vao = Math.min(vao, jornada + intervaloMinimo(b, jornada));
    }
    const contagem = new Map<number, number>();
    for (let dsem = 0; dsem < 7; dsem++) {
      const n = primeiro + ((dsem - diaSemana(primeiro) + 7) % 7);
      const k = turnosParaCobrir(b, n, setor, vao);
      if (k) contagem.set(k, (contagem.get(k) || 0) + 1);
    }
    let k = 1, melhor = 0;
    for (const [qtd, vezes] of contagem) if (vezes > melhor || (vezes === melhor && qtd > k)) { k = qtd; melhor = vezes; }
    const posicoes = k === 1 ? [0] : Array.from({ length: k }, (_, i) => i / (k - 1));
    posicoesDe.set(setor, posicoes);
    const tamanho = new Map<number, number>(posicoes.map(x => [x, 0]));
    const ordenados = equipe.slice().sort((x, y) => x.nome.localeCompare(y.nome) || x.id.localeCompare(y.id));
    const fixar = (p: Pessoa, pos: number, automatico: boolean) => {
      tamanho.set(pos, (tamanho.get(pos) || 0) + 1);
      estados.push({ p, pos, posBase: pos, automatico, seguidos: 0, domingos: [], anterior: null, soDescanso: true, folgasDomingo: 0, folgasSabado: 0, folgados: 0 });
    };
    for (const p of ordenados) {
      if (p.turno === "abertura") fixar(p, 0, false);
      else if (p.turno === "fechamento") fixar(p, posicoes[posicoes.length - 1], false);
      else if (p.turno === "intermediario") fixar(p, posicoes.length === 1 ? 0 : 0.5, false);
    }
    const fechaTarde = (() => {
      const j = janelaSetor(b, primeiro + ((6 - diaSemana(primeiro) + 7) % 7), setor);
      return !!j && j[1] > LIMITES.noturno_inicio_min;
    })();
    for (const p of ordenados) {
      if (p.turno !== "auto") continue;
      const idade = idadeEm(p.nascimento, ultimo);
      const menor = idade !== null && idade < 18;
      let escolhida = posicoes[0];
      for (const x of posicoes) {
        if (menor && fechaTarde && x === posicoes[posicoes.length - 1] && posicoes.length > 1) continue;
        if ((tamanho.get(x) || 0) < (tamanho.get(escolhida) || 0)) escolhida = x;
      }
      fixar(p, escolhida, !menor && !p.aprendiz);
    }
  }

  // ---------- memória anterior ao mês (sequência, domingos, último turno)
  const inicio = segundaDe(primeiro);
  for (const e of estados) {
    const h = hist.get(e.p.id) || new Map<number, DiaEscala>();
    for (let n = inicio - 1; n >= inicio - 12; n--) {
      if (h.get(n)?.tipo === "T") e.seguidos++; else break;
    }
    const cada = domingoCada(b, e.p);
    for (let k = cada - 1; k >= 1; k--) e.domingos.push(h.get(inicio - 1 - 7 * (k - 1))?.tipo === "T");
    for (let n = inicio - 1; n >= inicio - 12; n--) {
      const d = h.get(n);
      const t = d ? turnoDe(d, n) : null;
      if (t) { e.anterior = { n, fimAbs: t.fimAbs }; break; }
      if (!d || (d.tipo !== "F" && d.tipo !== "FR")) e.soDescanso = false;
    }
    plano.set(e.p.id, new Map());
  }

  const fixoEm = (pid: string, n: number): DiaEscala | null => {
    if (n < primeiro) return hist.get(pid)?.get(n) || null;
    if (n > ultimo) return null;
    return travados.get(pid)?.get(n) || null;
  };

  // ---------- semana a semana
  let indiceSemana = 0;
  for (let seg = inicio; seg <= ultimo; seg += 7, indiceSemana++) {
    const fase = faseDaSemana(b, seg);
    const diasTrabalho = 7 - fase.repousos_semanais;

    for (let n = Math.max(seg, primeiro); n < seg + 7 && n <= ultimo; n++) {
      const f = b.feriados.get(n);
      if (f && f.loja_abre && !feriadoAutorizado(b))
        avisos.add(`Feriado de ${f.nome} (${fmtDataBr(f.data)}): a loja foi considerada fechada porque não há convenção coletiva autorizando o trabalho (Lei 10.101/2000, art. 6º-A).`);
    }

    if (b.regras.revezar_turnos) {
      for (const e of estados) {
        if (!e.automatico) continue;
        const posicoes = posicoesDe.get(e.p.setor) || [0];
        e.pos = posicoes[(Math.max(0, posicoes.indexOf(e.posBase)) + indiceSemana) % posicoes.length];
      }
    }

    // ---------- o que já está decidido e quantas folgas faltam para cada pessoa
    const planos: PlanoSemana[] = [];
    for (const e of estados) {
      const classes: Classe[] = [];
      const fixos: (DiaEscala | null)[] = [];
      const ausencias: (Ausencia["tipo"] | null)[] = [];
      for (let i = 0; i < 7; i++) {
        const n = seg + i;
        const fixo = fixoEm(e.p.id, n);
        const aus = ausenciaEm(b, e.p.id, n);
        fixos.push(fixo);
        ausencias.push(aus);
        const h = b.regras.horario[diaSemana(n)];
        if (!ativoEm(e.p, n)) classes.push("X");
        else if (fixo) classes.push("L");
        else if (aus) classes.push("A");
        else if (!(h?.abre && h?.fecha)) classes.push("C");
        else if (b.feriados.has(n) && !lojaAberta(b, n)) classes.push("H");
        else classes.push("livre");
      }
      let fora = 0, folgasJa = 0, trabalhoJa = 0;
      const livres: number[] = [];
      classes.forEach((c, i) => {
        const t = fixos[i]?.tipo;
        if (c === "X" || c === "A" || c === "H") fora++;
        else if (c === "C") folgasJa++;
        else if (c === "L") { if (t === "T") trabalhoJa++; else if (t === "F") folgasJa++; else fora++; }
        else livres.push(i);
      });
      const exigidos = repousosExigidos(fase, 7 - fora);
      let colocar = Math.max(exigidos - folgasJa, livres.length - (diasTrabalho - trabalhoJa));
      colocar = Math.max(0, Math.min(livres.length, colocar));
      planos.push({ e, classes, fixos, ausencias, livres, opcoes: combinacoes(livres, colocar), escolha: [], base: colocar });
    }
    const trabalhaEm = (pl: PlanoSemana, i: number, escolha = pl.escolha) =>
      pl.classes[i] === "livre" ? !escolha.includes(i) : pl.classes[i] === "L" && pl.fixos[i]?.tipo === "T";

    // ---------- escolha das folgas, setor por setor
    const equipes = new Map<string, PlanoSemana[]>();
    for (const pl of planos) {
      if (!equipes.has(pl.e.p.setor)) equipes.set(pl.e.p.setor, []);
      equipes.get(pl.e.p.setor)!.push(pl);
    }
    const turnosDoDia = new Map<string, number[]>();
    for (const [setor, equipe] of equipes) {
      const posicoes = posicoesDe.get(setor) || [0];
      const minimo = b.setores.get(setor)?.minimo ?? 1;
      const jornada = jornadaDoDia(b, refDe(setor), fase);
      const vao = jornada + intervaloMinimo(b, jornada);
      const aberto: boolean[] = [], peso: number[] = [], potencial: number[] = [], k: number[] = [];
      for (let i = 0; i < 7; i++) {
        aberto.push(lojaAberta(b, seg + i));
        peso.push(aberto[i] ? Math.max(0.1, b.regras.pesos_dia[diaSemana(seg + i)] || 1) : 0);
        potencial.push(equipe.filter(pl => pl.classes[i] === "livre" || (pl.classes[i] === "L" && pl.fixos[i]?.tipo === "T")).length);
        k.push(aberto[i] ? Math.min(posicoes.length, turnosParaCobrir(b, seg + i, setor, vao)) : 0);
      }
      turnosDoDia.set(setor, k);
      let vagas = 0;
      for (const pl of equipe) vagas += pl.livres.length - pl.base + pl.fixos.filter(f => f?.tipo === "T").length;
      const somaPeso = peso.reduce((s, x) => s + x, 0) || 1;
      const alvo = peso.map((x, i) => Math.min(potencial[i], (vagas * x) / somaPeso));
      const necessidade = potencial.map((x, i) => Math.min(k[i] * minimo, x));
      // contagens mantidas a cada troca, para não recontar a equipe inteira a cada opção
      const total = new Array<number>(7).fill(0);
      const porPos = new Map<number, number[]>();
      let livresNoProximo = 0;
      const aplicar = (pl: PlanoSemana, sinal: number) => {
        if (!porPos.has(pl.e.pos)) porPos.set(pl.e.pos, new Array<number>(7).fill(0));
        const linha = porPos.get(pl.e.pos)!;
        for (let i = 0; i < 7; i++) if (trabalhaEm(pl, i)) { total[i] += sinal; linha[i] += sinal; }
        if (pl.classes[6] !== "X") {
          const cadeia = [...pl.e.domingos.slice(1), trabalhaEm(pl, 6)];
          if (!(cadeia.length && cadeia.every(Boolean))) livresNoProximo += sinal;
        }
      };
      const obrigatoriosDe = k.map(x => turnosObrigatorios(posicoes, x));
      const custoEquipe = () => {
        let c = 0;
        for (let i = 0; i < 7; i++) {
          if (!aberto[i]) continue;
          c += Math.max(0, necessidade[i] - total[i]) * 20000;
          c += (total[i] - alvo[i]) ** 2 * 12;
          // turno sem gente própria: alguém terá de cobrir fora do seu horário
          for (const x of obrigatoriosDe[i]) c += Math.max(0, Math.min(minimo, potencial[i]) - (porPos.get(x)?.[i] || 0)) * 600;
        }
        // não gastar hoje quem vai fazer falta no domingo que vem
        if (aberto[6]) c += Math.max(0, Math.min(k[6] * minimo, equipe.length) - livresNoProximo) * 8000;
        return c;
      };
      const mediaDom = equipe.reduce((s, pl) => s + pl.e.folgasDomingo, 0) / equipe.length;
      const mediaSab = equipe.reduce((s, pl) => s + pl.e.folgasSabado, 0) / equipe.length;
      const custoPessoa = (pl: PlanoSemana, escolha: number[]): number => {
        let c = 0;
        let seguidos = pl.e.seguidos;
        for (let i = 0; i < 7; i++) {
          if (trabalhaEm(pl, i, escolha)) { seguidos++; if (seguidos > LIMITES.max_dias_seguidos) c += 1e6; } else seguidos = 0;
        }
        if (seguidos >= LIMITES.max_dias_seguidos) c += 300; // deixa saída para a semana seguinte
        if (pl.classes[6] === "livre" && !escolha.includes(6) && pl.e.domingos.length && pl.e.domingos.every(Boolean)) c += 1e6;
        if (pl.e.p.folga_fixa !== null && pl.e.p.folga_fixa !== undefined) {
          const i = (pl.e.p.folga_fixa + 6) % 7;
          if (pl.classes[i] === "livre" && !escolha.includes(i)) c += 5000;
        }
        if (b.regras.preferir_folgas_juntas && escolha.length >= 1) {
          const descansa = (i: number) => escolha.includes(i) || pl.classes[i] === "C" || (pl.classes[i] === "L" && pl.fixos[i]?.tipo === "F");
          let juntas = false;
          for (let i = 0; i < 6; i++) if (descansa(i) && descansa(i + 1)) juntas = true;
          if (!juntas && [0, 1, 2, 3, 4, 5, 6].filter(descansa).length >= 2) c += 40;
        }
        if (escolha.length > pl.base) c += 2500;
        let folgados = pl.e.folgados;
        for (let i = 0; i < 7; i++) {
          const folga = escolha.includes(i) || pl.classes[i] === "C" || (pl.classes[i] === "L" && pl.fixos[i]?.tipo === "F");
          if (folga) { folgados++; if (folgados > 2 && escolha.includes(i)) c += 80; } else folgados = 0;
        }
        if (escolha.includes(6)) c += 8 * (pl.e.folgasDomingo - mediaDom);
        if (escolha.includes(5)) c += 4 * (pl.e.folgasSabado - mediaSab);
        return c;
      };

      // partida aleatória + melhoria pessoa a pessoa até estabilizar
      for (const pl of equipe) {
        // folga extra só entra como opção para quem não tem saída dentro da regra
        if (pl.livres.length > pl.base && pl.opcoes.every(op => custoPessoa(pl, op) >= 1e6)) pl.opcoes.push(...combinacoes(pl.livres, pl.base + 1));
        pl.escolha = pl.opcoes[Math.floor(rng() * pl.opcoes.length)] || [];
        aplicar(pl, 1);
      }
      for (let passada = 0; passada < 12; passada++) {
        let mudou = false;
        const ordem = equipe.map(pl => ({ pl, r: rng() })).sort((x, y) => x.r - y.r).map(x => x.pl);
        for (const pl of ordem) {
          if (pl.opcoes.length <= 1) continue;
          const atual = pl.escolha;
          aplicar(pl, -1);
          let melhor = atual, melhorCusto = Infinity;
          for (const op of pl.opcoes) {
            pl.escolha = op;
            aplicar(pl, 1);
            const c = custoEquipe() + custoPessoa(pl, op) + rng() * 0.5;
            aplicar(pl, -1);
            if (c < melhorCusto) { melhorCusto = c; melhor = op; }
          }
          pl.escolha = melhor;
          aplicar(pl, 1);
          if (melhor !== atual) mudou = true;
        }
        if (!mudou) break;
      }
    }

    // ---------- monta os dias, um dia de cada vez (a ordem importa para o descanso)
    const revertido = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const n = seg + i;
      const data = numData(n);
      for (const [setor, equipe] of equipes) {
        const posicoes = posicoesDe.get(setor) || [0];
        const minimo = b.setores.get(setor)?.minimo ?? 1;
        const kDia = turnosDoDia.get(setor)?.[i] || 0;
        const escalados = equipe.filter(pl => pl.classes[i] === "livre" && !pl.escolha.includes(i));
        const posDia = new Map<PlanoSemana, number>(escalados.map(pl => [pl, pl.e.pos]));

        // cobre turno descoberto com quem está sobrando em outro turno
        const obrigatorios = turnosObrigatorios(posicoes, kDia);
        if (obrigatorios.length) {
          const conta = (x: number) => escalados.filter(pl => posDia.get(pl) === x).length + equipe.filter(pl => pl.classes[i] === "L" && pl.fixos[i]?.tipo === "T" && pl.e.pos === x).length;
          for (const x of obrigatorios) {
            let guarda = 0;
            while (conta(x) < minimo && guarda++ < 10) {
              let doador: PlanoSemana | null = null, menor = Infinity;
              for (const pl of escalados) {
                const de = posDia.get(pl)!;
                if (de === x || !pl.e.automatico) continue;
                const sobra = obrigatorios.includes(de) ? conta(de) - minimo : 1;
                if (sobra <= 0) continue;
                const jornada = jornadaDoDia(b, pl.e.p, fase);
                const t = montarTurno(b, pl.e, n, x, jornada);
                if (t.empurrado) continue;
                let custo = -sobra * 10 + rng();
                if (i < 6 && trabalhaEm(pl, i + 1)) {
                  const amanha = montarTurno(b, pl.e, n + 1, pl.e.pos, jornada, true);
                  const iniAmanha = (n + 1) * 1440 + hm(amanha.inicio);
                  if (iniAmanha < t.fimAbs + LIMITES.interjornada_min) custo += 50;
                }
                if (custo < menor) { menor = custo; doador = pl; }
              }
              if (!doador) break;
              posDia.set(doador, x);
            }
          }
        }

        for (const pl of equipe) {
          const e = pl.e;
          const c = pl.classes[i];
          let dia: DiaEscala | null = null;
          if (c === "X") dia = null;
          else if (c === "L") dia = pl.fixos[i];
          else if (c === "A") dia = { pessoa_id: e.p.id, data, tipo: pl.ausencias[i]! };
          else if (c === "H") dia = { pessoa_id: e.p.id, data, tipo: "FR" };
          else if (c === "C" || pl.escolha.includes(i)) dia = { pessoa_id: e.p.id, data, tipo: "F" };
          else {
            const jornada = jornadaDoDia(b, e.p, fase);
            let pos = posDia.get(pl) ?? e.pos;
            let turno = montarTurno(b, e, n, pos, jornada);
            if (turno.empurrado && pos === e.pos && e.pos !== e.posBase && !revertido.has(e.p.id)) {
              // o revezamento não cabe no descanso mínimo: mantém o turno de origem nesta semana
              revertido.add(e.p.id);
              e.pos = e.posBase;
              pos = e.pos;
              turno = montarTurno(b, e, n, pos, jornada);
            }
            dia = { pessoa_id: e.p.id, data, tipo: "T", inicio: turno.inicio, fim: turno.fim, intervalo_min: turno.intervalo };
          }
          const t = dia ? turnoDe(dia, n) : null;
          if (dia?.tipo === "T") e.seguidos++; else e.seguidos = 0;
          if (dia?.tipo === "F") e.folgados++; else e.folgados = 0;
          if (t) { e.anterior = { n, fimAbs: t.fimAbs }; e.soDescanso = true; }
          else if (!dia || (dia.tipo !== "F" && dia.tipo !== "FR")) e.soDescanso = false;
          if (i === 6) {
            e.domingos.push(dia?.tipo === "T");
            const cada = domingoCada(b, e.p);
            while (e.domingos.length > cada - 1) e.domingos.shift();
            if (dia?.tipo === "F" && c !== "C") e.folgasDomingo++;
          }
          if (i === 5 && dia?.tipo === "F" && c !== "C") e.folgasSabado++;
          if (dia && n >= primeiro && n <= ultimo) plano.get(e.p.id)!.set(n, dia);
        }
      }
    }
  }

  const out: DiaEscala[] = [];
  for (const [, dias] of plano) for (const [, d] of dias) out.push(d);
  return out.sort((x, y) => x.pessoa_id.localeCompare(y.pessoa_id) || x.data.localeCompare(y.data));
}

function nota(v: Validacao): number {
  let n = v.erros * 1e6;
  for (const x of v.violacoes) if (x.nivel === "alerta") n += x.regra === "cobertura" ? 1000 : 300;
  return n;
}

/**
 * Gera a escala do mês. Dias travados (ctx.dias com travado = true) e o
 * histórico são respeitados; todo o resto é refeito.
 */
export function gerar(ctx: Contexto, opcoes: OpcoesGeracao = {}): Geracao {
  const b = montarBase(ctx);
  const tentativas = Math.max(1, opcoes.tentativas ?? 30);
  const semente = opcoes.semente ?? ctx.ano * 100 + ctx.mes;
  let melhor: { dias: DiaEscala[]; validacao: Validacao; nota: number } | null = null;
  const avisos = new Set<string>();
  let feitas = 0;
  for (let i = 0; i < tentativas; i++) {
    feitas++;
    const dias = gerarUma(b, aleatorio(semente * 7919 + i * 104729), avisos);
    const validacao = validar({ ...ctx, dias });
    const n = nota(validacao);
    if (!melhor || n < melhor.nota) melhor = { dias, validacao, nota: n };
    if (n === 0) break;
  }
  for (const d of diagnosticar(ctx)) if (d.faltam > 0) avisos.add(`${d.setor}: ${d.motivo}`);
  // folga fixa que não coube: a lei e a cobertura vêm antes da preferência
  for (const p of ctx.pessoas) {
    if (p.folga_fixa === null || p.folga_fixa === undefined) continue;
    const datas = melhor!.dias.filter(d => d.pessoa_id === p.id && d.tipo === "T" && !d.travado && diaSemana(dataNum(d.data)) === p.folga_fixa).map(d => fmtDataBr(d.data));
    if (datas.length) avisos.add(`${p.nome} trabalha em ${datas.join(", ")} (${NOMES_DIA_LONGO[p.folga_fixa]}), dia da folga fixa: nessas semanas a folga foi deslocada para cumprir o domingo, o limite de dias seguidos ou a cobertura.`);
  }
  return { dias: melhor!.dias, validacao: melhor!.validacao, avisos: [...avisos], tentativas: feitas };
}

// ============================================================ DIAGNÓSTICO DO QUADRO

/**
 * Conta simples: quantas pessoas o setor precisa, no mínimo, para manter
 * a cobertura pedida em todos os turnos de todos os dias dando as folgas
 * da lei. É um piso teórico; quadro no limite ainda pode deixar furos.
 */
export function diagnosticar(ctx: Contexto): DiagnosticoSetor[] {
  const b = montarBase(ctx);
  const fase = faseDaSemana(b, segundaDe(b.ultimo));
  const diasTrabalho = 7 - fase.repousos_semanais;
  const out: DiagnosticoSetor[] = [];
  const setores = [...new Set(ctx.pessoas.map(p => p.setor))];
  for (const setor of setores) {
    const equipe = ctx.pessoas.filter(p => p.setor === setor && ativoEm(p, b.ultimo));
    const minimo = b.setores.get(setor)?.minimo ?? 1;
    const ref: Pessoa = { id: "", nome: "", setor, turno: "auto", folga_fixa: null, carga_semanal: null, nascimento: null, aprendiz: false, domingo_quinzenal: false, admissao: null, desligamento: null };
    const jornada = jornadaDoDia(b, ref, fase);
    const vao = jornada + intervaloMinimo(b, jornada);
    let postosSemana = 0, maiorK = 0, postosDomingo = 0;
    for (let dsem = 0; dsem < 7; dsem++) {
      const h = b.regras.horario[dsem];
      if (!h?.abre || !h?.fecha) continue;
      const n = b.primeiro + ((dsem - diaSemana(b.primeiro) + 7) % 7);
      const k = turnosParaCobrir(b, n, setor, vao);
      postosSemana += k * minimo;
      maiorK = Math.max(maiorK, k);
      if (dsem === 0) postosDomingo = k * minimo;
    }
    const porHoras = Math.ceil(postosSemana / diasTrabalho);
    // cada pessoa trabalha no máximo (N-1) de cada N domingos
    let capacidadeDomingo = 0;
    for (const p of equipe) { const c = domingoCada(b, p); capacidadeDomingo += (c - 1) / c; }
    const cadaLoja = Math.max(2, b.regras.domingo_cada_semanas || LIMITES.domingo_comercio_semanas);
    const faltaDomingo = postosDomingo > capacidadeDomingo + 1e-9;
    const porDomingo = faltaDomingo ? equipe.length + Math.ceil(((postosDomingo - capacidadeDomingo) * cadaLoja) / (cadaLoja - 1) - 1e-9) : 0;
    const necessarias = Math.max(porHoras, porDomingo);
    const faltam = Math.max(0, necessarias - equipe.length);
    const motivo = faltam
      ? `tem ${equipe.length} pessoa(s) e precisa de pelo menos ${necessarias} para manter ${minimo} por turno, em ${maiorK} turno(s) por dia, com ${fase.repousos_semanais} folga(s) por semana${faltaDomingo ? " e o revezamento de domingos" : ""}. Faltam ${faltam}.`
      : `quadro suficiente: ${equipe.length} pessoa(s) para ${necessarias} necessária(s).`;
    out.push({ setor, pessoas: equipe.length, necessarias, faltam, turnos_por_dia: maiorK, motivo });
  }
  return out.sort((x, y) => x.setor.localeCompare(y.setor));
}
