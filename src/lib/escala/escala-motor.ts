/**
 * Motor de Escala — Andrade Consulting Hub
 * ------------------------------------------------------------------
 * Valida e gera escalas mensais de funcionários de supermercado
 * conforme a EC nº 141/2026 (fim da 6x1) + CLT + Lei 10.101/2000.
 *
 * Arquivo SEM dependências (nem date-fns): roda igual no navegador,
 * no Vitest e numa edge function Deno. Datas são strings 'YYYY-MM-DD'
 * tratadas como dias corridos (sem fuso), horários são 'HH:MM'.
 *
 * Regras implementadas (todas parametrizáveis por loja):
 *  - Marcos legais por data: 44h/1 folga → 42h/2 folgas (14/12/2026)
 *    → 40h/2 folgas (14/12/2027). A loja pode ANTECIPAR (ser mais
 *    protetiva), nunca afrouxar: vale o menor limite de horas e o
 *    maior número de folgas entre o marco legal e o da loja.
 *  - Regime 5x2: 2 folgas em toda semana.
 *  - Regime compensatório (só com ACT/CCT): média de 2 folgas/semana
 *    no mês + pelo menos 1 descanso a cada 7 dias.
 *  - Máximo de dias seguidos trabalhados (padrão 6).
 *  - Domingo: 1 folga a cada 3 semanas (Lei 10.101 art. 6º par. único);
 *    funcionário marcado como "domingo quinzenal" (CLT art. 386): a cada 2.
 *  - Interjornada mínima de 11h (CLT art. 66).
 *  - Intervalo intrajornada (CLT art. 71).
 *  - Jornada diária: 8h sem acordo de compensação; até 10h com acordo (art. 59).
 *  - Aprendiz até 6h/dia (art. 432); menor de 18 sem trabalho 22h–5h (art. 404).
 *  - Feriado trabalhado só com autorização em CCT (Lei 10.101 art. 6º-A).
 *  - Cobertura mínima por departamento × dia da semana × turno.
 */

// ============================================================ TIPOS

export type StatusDia =
  | "TRABALHO"
  | "FOLGA"
  | "FOLGA_COMP"
  | "FERIAS"
  | "ATESTADO"
  | "AFASTADO"
  | "FERIADO";

export type Regime = "5x2" | "compensatorio_cct";
export type NivelViolacao = "erro" | "alerta" | "info";

export interface MarcoLegal {
  vigencia_inicio: string; // YYYY-MM-DD
  horas_semanais: number;
  folgas_semanais: number;
  rotulo: string;
  store_id?: string | null; // null/undefined = marco legal (global)
}

export interface ConfigLoja {
  regime: Regime;
  semana_inicia: 0 | 1; // 0 = domingo, 1 = segunda
  acordo_compensacao: boolean; // permite jornada diária acima de 8h (até 10h)
  intervalo_min_minutos: number; // 60 padrão; 30 se a CCT reduzir
  domingo_folga_cada_semanas: number; // 3 = Lei 10.101
  feriado_autorizado_cct: boolean;
  preferir_folgas_seguidas: boolean;
  max_dias_consecutivos: number; // 6 = nunca 7 dias seguidos
}

export const CONFIG_PADRAO: ConfigLoja = {
  regime: "5x2",
  semana_inicia: 1,
  acordo_compensacao: true,
  intervalo_min_minutos: 60,
  domingo_folga_cada_semanas: 3,
  feriado_autorizado_cct: false,
  preferir_folgas_seguidas: true,
  max_dias_consecutivos: 6,
};

export const MARCOS_PADRAO: MarcoLegal[] = [
  { vigencia_inicio: "1900-01-01", horas_semanais: 44, folgas_semanais: 1, rotulo: "CLT anterior (6x1, 44h)" },
  { vigencia_inicio: "2026-12-14", horas_semanais: 42, folgas_semanais: 2, rotulo: "EC 141 fase 1 (42h, 2 folgas)" },
  { vigencia_inicio: "2027-12-14", horas_semanais: 40, folgas_semanais: 2, rotulo: "EC 141 fase 2 (40h, 2 folgas)" },
];

export interface Turno {
  id: string;
  codigo: string;
  nome?: string;
  inicio: string; // HH:MM
  fim: string; // HH:MM (pode passar da meia-noite)
  intervalo_min: number;
  departamento?: string | null;
}

export interface Funcionario {
  id: string;
  nome: string;
  departamento: string;
  turno_padrao_id: string | null;
  data_nascimento?: string | null;
  aprendiz?: boolean;
  domingo_quinzenal?: boolean; // CLT art. 386
  carga_semanal_contratual?: number | null; // contrato parcial (ex.: 30)
  folga_preferida?: number | null; // 0=dom ... 6=sáb
  admissao?: string | null;
  desligamento?: string | null;
  ativo?: boolean;
}

export interface Cobertura {
  departamento: string;
  dia_semana: number; // 0=dom ... 6=sáb
  turno_id: string | null; // null = qualquer turno
  minimo: number;
}

export interface DataEspecial {
  data: string;
  nome: string;
  tipo: "feriado" | "pico";
  loja_abre?: boolean; // só para feriado
}

export interface Ausencia {
  funcionario_id: string;
  inicio: string;
  fim: string;
  tipo: "FERIAS" | "ATESTADO" | "AFASTADO";
}

export interface Alocacao {
  funcionario_id: string;
  data: string;
  status: StatusDia;
  turno_id?: string | null;
  inicio?: string | null;
  fim?: string | null;
  intervalo_min?: number | null;
  travado?: boolean;
  origem?: "auto" | "manual";
}

