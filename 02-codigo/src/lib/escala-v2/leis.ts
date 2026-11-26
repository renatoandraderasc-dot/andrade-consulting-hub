/**
 * Escala V2 — quadro legal
 * ------------------------------------------------------------------
 * Tudo o que é "lei" fica neste arquivo, com a fonte ao lado, para ser
 * conferido e atualizado sem mexer no gerador nem na tela.
 *
 * Fontes (conferidas em 26/11/2026):
 *  - EC nº 141/2026 (DOU 16/10/2026): dois repousos semanais remunerados,
 *    42h a partir de 16/12/2026 e 40h a partir de 16/12/2027, sem redução
 *    de salário.
 *  - Decreto nº 13.173/2026 (19/11/2026): divisores 220 / 210 / 200.
 *  - Portaria MTE nº 2.041/2026 (23/11/2026): cada repouso tem 24h
 *    consecutivas; no comércio o repouso coincide com o domingo ao menos
 *    1 vez a cada 3 semanas; no máximo 6 dias seguidos de trabalho; por
 *    CCT/ACT os repousos podem ser distribuídos no mês (média de 2 por
 *    semana, mínimo de 9 em meses de 30/31 dias).
 *  - STF, ADIs 8.041 e 8.042, liminar de 12/11/2026 (rel. min. Flávio
 *    Dino): na fase de 42h a empresa pode usar 5 dias de até 8h24 sem
 *    norma coletiva, e os 24 min não são hora extra até 15/12/2027.
 *    A liminar ainda vai a julgamento de mérito e PODE MUDAR.
 *  - CLT arts. 66 (11h entre jornadas), 71 (intervalo), 386 (domingo
 *    quinzenal da mulher), 404 e 432 (menor e aprendiz), 134 §3º (férias);
 *    Súmula 110 do TST (11h + 24h no repouso); Lei 10.101/2000 art. 6º-A
 *    (feriado no comércio depende de convenção coletiva).
 */

export interface FaseLegal {
  /** Primeiro dia em que a fase vale (YYYY-MM-DD). */
  desde: string;
  horas_semanais: number;
  repousos_semanais: number;
  /** Jornada diária normal sem norma coletiva, em minutos. */
  diaria_min: number;
  /** Jornada diária admitida pela liminar do STF (só na fase de 42h). */
  diaria_liminar_min: number | null;
  divisor: number;
  rotulo: string;
  base_legal: string;
}

export const FASES: FaseLegal[] = [
  {
    desde: "1900-01-01",
    horas_semanais: 44,
    repousos_semanais: 1,
    diaria_min: 480,
    diaria_liminar_min: null,
    divisor: 220,
    rotulo: "Até 15/12/2026 · 44h · 1 folga",
    base_legal: "CF art. 7º XIII e XV (redação anterior à EC 141/2026)",
  },
  {
    desde: "2026-12-16",
    horas_semanais: 42,
    repousos_semanais: 2,
    diaria_min: 480,
    diaria_liminar_min: 504,
    divisor: 210,
    rotulo: "16/12/2026 a 15/12/2027 · 42h · 2 folgas",
    base_legal: "EC 141/2026 (1ª etapa) · Decreto 13.173/2026 · Portaria MTE 2.041/2026",
  },
  {
    desde: "2027-12-16",
    horas_semanais: 40,
    repousos_semanais: 2,
    diaria_min: 480,
    diaria_liminar_min: null,
    divisor: 200,
    rotulo: "A partir de 16/12/2027 · 40h · 2 folgas",
    base_legal: "EC 141/2026 (2ª etapa) · Decreto 13.173/2026 · Portaria MTE 2.041/2026",
  },
];

/** Fase vigente em uma data. `antecipar` permite adotar a fase seguinte antes do prazo. */
export function faseEm(data: string, antecipar?: string | null): FaseLegal {
  let fase = FASES[0];
  for (const f of FASES) if (f.desde <= data) fase = f;
  if (antecipar && antecipar <= data && fase.repousos_semanais < 2) fase = { ...FASES[1], rotulo: `${FASES[1].rotulo} (antecipada pela loja)` };
  return fase;
}

