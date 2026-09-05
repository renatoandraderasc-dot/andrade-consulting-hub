// ============================================================
// Motor 100% deterministico da "Sugestao Analitica" de metas.
// Somente funcoes puras: nada de UI, nada de IA, nada de rede.
// ============================================================

export interface DiaVenda {
  date: string; // YYYY-MM-DD
  vendas: number;
  lucro: number;
  volume: number;
}

export interface MesSerie {
  ym: string; // YYYY-MM
  ano: number;
  mes: number;
  vendas: number;
  lucro: number;
  volume: number;
}

export interface Crescimentos {
  gAno: number;          // YTD atual / YTD ano anterior - 1
  gRecente: number;      // media dos YoY dos 3 ultimos meses fechados
  espelho: MesSerie | null;
  temEspelho: boolean;
  base: number;          // base sazonal usada nos cenarios
  margemEspelhoPct: number;
  volumeEspelho: number;
}

export interface Cenarios {
  conservador: number;
  moderado: number;
  agressivo: number;
}

export const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtPct = (v: number, d = 1) =>
  `${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
export const fmtNum = (v: number, d = 0) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const ym = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;

/** Data de hoje em America/Sao_Paulo (YYYY-MM-DD). */
export function hojeSP(): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(new Date());
}

export function ontemSP(): string {
  const [a, m, d] = hojeSP().split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** Ultimo mes fechado (mes anterior ao mes corrente em SP). */
export function ultimoMesFechado(): { ano: number; mes: number } {
  const [a, m] = hojeSP().split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

/** Proximo mes (default do assistente). */
export function proximoMes(): { ano: number; mes: number } {
  const [a, m] = hojeSP().split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

export const MESES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
export const DOW_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const diasNoMes = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();

/** Dia da semana (0=Dom) de uma data YYYY-MM-DD, sem efeito de fuso. */
export function dowOf(date: string): number {
  const [a, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export interface DiaCalendario {
  date: string;
  dia: number;
  dow: number;
  /** enesima ocorrencia daquele dia-da-semana no mes (1 = primeiro sabado) */
  nth: number;
}

export function calendarioDoMes(ano: number, mes: number): DiaCalendario[] {
  const total = diasNoMes(ano, mes);
  const cont: Record<number, number> = {};
  const out: DiaCalendario[] = [];
  for (let dia = 1; dia <= total; dia++) {
    const date = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const dow = dowOf(date);
    cont[dow] = (cont[dow] ?? 0) + 1;
    out.push({ date, dia, dow, nth: cont[dow] });
  }
  return out;
}

// ------------------------------------------------------------
// Series
// ------------------------------------------------------------

export function serieMensal(dias: DiaVenda[]): MesSerie[] {
  const acc = new Map<string, MesSerie>();
  for (const d of dias) {
    const key = d.date.slice(0, 7);
    const cur = acc.get(key) ?? {
      ym: key,
      ano: Number(key.slice(0, 4)),
      mes: Number(key.slice(5, 7)),
      vendas: 0,
      lucro: 0,
      volume: 0,
    };
    cur.vendas += d.vendas;
    cur.lucro += d.lucro;
    cur.volume += d.volume;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

/** YoY de um mes fechado contra o mesmo mes do ano anterior. */
function yoy(serie: MesSerie[], ano: number, mes: number): number | null {
  const atual = serie.find((s) => s.ano === ano && s.mes === mes);
  const ant = serie.find((s) => s.ano === ano - 1 && s.mes === mes);
  if (!atual || !ant || ant.vendas <= 0) return null;
  return atual.vendas / ant.vendas - 1;
}

export function calcularCrescimentos(
  dias: DiaVenda[],
  alvo: { ano: number; mes: number },
  ytdAtual: number,
  ytdAnterior: number,
): Crescimentos {
  const serie = serieMensal(dias);
  const gAno = ytdAnterior > 0 ? ytdAtual / ytdAnterior - 1 : 0;

  // 3 ultimos meses fechados antes do mes-alvo
  const yoys: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(Date.UTC(alvo.ano, alvo.mes - 1 - i, 1));
    const v = yoy(serie, d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (v !== null) yoys.push(v);
  }
  const gRecente = yoys.length ? yoys.reduce((a, b) => a + b, 0) / yoys.length : gAno;

  const espelho = serie.find((s) => s.ano === alvo.ano - 1 && s.mes === alvo.mes) ?? null;
  const temEspelho = !!espelho && espelho.vendas > 0;

  let base = temEspelho ? espelho!.vendas : 0;
  if (!temEspelho) {
    // media dos 3 ultimos meses fechados disponiveis
    const anteriores: MesSerie[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(Date.UTC(alvo.ano, alvo.mes - 1 - i, 1));
      const s = serie.find((x) => x.ano === d.getUTCFullYear() && x.mes === d.getUTCMonth() + 1);
      if (s) anteriores.push(s);
    }
    base = anteriores.length
      ? anteriores.reduce((a, b) => a + b.vendas, 0) / anteriores.length
      : 0;
  }

  return {
    gAno,
    gRecente,
    espelho,
    temEspelho,
    base,
    margemEspelhoPct: espelho && espelho.vendas > 0 ? (espelho.lucro / espelho.vendas) * 100 : 0,
    volumeEspelho: espelho?.volume ?? 0,
  };
}

export function calcularCenarios(base: number, gAno: number, gRecente: number): Cenarios {
  const min = Math.min(gAno, gRecente);
  const max = Math.max(gAno, gRecente);
  const med = (gAno + gRecente) / 2;
  const pos = (v: number) => (v > 0 ? v : 0);
  return {
    conservador: pos(base * (1 + min)),
    moderado: pos(base * (1 + med)),
    agressivo: pos(base * (1 + max + 0.02)),
  };
}

// ------------------------------------------------------------
// Pesos diarios
// ------------------------------------------------------------

export interface PesoDia extends DiaCalendario {
  peso: number;      // participacao normalizada (0..1)
  origem: "espelho" | "media_dow" | "fallback_8s";
}

/**
 * Espelho posicional: (dia-da-semana, enesima ocorrencia) do mes espelho.
 * Fallback 1: media do dia-da-semana no proprio espelho.
 * Fallback 2: media do dia-da-semana nas ultimas 8 semanas do range recente.
 */
export function calcularPesosDiarios(
  alvo: { ano: number; mes: number },
  diasEspelho: DiaVenda[],
  diasRecentes: DiaVenda[],
): PesoDia[] {
  const cal = calendarioDoMes(alvo.ano, alvo.mes);

  // Mapa do espelho
  const espCal = calendarioDoMes(alvo.ano - 1, alvo.mes);
  const vendaPorData = new Map(diasEspelho.map((d) => [d.date, d.vendas]));
  const porPos = new Map<string, number>();
  const porDow = new Map<number, number[]>();
  for (const c of espCal) {
    const v = vendaPorData.get(c.date) ?? 0;
    porPos.set(`${c.dow}|${c.nth}`, v);
    if (v > 0) porDow.set(c.dow, [...(porDow.get(c.dow) ?? []), v]);
  }
  const mediaDow = (dow: number) => {
    const arr = porDow.get(dow);
    return arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  };

  // Fallback 2: ultimas 8 semanas do range recente
  const recOrd = [...diasRecentes].sort((a, b) => a.date.localeCompare(b.date));
  const ult = recOrd.slice(-56);
  const fbDow = new Map<number, number[]>();
  for (const d of ult) {
    if (d.vendas <= 0) continue;
    const dow = dowOf(d.date);
    fbDow.set(dow, [...(fbDow.get(dow) ?? []), d.vendas]);
  }
  const mediaFb = (dow: number) => {
    const arr = fbDow.get(dow);
    return arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  };

  const brutos = cal.map((c) => {
    const pos = porPos.get(`${c.dow}|${c.nth}`);
    if (pos !== undefined && pos > 0) return { ...c, bruto: pos, origem: "espelho" as const };
    const md = mediaDow(c.dow);
    if (md > 0) return { ...c, bruto: md, origem: "media_dow" as const };
    const fb = mediaFb(c.dow);
    return { ...c, bruto: fb, origem: "fallback_8s" as const };
  });

  let total = brutos.reduce((a, b) => a + b.bruto, 0);
  if (total <= 0) {
    // Sem qualquer historico: distribuicao uniforme
    return brutos.map((b) => ({ ...b, peso: 1 / brutos.length, origem: "fallback_8s" as const }));
  }
  return brutos.map((b) => ({
    date: b.date,
    dia: b.dia,
    dow: b.dow,
    nth: b.nth,
    origem: b.origem,
    peso: b.bruto / total,
  }));
}

export interface AjusteDia {
  fechado?: boolean;
  multiplicador?: number;
  travado?: boolean;
  valor?: number;
}

export interface MetaDia {
  date: string;
  dia: number;
  dow: number;
  peso: number;       // peso efetivo aplicado (%), ja com multiplicador
  meta: number;
  fechado: boolean;
  travado: boolean;
  multiplicador: number;
  origem: PesoDia["origem"];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Distribui a meta mensal pelos dias respeitando travas, fechamentos e
 * multiplicadores. A soma fecha EXATA com metaMes (centavos no ultimo
 * dia nao travado).
 */
export function distribuirMeta(
  pesos: PesoDia[],
  metaMes: number,
  ajustes: Record<string, AjusteDia> = {},
): MetaDia[] {
  const info = pesos.map((p) => {
    const a = ajustes[p.date] ?? {};
    const fechado = !!a.fechado;
    const mult = Number(a.multiplicador) > 0 ? Number(a.multiplicador) : 1;
    const travado = !!a.travado && !fechado;
    return {
      p,
      fechado,
      mult,
      travado,
      valorTravado: travado ? Math.max(0, Number(a.valor) || 0) : 0,
    };
  });

  const somaTravada = info.reduce((a, b) => a + (b.travado ? b.valorTravado : 0), 0);
  const restante = Math.max(0, metaMes - somaTravada);
  const livres = info.filter((i) => !i.travado && !i.fechado);
  const somaPesoLivre = livres.reduce((a, b) => a + b.p.peso * b.mult, 0);

  const out: MetaDia[] = info.map((i) => {
    let meta = 0;
    if (i.travado) meta = i.valorTravado;
    else if (i.fechado) meta = 0;
    else if (somaPesoLivre > 0) meta = round2((restante * (i.p.peso * i.mult)) / somaPesoLivre);
    return {
      date: i.p.date,
      dia: i.p.dia,
      dow: i.p.dow,
      peso: metaMes > 0 ? 0 : 0, // preenchido abaixo
      meta,
      fechado: i.fechado,
      travado: i.travado,
      multiplicador: i.mult,
      origem: i.p.origem,
    };
  });

  // Ajuste de centavos no ultimo dia nao travado e nao fechado
  const soma = out.reduce((a, b) => a + b.meta, 0);
  const diff = round2(metaMes - soma);
  if (Math.abs(diff) >= 0.01) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (!out[i].travado && !out[i].fechado) {
        out[i].meta = round2(out[i].meta + diff);
        break;
      }
    }
  }

  const totalFinal = out.reduce((a, b) => a + b.meta, 0);
  for (const d of out) d.peso = totalFinal > 0 ? (d.meta / totalFinal) * 100 : 0;
  return out;
}

// ------------------------------------------------------------
// Feriados
// ------------------------------------------------------------

const FIXOS: [number, number, string][] = [
  [1, 1, "Confraternização Universal"],
  [4, 21, "Tiradentes"],
  [5, 1, "Dia do Trabalho"],
  [9, 7, "Independência"],
  [10, 12, "Nossa Senhora Aparecida"],
  [11, 2, "Finados"],
  [11, 15, "Proclamação da República"],
  [11, 20, "Consciência Negra"],
  [12, 25, "Natal"],
];

const MOVEIS: Record<number, [number, number, string][]> = {
  2026: [
    [2, 16, "Carnaval"],
    [2, 17, "Carnaval"],
    [4, 3, "Sexta-feira Santa"],
    [6, 4, "Corpus Christi"],
  ],
  2027: [
    [2, 8, "Carnaval"],
    [2, 9, "Carnaval"],
    [3, 26, "Sexta-feira Santa"],
    [5, 27, "Corpus Christi"],
  ],
};

export interface Feriado { date: string; nome: string; movel: boolean }

export function feriadosDoMes(ano: number, mes: number): Feriado[] {
  const iso = (d: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const out: Feriado[] = FIXOS.filter(([m]) => m === mes).map(([, d, nome]) => ({
    date: iso(d), nome, movel: false,
  }));
  for (const [m, d, nome] of MOVEIS[ano] ?? []) {
    if (m === mes) out.push({ date: iso(d), nome, movel: true });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Feriados moveis que existiam no mes espelho e mudaram de data. */
export function alertasFeriadosMoveis(ano: number, mes: number): string[] {
  const alvo = feriadosDoMes(ano, mes).filter((f) => f.movel);
  const esp = feriadosDoMes(ano - 1, mes).filter((f) => f.movel);
  const msgs: string[] = [];
  for (const e of esp) {
    const igual = alvo.find((a) => a.nome === e.nome && a.date.slice(5) === e.date.slice(5));
    if (!igual) {
      msgs.push(
        `No ano passado ${e.nome} caiu em ${e.date.slice(8, 10)}/${e.date.slice(5, 7)} e neste ano não cai na mesma data — revise os multiplicadores desses dias.`,
      );
    }
  }
  for (const a of alvo) {
    const existia = esp.find((e) => e.nome === a.nome);
    if (!existia) {
      msgs.push(
        `${a.nome} (${a.date.slice(8, 10)}/${a.date.slice(5, 7)}) não existia no mês espelho — revise o multiplicador desse dia.`,
      );
    }
  }
  return [...new Set(msgs)];
}