export interface Violacao {
  nivel: NivelViolacao;
  regra: string;
  mensagem: string;
  base_legal?: string;
  funcionario_id?: string;
  data?: string;
  departamento?: string;
}

export interface ResumoFuncionario {
  funcionario_id: string;
  dias_trabalhados: number;
  folgas: number;
  domingos_folga: number;
  minutos_trabalhados: number;
  minutos_noturnos: number;
  minutos_acima_limite: number;
  feriados_trabalhados: number;
}

export interface ContextoEscala {
  ano: number;
  mes: number; // 1-12
  store_id?: string | null;
  config?: Partial<ConfigLoja>;
  marcos?: MarcoLegal[];
  turnos: Turno[];
  funcionarios: Funcionario[];
  cobertura?: Cobertura[];
  datas?: DataEspecial[];
  ausencias?: Ausencia[];
  /** Alocações do mês (para validar) ou já travadas (para o gerador respeitar). */
  alocacoes?: Alocacao[];
  /** Alocações dos ~35 dias anteriores ao mês (continuidade de folgas e domingos). */
  historico?: Alocacao[];
}

export interface ResultadoValidacao {
  violacoes: Violacao[];
  erros: number;
  alertas: number;
  resumo: ResumoFuncionario[];
}

export interface ResultadoGeracao {
  alocacoes: Alocacao[];
  avisos: Violacao[];
  validacao: ResultadoValidacao;
}

// ============================================================ DATAS

const MS_DIA = 86400000;

export function dataParaNum(d: string): number {
  const [y, m, dd] = d.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, dd) / MS_DIA);
}