export const LIMITES = {
  /** CLT art. 66. */
  interjornada_min: 11 * 60,
  /** Súmula 110 do TST: 11h de interjornada + 24h do repouso. */
  repouso_mais_interjornada_min: 35 * 60,
  /** Portaria MTE 2.041/2026 (e Lei 605/1949). */
  max_dias_seguidos: 6,
  /** CLT art. 71: mais de 6h de trabalho exige 1h (30 min com norma coletiva, art. 611-A III). */
  intervalo_longo_min: 60,
  intervalo_longo_cct_min: 30,
  /** CLT art. 71 §1º: mais de 4h até 6h exige 15 min. */
  intervalo_curto_min: 15,
  intervalo_max_min: 120,
  /** CLT art. 432: aprendiz até 6h por dia. */
  aprendiz_diaria_min: 360,
  /** CLT art. 59: no máximo 2h extras; com acordo de compensação, até 10h no dia. */
  diaria_max_cct_min: 600,
  /** CLT art. 73 §2º e art. 404: horário noturno urbano. */
  noturno_inicio_min: 22 * 60,
  noturno_fim_min: 5 * 60,
  /** Portaria MTE 2.041/2026: comércio 1 a cada 3; CLT art. 386: mulheres, quinzenal. */
  domingo_comercio_semanas: 3,
  domingo_quinzenal_semanas: 2,
  /** Portaria MTE 2.041/2026: mínimo de repousos em mês de 30/31 dias na compensação mensal. */
  repousos_mes_cheio: 9,
};

export const BASE = {
  semanal: "CF art. 7º XIII (EC 141/2026)",
  repousos: "CF art. 7º XV (EC 141/2026) · Portaria MTE 2.041/2026",
  repousos_mes: "Portaria MTE 2.041/2026 (distribuição mensal por CCT/ACT)",
  consecutivos: "Portaria MTE 2.041/2026 · Lei 605/1949",
  domingo: "Portaria MTE 2.041/2026 · Lei 10.101/2000 art. 6º",
  domingo_quinzenal: "CLT art. 386",
  interjornada: "CLT art. 66",
  repouso35: "CLT arts. 66 e 67 · Súmula 110 do TST",
  intervalo: "CLT art. 71",
  diaria: "CF art. 7º XIII · CLT arts. 58 e 59",
  diaria_liminar: "STF, ADIs 8.041/8.042 (liminar de 12/11/2026)",
  aprendiz: "CLT art. 432",
  menor_noturno: "CF art. 7º XXXIII · CLT art. 404",
  feriado: "Lei 10.101/2000 art. 6º-A",
  ferias: "CLT art. 134 §3º",
  ausencia: "CLT arts. 129 e 473",
  cobertura: "Regra operacional da loja (não é exigência legal)",
};

// ------------------------------------------------------------ feriados

export interface FeriadoNacional {
  data: string;
  nome: string;
}

function pascoa(ano: number): Date {
  // Algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * Feriados nacionais (Leis 662/1949, 6.802/1980, 10.607/2002 e 14.759/2023).
 * Carnaval e Corpus Christi NÃO são feriados nacionais; feriados estaduais
 * e municipais são cadastrados pela loja.
 */
export function feriadosNacionais(ano: number): FeriadoNacional[] {
  const sexta = new Date(pascoa(ano).getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const fixo = (md: string, nome: string) => ({ data: `${ano}-${md}`, nome });
  return [
    fixo("01-01", "Confraternização Universal"),
    { data: sexta, nome: "Sexta-feira Santa" },
    fixo("04-21", "Tiradentes"),
    fixo("05-01", "Dia do Trabalho"),
    fixo("09-07", "Independência"),
    fixo("10-12", "Nossa Senhora Aparecida"),
    fixo("11-02", "Finados"),
    fixo("11-15", "Proclamação da República"),
    fixo("11-20", "Consciência Negra"),
    fixo("12-25", "Natal"),
  ].sort((x, y) => x.data.localeCompare(y.data));
}

export const AVISO_LEGAL =
  "A escala é conferida contra a EC 141/2026, o Decreto 13.173/2026, a Portaria MTE 2.041/2026 e a CLT, conforme publicados até 26/11/2026. " +
  "A jornada de 8h24 depende de liminar do STF ainda não julgada no mérito, e a convenção coletiva da sua base pode ter regras próprias. " +
  "Confirme com o contador ou o sindicato antes de publicar.";
