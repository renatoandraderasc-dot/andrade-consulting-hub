export type Cadencia = "diaria" | "semanal" | "mensal";
export type JornadaStatus = "a_fazer" | "em_andamento" | "concluida";

const pad = (n: number) => String(n).padStart(2, "0");

/** Data de "hoje" no fuso de São Paulo, representada como Date UTC ao meio-dia. */
export function hojeSP(): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function addDias(base: Date, dias: number) {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

export function addMeses(base: Date, meses: number) {
  const d = new Date(base.getTime());
  d.setUTCMonth(d.getUTCMonth() + meses, 1);
  return d;
}

export function fmtBR(d: Date) {
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function fmtDiaMes(d: Date) {
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
}

/** Segunda-feira da semana ISO. */
export function inicioSemana(d: Date) {
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  return addDias(d, -dow);
}

export function semanaISO(d: Date): { ano: number; semana: number } {
  const alvo = new Date(d.getTime());
  const dow = (alvo.getUTCDay() + 6) % 7;
  alvo.setUTCDate(alvo.getUTCDate() - dow + 3); // quinta da semana
  const ano = alvo.getUTCFullYear();
  const primeiraQuinta = new Date(Date.UTC(ano, 0, 4, 12));
  const dowJan4 = (primeiraQuinta.getUTCDay() + 6) % 7;
  primeiraQuinta.setUTCDate(primeiraQuinta.getUTCDate() - dowJan4 + 3);
  const semana =
    1 + Math.round((alvo.getTime() - primeiraQuinta.getTime()) / (7 * 86400000));
  return { ano, semana };
}

export function periodoRef(cad: Cadencia, ancora: Date): string {
  if (cad === "diaria") {
    return `${ancora.getUTCFullYear()}-${pad(ancora.getUTCMonth() + 1)}-${pad(ancora.getUTCDate())}`;
  }
  if (cad === "semanal") {
    const { ano, semana } = semanaISO(ancora);
    return `${ano}-W${pad(semana)}`;
  }
  return `${ancora.getUTCFullYear()}-${pad(ancora.getUTCMonth() + 1)}`;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function periodoLabel(cad: Cadencia, ancora: Date): string {
  if (cad === "diaria") return fmtBR(ancora);
  if (cad === "semanal") {
    const ini = inicioSemana(ancora);
    const fim = addDias(ini, 6);
    const { semana } = semanaISO(ancora);
    return `Semana ${semana} · ${fmtDiaMes(ini)}–${fmtDiaMes(fim)}`;
  }
  return `${MESES[ancora.getUTCMonth()]}/${ancora.getUTCFullYear()}`;
}

export function navegar(cad: Cadencia, ancora: Date, passo: number): Date {
  if (cad === "diaria") return addDias(ancora, passo);
  if (cad === "semanal") return addDias(ancora, passo * 7);
  return addMeses(ancora, passo);
}

export const CADENCIA_LABEL: Record<Cadencia, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
};

export const CADENCIA_CLASS: Record<Cadencia, string> = {
  diaria: "bg-blue-100 text-blue-800",
  semanal: "bg-amber-100 text-amber-800",
  mensal: "bg-violet-100 text-violet-800",
};

export const STATUS_LABEL: Record<JornadaStatus, string> = {
  a_fazer: "A Fazer",
  em_andamento: "Em Andamento",
  concluida: "Concluída",
};

export const JORNADA_COR = "#CA3155";