export function numParaData(n: number): string {
  const dt = new Date(n * MS_DIA);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 0 = domingo ... 6 = sábado */
export function diaSemana(n: number): number {
  return (((n + 4) % 7) + 7) % 7; // 01/01/1970 foi quinta (4)
}

export function diasDoMes(ano: number, mes: number): number[] {
  const ini = dataParaNum(`${ano}-${String(mes).padStart(2, "0")}-01`);
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return Array.from({ length: total }, (_, i) => ini + i);
}

function inicioSemana(n: number, semanaInicia: 0 | 1): number {
  return n - ((diaSemana(n) - semanaInicia + 7) % 7);
}

export const NOMES_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fmtData(n: number): string {
  const d = numParaData(n);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

// ============================================================ HORÁRIOS

export function hhmmParaMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + (mm || 0);
}

export function minParaHhmm(m: number): string {
  const s = m < 0 ? "-" : "";
  const a = Math.abs(Math.round(m));
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
}

/** Duração total do turno (com intervalo) em minutos; vira a noite se fim <= início. */
function duracaoBruta(inicio: string, fim: string): number {
  const i = hhmmParaMin(inicio);
  let f = hhmmParaMin(fim);
  if (f <= i) f += 1440;
  return f - i;
}

/** Minutos dentro da faixa noturna 22h–5h (sem hora reduzida). */
function minutosNoturnos(inicio: string, fim: string): number {
  const i = hhmmParaMin(inicio);
  const f = i + duracaoBruta(inicio, fim);
  let total = 0;
  // faixas noturnas em uma janela de 2 dias: [-120, 300], [1320, 1740], [2760, 3180]
  for (const [a, b] of [[-120, 300], [1320, 1740], [2760, 3180]]) {
    total += Math.max(0, Math.min(f, b) - Math.max(i, a));
  }
  return total;
}

interface HorarioDia {
  inicioAbs: number; // minutos absolutos desde a época (n*1440 + início)
  fimAbs: number;
  liquido: number;
  bruto: number;
  intervalo: number;
  noturno: number;
}

function horarioDe(a: Alocacao, turnos: Map<string, Turno>, n: number): HorarioDia | null {
  const t = a.turno_id ? turnos.get(a.turno_id) : undefined;
  const ini = a.inicio ?? t?.inicio;
  const fim = a.fim ?? t?.fim;
  if (!ini || !fim) return null;
  const intervalo = a.intervalo_min ?? t?.intervalo_min ?? 0;
  const bruto = duracaoBruta(ini, fim);
  const inicioAbs = n * 1440 + hhmmParaMin(ini);
  return {
    inicioAbs,
    fimAbs: inicioAbs + bruto,
    bruto,
    intervalo,
    liquido: bruto - intervalo,
    noturno: minutosNoturnos(ini, fim),
  };
}

export function duracaoLiquidaTurno(t: Turno): number {
  return duracaoBruta(t.inicio, t.fim) - (t.intervalo_min || 0);
}

// ============================================================ MARCOS

export interface MarcoEfetivo {
  horas_semanais: number;
  folgas_semanais: number;
  rotulo: string;
}

export function marcoEfetivo(data: string, marcos: MarcoLegal[] = MARCOS_PADRAO): MarcoEfetivo {
  const ultimo = (lista: MarcoLegal[]) =>
    lista
      .filter((m) => m.vigencia_inicio <= data)
      .sort((a, b) => (a.vigencia_inicio < b.vigencia_inicio ? 1 : -1))[0];
  const legais = marcos.filter((m) => !m.store_id);
  const daLoja = marcos.filter((m) => !!m.store_id);
  const legal = ultimo(legais.length ? legais : MARCOS_PADRAO) ?? MARCOS_PADRAO[0];
  const loja = ultimo(daLoja);
  if (!loja) return { horas_semanais: legal.horas_semanais, folgas_semanais: legal.folgas_semanais, rotulo: legal.rotulo };
  // a loja só pode ser MAIS protetiva que a lei
  const horas = Math.min(legal.horas_semanais, loja.horas_semanais);
  const folgas = Math.max(legal.folgas_semanais, loja.folgas_semanais);
  const rotulo = horas === legal.horas_semanais && folgas === legal.folgas_semanais ? legal.rotulo : `${loja.rotulo} (antecipado pela loja)`;
  return { horas_semanais: horas, folgas_semanais: folgas, rotulo };
}

/** Jornada líquida diária sugerida para cumprir o limite semanal. */
export function sugerirJornadaDiaria(horasSemanais: number, folgasSemanais: number): number {
  return Math.round((horasSemanais * 60) / (7 - folgasSemanais));
}

// ============================================================ UTILITÁRIOS

const NAO_TRABALHO_DESCANSO: StatusDia[] = ["FOLGA", "FOLGA_COMP"];
const AUSENCIAS: StatusDia[] = ["FERIAS", "ATESTADO", "AFASTADO"];

function idadeEm(nasc: string | null | undefined, n: number): number | null {
  if (!nasc) return null;
  const d = numParaData(n);
  const [ay, am, ad] = d.split("-").map(Number);
  const [ny, nm, nd] = nasc.split("-").map(Number);
  let idade = ay - ny;
  if (am < nm || (am === nm && ad < nd)) idade--;
  return idade;
}

function ativoNoDia(f: Funcionario, n: number): boolean {
  if (f.ativo === false) return false;
  if (f.admissao && dataParaNum(f.admissao) > n) return false;
  if (f.desligamento && dataParaNum(f.desligamento) < n) return false;
  return true;
}

function cfg(ctx: ContextoEscala): ConfigLoja {
  return { ...CONFIG_PADRAO, ...(ctx.config || {}) };
}

function mapaDatas(ctx: ContextoEscala) {
  const feriados = new Map<number, DataEspecial>();
  const pico = new Set<number>();
  for (const d of ctx.datas || []) {
    const n = dataParaNum(d.data);
    if (d.tipo === "feriado") feriados.set(n, d);
    else pico.add(n);
  }
  return { feriados, pico };
}

function chave(fid: string, n: number) {
  return `${fid}|${n}`;
}

// ============================================================ VALIDADOR

export function validarEscala(ctx: ContextoEscala): ResultadoValidacao {
  const c = cfg(ctx);
  const marcos = ctx.marcos?.length ? ctx.marcos : MARCOS_PADRAO;
  const turnos = new Map(ctx.turnos.map((t) => [t.id, t]));
  const dias = diasDoMes(ctx.ano, ctx.mes);
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  const { feriados } = mapaDatas(ctx);
  const v: Violacao[] = [];
  const resumo: ResumoFuncionario[] = [];

  const aloc = new Map<string, Alocacao>();
  for (const a of [...(ctx.historico || []), ...(ctx.alocacoes || [])]) {
    aloc.set(chave(a.funcionario_id, dataParaNum(a.data)), a);
  }

  const histNums = (ctx.historico || []).map((a) => dataParaNum(a.data));
  const inicioHist = histNums.length ? Math.min(...histNums) : primeiro;

  for (const f of ctx.funcionarios) {
    const diasAtivos = dias.filter((n) => ativoNoDia(f, n));
    if (!diasAtivos.length) continue;
    const r: ResumoFuncionario = {
      funcionario_id: f.id,
      dias_trabalhados: 0,
      folgas: 0,
      domingos_folga: 0,
      minutos_trabalhados: 0,
      minutos_noturnos: 0,
      minutos_acima_limite: 0,
      feriados_trabalhados: 0,
    };
    const st = (n: number): StatusDia | null => aloc.get(chave(f.id, n))?.status ?? null;
    const push = (x: Omit<Violacao, "funcionario_id" | "departamento">) =>
      v.push({ ...x, funcionario_id: f.id, departamento: f.departamento });

    // ---------- checagens diárias
    let ultimoFim: { fimAbs: number; n: number } | null = null;
    for (let n = inicioHist; n <= ultimo; n++) {
      const a = aloc.get(chave(f.id, n));
      const noMes = n >= primeiro;
      if (noMes && ativoNoDia(f, n) && !a) {
        push({ nivel: "alerta", regra: "sem_alocacao", data: numParaData(n), mensagem: `${f.nome}: ${fmtData(n)} sem alocação definida.` });
      }
      if (!a || a.status !== "TRABALHO") {
        if (a && noMes) {
          if (NAO_TRABALHO_DESCANSO.includes(a.status)) {
            r.folgas++;
            if (diaSemana(n) === 0) r.domingos_folga++;
          }
        }
        continue;
      }
      const h = horarioDe(a, turnos, n);
      if (!h) {
        if (noMes) push({ nivel: "erro", regra: "sem_horario", data: numParaData(n), mensagem: `${f.nome}: ${fmtData(n)} marcado como trabalho sem turno/horário.` });
        continue;
      }
      // interjornada (vale também entre o histórico e o 1º dia do mês)
      if (ultimoFim && n - ultimoFim.n === 1) {
        const descanso = h.inicioAbs - ultimoFim.fimAbs;
        if (descanso < 660 && noMes) {
          push({
            nivel: "erro",
            regra: "interjornada",
            data: numParaData(n),
            base_legal: "CLT art. 66",
            mensagem: `${f.nome}: só ${minParaHhmm(descanso)} de descanso entre ${fmtData(n - 1)} e ${fmtData(n)} (mínimo 11h).`,
          });
        }
      }
      ultimoFim = { fimAbs: h.fimAbs, n };
      if (!noMes) continue;

      r.dias_trabalhados++;
      r.minutos_trabalhados += h.liquido;
      r.minutos_noturnos += h.noturno;
      const dataTxt = numParaData(n);
      const idade = idadeEm(f.data_nascimento, n);
      const menor = idade !== null && idade < 18;

      if (h.liquido > 600) {
        push({ nivel: "erro", regra: "jornada_diaria_max", data: dataTxt, base_legal: "CLT art. 59", mensagem: `${f.nome}: ${minParaHhmm(h.liquido)} em ${fmtData(n)} — acima do teto de 10h/dia.` });
      } else if (h.liquido > 480 && !c.acordo_compensacao) {
        push({ nivel: "erro", regra: "jornada_diaria_sem_acordo", data: dataTxt, base_legal: "CLT art. 58 e 59", mensagem: `${f.nome}: ${minParaHhmm(h.liquido)} em ${fmtData(n)} — acima de 8h exige acordo de compensação.` });
      }
      if (f.aprendiz && h.liquido > 360) {
        push({ nivel: "erro", regra: "aprendiz", data: dataTxt, base_legal: "CLT art. 432", mensagem: `${f.nome} (aprendiz): ${minParaHhmm(h.liquido)} em ${fmtData(n)} — limite de 6h/dia.` });
      }
      if (menor && h.liquido > 480) {
        push({ nivel: "erro", regra: "menor_jornada", data: dataTxt, base_legal: "CLT art. 411 e 413", mensagem: `${f.nome} (menor): ${minParaHhmm(h.liquido)} em ${fmtData(n)} — menor não faz hora extra.` });
      }
      if (menor && h.noturno > 0) {
        push({ nivel: "erro", regra: "menor_noturno", data: dataTxt, base_legal: "CLT art. 404", mensagem: `${f.nome} (menor): trabalho entre 22h e 5h em ${fmtData(n)} é proibido.` });
      }
      // intervalo intrajornada
      if (h.liquido > 360 && h.intervalo < c.intervalo_min_minutos) {
        push({ nivel: "erro", regra: "intervalo", data: dataTxt, base_legal: "CLT art. 71", mensagem: `${f.nome}: intervalo de ${h.intervalo} min em ${fmtData(n)} — mínimo ${c.intervalo_min_minutos} min para jornada acima de 6h.` });
      } else if (h.liquido > 240 && h.liquido <= 360 && h.intervalo < 15) {
        push({ nivel: "erro", regra: "intervalo", data: dataTxt, base_legal: "CLT art. 71 §1º", mensagem: `${f.nome}: jornada de 4h–6h em ${fmtData(n)} precisa de 15 min de intervalo.` });
      }
      if (h.intervalo > 120) {
        push({ nivel: "alerta", regra: "intervalo_longo", data: dataTxt, base_legal: "CLT art. 71", mensagem: `${f.nome}: intervalo de ${h.intervalo} min em ${fmtData(n)} — acima de 2h só com acordo escrito ou CCT.` });
      }
      // feriado
      const fer = feriados.get(n);
      if (fer) {
        r.feriados_trabalhados++;
        if (fer.loja_abre === false) {
          push({ nivel: "alerta", regra: "feriado_loja_fechada", data: dataTxt, mensagem: `${f.nome}: escalado em ${fer.nome} (${fmtData(n)}), mas a loja está marcada como fechada.` });
        } else if (!c.feriado_autorizado_cct) {
          push({ nivel: "erro", regra: "feriado_sem_cct", data: dataTxt, base_legal: "Lei 10.101/2000 art. 6º-A", mensagem: `${f.nome}: trabalho em ${fer.nome} (${fmtData(n)}) exige autorização em convenção coletiva.` });
        } else {
          push({ nivel: "info", regra: "feriado_trabalhado", data: dataTxt, base_legal: "Lei 605/1949 art. 9º", mensagem: `${f.nome}: ${fer.nome} trabalhado — pagar em dobro ou conceder folga compensatória.` });
        }
      }
    }

    // ---------- dias consecutivos
    let seq = 0;
    let avisado = false;
    for (let n = inicioHist; n <= ultimo; n++) {
      if (st(n) === "TRABALHO") {
        seq++;
        if (seq > c.max_dias_consecutivos && n >= primeiro && !avisado) {
          push({
            nivel: "erro",
            regra: "dias_consecutivos",
            data: numParaData(n),
            base_legal: "CLT art. 67 · EC 141 · OJ 410 SDI-1 TST",
            mensagem: `${f.nome}: ${seq} dias seguidos de trabalho até ${fmtData(n)} (máximo ${c.max_dias_consecutivos}).`,
          });
          avisado = true;
        }
      } else {
        seq = 0;
        avisado = false;
      }
    }

    // ---------- folgas e horas por semana
    const semanas = new Set(diasAtivos.map((n) => inicioSemana(n, c.semana_inicia)));
    const limiteContrato = f.carga_semanal_contratual || Infinity;
    for (const ws of [...semanas].sort((a, b) => a - b)) {
      const marco = marcoEfetivo(numParaData(Math.max(ws, primeiro)), marcos);
      let conhecidos = 0, folgas = 0, ausencias = 0, minutos = 0;
      for (let n = ws; n < ws + 7; n++) {
        const s = st(n);
        if (!ativoNoDia(f, n)) continue;
        if (s === null) continue;
        conhecidos++;
        if (NAO_TRABALHO_DESCANSO.includes(s)) folgas++;
        if (AUSENCIAS.includes(s)) ausencias++;
        if (s === "TRABALHO") {
          const a = aloc.get(chave(f.id, n))!;
          minutos += horarioDe(a, turnos, n)?.liquido ?? 0;
        }
      }
      if (!conhecidos) continue;
      const completa = conhecidos === 7;
      const exigido = completa ? marco.folgas_semanais : Math.round((marco.folgas_semanais * conhecidos) / 7);
      const obtido = folgas + ausencias;
      const rotuloSem = `semana de ${fmtData(ws)}`;
      if (c.regime === "5x2" || marco.folgas_semanais < 2) {
        if (obtido < exigido) {
          push({
            nivel: completa ? "erro" : "alerta",
            regra: "folgas_semanais",
            data: numParaData(Math.max(ws, primeiro)),
            base_legal: marco.folgas_semanais >= 2 ? "EC 141 (art. 7º, XV)" : "CLT art. 67",
            mensagem: `${f.nome}: ${obtido} folga(s) na ${rotuloSem}${completa ? "" : " (semana parcial)"} — exigido ${exigido} (${marco.rotulo}).`,
          });
        }
      } else if (completa && obtido < 1) {
        push({ nivel: "erro", regra: "descanso_semanal", data: numParaData(Math.max(ws, primeiro)), base_legal: "EC 141 (regime compensatório)", mensagem: `${f.nome}: nenhum descanso na ${rotuloSem}.` });
      }
      if (completa) {
        const limite = Math.min(marco.horas_semanais * 60, limiteContrato * 60);
        if (minutos > limite) {
          r.minutos_acima_limite += minutos - limite;
          if (c.regime === "5x2") {
            push({
              nivel: "alerta",
              regra: "horas_semanais",
              data: numParaData(Math.max(ws, primeiro)),
              base_legal: "CF art. 7º, XIII (EC 141)",
              mensagem: `${f.nome}: ${minParaHhmm(minutos)} na ${rotuloSem} — limite ${minParaHhmm(limite)}; excedente ${minParaHhmm(minutos - limite)} vira hora extra.`,
            });
          }
        }
      }
    }

    // ---------- regime compensatório: média mensal
    if (c.regime === "compensatorio_cct") {
      const alvo = Math.ceil(diasAtivos.reduce((s, n) => s + marcoEfetivo(numParaData(n), marcos).folgas_semanais / 7, 0) - 1e-9);
      const aus = diasAtivos.filter((n) => AUSENCIAS.includes(st(n) as StatusDia)).length;
      if (r.folgas + aus < alvo) {
        push({ nivel: "erro", regra: "media_folgas_mes", base_legal: "EC 141 (compensação no mês)", mensagem: `${f.nome}: ${r.folgas} folgas no mês — a média de 2/semana exige ${alvo}.` });
      }
      const limiteMes = diasAtivos.reduce((s, n) => s + (Math.min(marcoEfetivo(numParaData(n), marcos).horas_semanais, limiteContrato) * 60) / 7, 0);
      const minAus = aus * (limiteMes / Math.max(1, diasAtivos.length));
      if (r.minutos_trabalhados + minAus > limiteMes + 1) {
        const exc = r.minutos_trabalhados + minAus - limiteMes;
        r.minutos_acima_limite = Math.round(exc);
        push({ nivel: "alerta", regra: "horas_mes", base_legal: "EC 141 (compensação no mês)", mensagem: `${f.nome}: ${minParaHhmm(r.minutos_trabalhados)} no mês — limite proporcional ${minParaHhmm(limiteMes)}; excedente ${minParaHhmm(exc)} vira hora extra.` });
      }
    }

    // ---------- domingos
    const N = f.domingo_quinzenal ? Math.min(2, c.domingo_folga_cada_semanas) : c.domingo_folga_cada_semanas;
    const domingos: number[] = [];
    for (let n = inicioHist; n <= ultimo; n++) if (diaSemana(n) === 0) domingos.push(n);
    for (let i = 0; i + N <= domingos.length; i++) {
      const janela = domingos.slice(i, i + N);
      const fim = janela[janela.length - 1];
      if (fim < primeiro) continue;
      const sts = janela.map((n) => (ativoNoDia(f, n) ? st(n) : "AFASTADO"));
      if (sts.some((s) => s === null)) continue;
      if (sts.every((s) => s === "TRABALHO")) {
        push({
          nivel: "erro",
          regra: "domingo",
          data: numParaData(fim),
          base_legal: f.domingo_quinzenal ? "CLT art. 386" : "Lei 10.101/2000 art. 6º, par. único",
          mensagem: `${f.nome}: ${N} domingos seguidos trabalhados até ${fmtData(fim)} — precisa folgar 1 a cada ${N}.`,
        });
      }
    }

    resumo.push(r);
  }

  // ---------- cobertura mínima
  const regras = ctx.cobertura || [];
  if (regras.length) {
    const porDepto = new Map<string, Funcionario[]>();
    for (const f of ctx.funcionarios) {
      if (!porDepto.has(f.departamento)) porDepto.set(f.departamento, []);
      porDepto.get(f.departamento)!.push(f);
    }
    for (const n of dias) {
      const fer = feriados.get(n);
      if (fer && fer.loja_abre === false) continue;
      const dow = diaSemana(n);
      for (const r of regras.filter((x) => x.dia_semana === dow && x.minimo > 0)) {
        const fs = porDepto.get(r.departamento) || [];
        const qtd = fs.filter((f) => {
          const a = aloc.get(chave(f.id, n));
          return a?.status === "TRABALHO" && (r.turno_id === null || a.turno_id === r.turno_id);
        }).length;
        if (qtd < r.minimo) {
          const t = r.turno_id ? turnos.get(r.turno_id) : null;
          v.push({
            nivel: "alerta",
            regra: "cobertura",
            data: numParaData(n),
            departamento: r.departamento,
            mensagem: `${r.departamento}${t ? ` · ${t.codigo}` : ""}: ${qtd} de ${r.minimo} pessoas em ${NOMES_DIA[dow]} ${fmtData(n)}.`,
          });
        }
      }
    }
  }

  return {
    violacoes: v,
    erros: v.filter((x) => x.nivel === "erro").length,
    alertas: v.filter((x) => x.nivel === "alerta").length,
    resumo,
  };
}

// ============================================================ GERADOR

export interface OpcoesGeracao {
  /** Mantém alocações travadas recebidas em ctx.alocacoes (padrão: true). */
  respeitarTravadas?: boolean;
}

type Celula = { status: StatusDia | null; travado: boolean; turno_id: string | null };

export function gerarEscala(ctx: ContextoEscala, opcoes: OpcoesGeracao = {}): ResultadoGeracao {
  const c = cfg(ctx);
  const marcos = ctx.marcos?.length ? ctx.marcos : MARCOS_PADRAO;
  const turnos = new Map(ctx.turnos.map((t) => [t.id, t]));
  const dias = diasDoMes(ctx.ano, ctx.mes);
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  const { feriados, pico } = mapaDatas(ctx);
  const avisos: Violacao[] = [];
  const respeitar = opcoes.respeitarTravadas !== false;

  const funcs = ctx.funcionarios.filter((f) => dias.some((n) => ativoNoDia(f, n)));

  // histórico indexado
  const hist = new Map<string, StatusDia>();
  for (const a of ctx.historico || []) hist.set(chave(a.funcionario_id, dataParaNum(a.data)), a.status);

  // ---------- avisos prévios: turno x limite semanal
  const marcosDoMes = new Map<string, MarcoEfetivo>();
  for (const n of dias) {
    const m = marcoEfetivo(numParaData(n), marcos);
    marcosDoMes.set(`${m.horas_semanais}|${m.folgas_semanais}`, m);
  }
  const turnosAvisados = new Set<string>();
  for (const f of funcs) {
    const t = f.turno_padrao_id ? turnos.get(f.turno_padrao_id) : undefined;
    if (!t) {
      avisos.push({ nivel: "erro", regra: "sem_turno", funcionario_id: f.id, departamento: f.departamento, mensagem: `${f.nome} está sem turno padrão — defina no cadastro para gerar a escala.` });
      continue;
    }
    if (turnosAvisados.has(t.id)) continue;
    turnosAvisados.add(t.id);
    const liq = duracaoLiquidaTurno(t);
    for (const m of marcosDoMes.values()) {
      const semana = liq * (7 - m.folgas_semanais);
      if (semana > m.horas_semanais * 60) {
        avisos.push({
          nivel: "alerta",
          regra: "turno_acima_limite",
          mensagem: `Turno ${t.codigo} (${minParaHhmm(liq)} líquidas) × ${7 - m.folgas_semanais} dias = ${minParaHhmm(semana)} > ${m.horas_semanais}h (${m.rotulo}). Ajuste para ${minParaHhmm(sugerirJornadaDiaria(m.horas_semanais, m.folgas_semanais))} ou haverá hora extra.`,
        });
      }
    }
    if (liq > 480 && !c.acordo_compensacao) {
      avisos.push({ nivel: "erro", regra: "turno_sem_acordo", mensagem: `Turno ${t.codigo} tem ${minParaHhmm(liq)} líquidas — acima de 8h exige acordo de compensação (ative na configuração da loja).` });
    }
  }

  for (const [n, fer] of feriados) {
    if (n < primeiro || n > ultimo) continue;
    if (fer.loja_abre !== false && !c.feriado_autorizado_cct) {
      avisos.push({
        nivel: "alerta",
        regra: "feriado_sem_cct",
        data: numParaData(n),
        base_legal: "Lei 10.101/2000 art. 6º-A",
        mensagem: `${fer.nome} (${fmtData(n)}): loja marcada como aberta, mas sem autorização de CCT ninguém foi escalado. Ative "feriado autorizado em CCT" na configuração ou marque a loja como fechada.`,
      });
    }
  }

  // ---------- grade inicial
  const grade = new Map<string, Celula>();
  const travadas = new Map<string, Alocacao>();
  if (respeitar) for (const a of ctx.alocacoes || []) if (a.travado) travadas.set(chave(a.funcionario_id, dataParaNum(a.data)), a);

  for (const f of funcs) {
    for (const n of dias) {
      if (!ativoNoDia(f, n)) continue;
      const k = chave(f.id, n);
      const tv = travadas.get(k);
      if (tv) {
        grade.set(k, { status: tv.status, travado: true, turno_id: tv.turno_id ?? f.turno_padrao_id });
        continue;
      }
      let status: StatusDia | null = null;
      for (const au of ctx.ausencias || []) {
        if (au.funcionario_id === f.id && dataParaNum(au.inicio) <= n && dataParaNum(au.fim) >= n) status = au.tipo;
      }
      const fer = feriados.get(n);
      if (!status && fer && (fer.loja_abre === false || !c.feriado_autorizado_cct)) status = "FERIADO";
      grade.set(k, { status, travado: status !== null, turno_id: f.turno_padrao_id });
    }
  }

  const statusEm = (fid: string, n: number): StatusDia | null => {
    if (n < primeiro) return hist.get(chave(fid, n)) ?? null;
    return grade.get(chave(fid, n))?.status ?? null;
  };
  const ehDescanso = (s: StatusDia | null) => s !== null && s !== "TRABALHO";

  // ---------- cobertura: contagem de quem trabalha (indefinido = trabalha)
  const regras = ctx.cobertura || [];
  const minimo = (depto: string, n: number, turno: string | null): number => {
    const dow = diaSemana(n);
    let m = 0;
    for (const r of regras) {
      if (r.departamento !== depto || r.dia_semana !== dow) continue;
      if (r.turno_id === null || r.turno_id === turno) m = Math.max(m, r.minimo);
    }
    return m;
  };
  const trabalhando = (depto: string, n: number, turno: string | null): number =>
    funcs.filter((f) => {
      if (f.departamento !== depto) return false;
      const cel = grade.get(chave(f.id, n));
      if (!cel) return false;
      if (cel.status !== null && cel.status !== "TRABALHO") return false;
      return turno === null || cel.turno_id === turno;
    }).length;
  const folga = (f: Funcionario, n: number) => {
    const cel = grade.get(chave(f.id, n))!;
    cel.status = "FOLGA";
  };

  // ---------- 1) domingos em rodízio
  const domingosMes = dias.filter((n) => diaSemana(n) === 0);
  const porDepto = new Map<string, Funcionario[]>();
  for (const f of funcs) {
    if (!porDepto.has(f.departamento)) porDepto.set(f.departamento, []);
    porDepto.get(f.departamento)!.push(f);
  }
  for (const [, lista] of porDepto) {
    // quantos domingos seguidos cada um já trabalhou no histórico
    const seqDom = new Map<string, number | null>();
    for (const f of lista) {
      let s = 0;
      let conhecido = false;
      for (let n = primeiro - 1; n >= primeiro - 35; n--) {
        if (diaSemana(n) !== 0) continue;
        const h = hist.get(chave(f.id, n));
        if (h === undefined) break;
        conhecido = true;
        if (h === "TRABALHO") s++;
        else break;
      }
      seqDom.set(f.id, conhecido ? s : null);
    }
    lista.forEach((f, idx) => {
      const N = f.domingo_quinzenal ? Math.min(2, c.domingo_folga_cada_semanas) : c.domingo_folga_cada_semanas;
      const s = seqDom.get(f.id);
      // posição (0-based) do primeiro domingo de folga no mês
      let pos = s === null || s === undefined ? idx % N : Math.max(0, N - 1 - s);
      for (let i = 0; i < domingosMes.length; i++) {
        const n = domingosMes[i];
        const cel = grade.get(chave(f.id, n));
        if (!cel) continue;
        if (cel.status !== null) {
          // ausência/feriado/folga travada em domingo conta como descanso dominical;
          // trabalho travado no domingo da vez empurra a folga para o próximo domingo
          if (ehDescanso(cel.status)) pos = i + N;
          else if (i >= pos) pos = i + 1;
          continue;
        }
        if (i === pos) {
          folga(f, n);
          pos = i + N;
        }
      }
    });
  }

  // ---------- 2) folgas semana a semana
  const semanas = [...new Set(dias.map((n) => inicioSemana(n, c.semana_inicia)))].sort((a, b) => a - b);
  const alvoMes = new Map<string, number>();
  const diasAtivosMes = new Map<string, number[]>();
  for (const f of funcs) {
    const da = dias.filter((n) => ativoNoDia(f, n));
    diasAtivosMes.set(f.id, da);
    alvoMes.set(f.id, Math.ceil(da.reduce((s, n) => s + marcoEfetivo(numParaData(n), marcos).folgas_semanais / 7, 0) - 1e-9));
  }

  const combinacoes = (arr: number[], k: number): number[][] => {
    const out: number[][] = [];
    const rec = (ini: number, atual: number[]) => {
      if (atual.length === k) { out.push([...atual]); return; }
      for (let i = ini; i < arr.length; i++) { atual.push(arr[i]); rec(i + 1, atual); atual.pop(); }
    };
    rec(0, []);
    return out;
  };

  semanas.forEach((ws, wi) => {
    // ordem dos funcionários: rotaciona por semana para dividir as "boas" folgas
    const ordem = funcs.map((f, i) => ({ f, i })).sort((a, b) => ((a.i + wi) % funcs.length) - ((b.i + wi) % funcs.length));
    for (const { f } of ordem) {
      const marco = marcoEfetivo(numParaData(Math.max(ws, primeiro)), marcos);
      const diasSem = Array.from({ length: 7 }, (_, i) => ws + i);
      let conhecidos = 0, ja = 0, aus = 0;
      const candidatos: number[] = [];
      for (const n of diasSem) {
        if (n > ultimo) continue;
        if (n < primeiro) {
          const h = hist.get(chave(f.id, n));
          if (h === undefined) continue;
          conhecidos++;
          if (h === "FOLGA" || h === "FOLGA_COMP") ja++;
          if (AUSENCIAS.includes(h)) aus++;
          continue;
        }
        const cel = grade.get(chave(f.id, n));
        if (!cel) continue;
        conhecidos++;
        if (cel.status === "FOLGA" || cel.status === "FOLGA_COMP") ja++;
        else if (cel.status && AUSENCIAS.includes(cel.status)) aus++;
        else if (cel.status === null) candidatos.push(n);
      }
      if (!conhecidos) continue;

      let precisa: number;
      if (c.regime === "compensatorio_cct" && marco.folgas_semanais >= 2) {
        // distribui o alvo do mês proporcionalmente, empurrando folgas para fora do pico
        const da = diasAtivosMes.get(f.id)!;
        const ateFim = da.filter((n) => n < ws + 7).length;
        const alvoAcum = Math.round((alvoMes.get(f.id)! * ateFim) / da.length);
        const atribuidasAntes = da.filter((n) => n < ws && grade.get(chave(f.id, n))?.status === "FOLGA").length;
        let alvoSemana = alvoAcum - atribuidasAntes;
        const temPico = diasSem.some((n) => pico.has(n));
        if (temPico) alvoSemana -= 1;
        const minimoSemana = conhecidos === 7 ? 1 : 0;
        precisa = Math.max(minimoSemana - (ja + aus), alvoSemana - ja - aus, 0);
      } else {
        const exigido = conhecidos === 7 ? marco.folgas_semanais : Math.round((marco.folgas_semanais * conhecidos) / 7);
        precisa = Math.max(0, exigido - ja - aus);
      }
      precisa = Math.min(precisa, candidatos.length);

      // run máximo considerando escolha (indefinido = trabalho)
      const runOk = (escolha: Set<number>): boolean => {
        let seq = 0;
        for (let n = primeiro - 14; n < ws + 7 && n <= ultimo; n++) {
          if (n >= primeiro && !grade.has(chave(f.id, n))) { seq = 0; continue; } // fora do contrato
          const s = n < primeiro ? hist.get(chave(f.id, n)) ?? null : statusEm(f.id, n);
          const descanso = escolha.has(n) || (s !== null && s !== "TRABALHO");
          const conhecido = n >= primeiro || s !== null;
          if (!conhecido) { seq = 0; continue; }
          if (descanso) seq = 0;
          else if (++seq > c.max_dias_consecutivos) return false;
        }
        return true;
      };

      const pontuar = (escolha: number[]): number => {
        let p = 0;
        const set = new Set(escolha);
        for (const n of escolha) {
          const cel = grade.get(chave(f.id, n))!;
          const sobra = trabalhando(f.departamento, n, cel.turno_id) - 1 - minimo(f.departamento, n, cel.turno_id);
          p += sobra >= 0 ? 10 + Math.min(sobra, 10) * 3 : -100 + sobra * 20;
          // espalha folgas: penaliza dias em que muita gente do depto já folga
          const totalDepto = (porDepto.get(f.departamento) || []).length || 1;
          p += (trabalhando(f.departamento, n, null) / totalDepto) * 8;
          if (f.folga_preferida !== null && f.folga_preferida !== undefined && diaSemana(n) === f.folga_preferida) p += 15;
          if (pico.has(n)) p -= 60;
          if (c.preferir_folgas_seguidas && (set.has(n - 1) || set.has(n + 1) || ehDescanso(statusEm(f.id, n - 1)) || ehDescanso(statusEm(f.id, n + 1)))) p += 6;
        }
        return p;
      };

      let escolhida: number[] | null = null;
      for (let k = precisa; k <= candidatos.length && !escolhida; k++) {
        let melhor: { e: number[]; p: number } | null = null;
        for (const e of combinacoes(candidatos, k)) {
          if (!runOk(new Set(e))) continue;
          const p = pontuar(e) - (k - precisa) * 40; // folga extra só se for obrigatório
          if (!melhor || p > melhor.p) melhor = { e, p };
        }
        if (melhor) escolhida = melhor.e;
      }
      if (!escolhida) {
        // sem combinação que respeite o limite de dias seguidos (ex.: travas) — escolhe a melhor e avisa
        const comb = combinacoes(candidatos, precisa);
        escolhida = comb.sort((a, b) => pontuar(b) - pontuar(a))[0] || [];
        if (precisa > 0 || candidatos.length === 0) {
          avisos.push({ nivel: "alerta", regra: "gerador_sem_solucao", funcionario_id: f.id, departamento: f.departamento, data: numParaData(Math.max(ws, primeiro)), mensagem: `${f.nome}: não achei folgas que respeitem todas as regras na semana de ${fmtData(ws)} — revise as travas desse funcionário.` });
        }
      }
      for (const n of escolhida) folga(f, n);
    }
  });

  // ---------- 3) restante vira trabalho
  const alocacoes: Alocacao[] = [];
  for (const f of funcs) {
    for (const n of dias) {
      const cel = grade.get(chave(f.id, n));
      if (!cel) continue;
      const tv = travadas.get(chave(f.id, n));
      if (tv) { alocacoes.push({ ...tv }); continue; }
      if (cel.status === null) cel.status = "TRABALHO";
      const t = cel.turno_id ? turnos.get(cel.turno_id) : undefined;
      alocacoes.push({
        funcionario_id: f.id,
        data: numParaData(n),
        status: cel.status,
        turno_id: cel.status === "TRABALHO" ? cel.turno_id : null,
        inicio: cel.status === "TRABALHO" ? t?.inicio ?? null : null,
        fim: cel.status === "TRABALHO" ? t?.fim ?? null : null,
        intervalo_min: cel.status === "TRABALHO" ? t?.intervalo_min ?? null : null,
        travado: false,
        origem: "auto",
      });
    }
  }

  const validacao = validarEscala({ ...ctx, alocacoes });
  return { alocacoes, avisos, validacao };
}
