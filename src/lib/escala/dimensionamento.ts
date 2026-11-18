/**
 * Dimensionamento de quadro — módulo Escala
 * ------------------------------------------------------------------
 * A partir de três entradas simples (quantidade de pessoas por setor,
 * horário de funcionamento e venda por hora do ERP) calcula:
 *   - quantos postos cada setor precisa em cada hora da semana;
 *   - quantas pessoas são necessárias em cada marco legal (44h/42h/40h);
 *   - se é preciso contratar e em que faixa de horário aperta;
 *   - turnos e cobertura mínima para alimentar o gerador de escala.
 *
 * Arquivo puro (sem Supabase, sem React): as regras legais continuam
 * no escala-motor.ts, que NÃO é alterado. Aqui só há conta de horas.
 *
 * Premissa central: o quadro informado entrega hoje o nível de
 * atendimento que a loja considera aceitável. As horas que ele entrega
 * na jornada de referência viram a demanda; quando o limite semanal
 * cai, a mesma demanda exige mais gente. Opcionalmente a demanda pode
 * vir de uma meta de produtividade (venda por pessoa-hora).
 */

export interface HorarioDia {
  /** 'HH:MM' ou null quando a loja não abre no dia. */
  abre: string | null;
  fecha: string | null;
}
/** Índice 0 = domingo ... 6 = sábado. */
export type HorarioSemana = HorarioDia[];

export interface EntradaSetor {
  departamento: string;
  quantidade: number;
  /** Mínimo de pessoas enquanto a loja está aberta (padrão 1). */
  minimo?: number;
  /** Meta opcional de venda por pessoa-hora; vazio = manter o nível atual. */
  venda_por_pessoa_hora_alvo?: number | null;
}

export interface MarcoDim {
  rotulo: string;
  horas_semanais: number;
  folgas_semanais: number;
  vigencia_inicio?: string;
}

export interface LinhaVenda {
  /** 'YYYY-MM-DD' */
  data: string;
  hora: number;
  /** Nome do departamento/seção como veio do ERP. */
  departamento: string;
  valor: number;
}

export type Origem = "proprio" | "loja" | "uniforme";

/** valor[dia_semana][hora] = venda média daquele dia da semana naquela hora. */
export type Grade = number[][];

export interface CurvaVendas {
  loja: Grade;
  porSetor: Record<string, Grade>;
  /** Quantas datas distintas de cada dia da semana entraram na média. */
  amostras: number[];
  dias: number;
}

export interface NecessidadeMarco {
  marco: MarcoDim;
  /** Pessoas em tempo integral necessárias, com decimal (ex.: 12,6). */
  exato: number;
  /** `exato` arredondado para cima: quadro do setor se ele não dividir gente com outro. */
  necessario: number;
  /** necessario - quantidade (inteiro). */
  diferenca: number;
  /** exato - quantidade: positivo = falta, negativo = sobra. */
  falta_pessoas: number;
  /** A mesma falta em horas de trabalho por semana. */
  falta_horas: number;
}

export interface Aperto {
  dia_semana: number;
  hora_inicio: number;
  hora_fim: number; // exclusivo
}

export interface ResultadoSetor {
  departamento: string;
  quantidade: number;
  minimo: number;
  origem: Origem;
  horas_abertas: number;
  /** Horas de posto necessárias por semana. */
  demanda_horas: number;
  /** true quando o mínimo por hora aberta, sozinho, já passa do que o quadro entrega. */
  piso_domina: boolean;
  /** postos[dia_semana][hora] (decimal; arredonde para exibir). */
  postos: Grade;
  venda_semanal: number;
  /** Venda por pessoa-hora hoje (só quando há venda atribuída ao setor). */
  produtividade_atual: number | null;
  marcos: NecessidadeMarco[];
  aperto: Aperto | null;
}

export interface OpcoesDim {
  /** Jornada semanal para a qual o quadro informado foi montado (ex.: 44). */
  horas_referencia: number;
  marcos: MarcoDim[];
  /** Fração de horas perdidas com férias e faltas (padrão 0,10). */
  reserva?: number;
}

export interface ResultadoDim {
  setores: ResultadoSetor[];
  /** Totais por marco, na mesma ordem de opcoes.marcos. */
  totais: {
    marco: MarcoDim;
    quadro: number;
    /** soma dos quadros arredondados setor a setor */
    necessario: number;
    /** soma exata, em pessoas de tempo integral */
    necessario_exato: number;
    /** contratações se os setores puderem dividir pessoas (soma das faltas, arredondada para cima) */
    contratar: number;
    /** contratações arredondando cada setor para cima, sem dividir ninguém */
    contratar_por_setor: number;
    falta_horas: number;
  }[];
}

// ============================================================ utilitários

const HORAS = 24;
/** Falta menor que isto (em pessoas) é tratada como quadro suficiente. */
export const TOLERANCIA = 0.05;
export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function gradeVazia(): Grade {
  return Array.from({ length: 7 }, () => Array<number>(HORAS).fill(0));
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Fração (0..1) de cada hora do dia em que a loja está aberta. */
export function fracaoAberta(dia: HorarioDia | undefined): number[] {
  const f = Array<number>(HORAS).fill(0);
  if (!dia?.abre || !dia.fecha) return f;
  const a = minutos(dia.abre);
  let b = minutos(dia.fecha);
  if (b <= a) b = 1440; // fecha à meia-noite ou depois: conta até o fim do dia
  for (let h = 0; h < HORAS; h++) {
    const ini = Math.max(a, h * 60);
    const fim = Math.min(b, (h + 1) * 60);
    if (fim > ini) f[h] = (fim - ini) / 60;
  }
  return f;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** Setor da escala que corresponde a um departamento do ERP (ou null = só entra no total da loja). */
export function setorDoErp(nome: string): string | null {
  const n = semAcento(nome);
  if (/ACOUG|CARNE|PEIX|AVES/.test(n)) return "Açougue";
  if (/PADAR|\bPAD\b|CONFEIT|PANIF/.test(n)) return "Padaria";
  if (/HORTI|FLV|FRUTA|VERDUR|LEGUME/.test(n)) return "Hortifruti";
  if (/FRIOS|FIAMBR|FRIAMBR|LATIC|ROTISS|PERECIV/.test(n)) return "Frios";
  return null;
}

const UNIFORMES = /RECEB|PREVEN|ADMIN|LIMPEZA|ESCRIT|RH|DEPOSITO|MANUTEN/;

/** Qual curva dirige o setor: venda do próprio setor, venda total da loja, ou nenhuma. */
export function origemDoSetor(departamento: string, curva: CurvaVendas | null): Origem {
  if (UNIFORMES.test(semAcento(departamento))) return "uniforme";
  if (!curva || curva.dias === 0) return "uniforme";
  const proprio = setorDoErp(departamento);
  if (proprio && soma(curva.porSetor[proprio]) > 0) return "proprio";
  return soma(curva.loja) > 0 ? "loja" : "uniforme";
}

function soma(g: Grade | undefined): number {
  if (!g) return 0;
  let s = 0;
  for (const d of g) for (const v of d) s += v;
  return s;
}

function diaSemanaDe(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

/** Converte as linhas do relatório em venda MÉDIA por dia da semana × hora. */
export function montarCurva(linhas: LinhaVenda[]): CurvaVendas {
  const datasPorDia: Set<string>[] = Array.from({ length: 7 }, () => new Set<string>());
  const loja = gradeVazia();
  const porSetor: Record<string, Grade> = {};
  for (const l of linhas) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(l.data) || !(l.hora >= 0 && l.hora < HORAS) || !isFinite(l.valor)) continue;
    const dow = diaSemanaDe(l.data.slice(0, 10));
    const h = Math.floor(l.hora);
    datasPorDia[dow].add(l.data.slice(0, 10));
    loja[dow][h] += l.valor;
    const setor = setorDoErp(l.departamento);
    if (setor) {
      porSetor[setor] ??= gradeVazia();
      porSetor[setor][dow][h] += l.valor;
    }
  }
  const amostras = datasPorDia.map((s) => s.size);
  const media = (g: Grade) => g.map((d, dow) => d.map((v) => (amostras[dow] ? v / amostras[dow] : 0)));
  return {
    loja: media(loja),
    porSetor: Object.fromEntries(Object.entries(porSetor).map(([k, g]) => [k, media(g)])),
    amostras,
    dias: amostras.reduce((a, b) => a + b, 0),
  };
}

// ============================================================ cálculo

/**
 * Reparte `total` horas de posto pelas horas abertas: piso em toda hora
 * aberta, o restante proporcional ao peso, sem passar de `teto` pessoas
 * ao mesmo tempo (o excesso de um pico escorre para as outras horas —
 * turno é bloco de horas, ninguém é escalado só para a hora mais cheia).
 */
function distribuir(total: number, pesos: Grade, aberta: Grade, minimo: number, teto = Infinity): Grade {
  const out = aberta.map((d) => d.map((f) => f * minimo));
  let restante = Math.max(0, total - soma(out));
  const travada = aberta.map((d) => d.map((f) => f <= 0));
  for (let volta = 0; volta < 40 && restante > 1e-9; volta++) {
    let sp = 0;
    pesos.forEach((d, dow) => d.forEach((p, h) => { if (!travada[dow][h]) sp += p; }));
    if (sp <= 0) break;
    let usado = 0;
    let travou = false;
    for (let dow = 0; dow < 7; dow++) for (let h = 0; h < HORAS; h++) {
      if (travada[dow][h]) continue;
      const limite = Math.max(minimo, teto) * aberta[dow][h];
      const quer = out[dow][h] + (restante * pesos[dow][h]) / sp;
      if (quer >= limite) { usado += Math.max(0, limite - out[dow][h]); out[dow][h] = Math.max(out[dow][h], limite); travada[dow][h] = true; travou = true; }
    }
    if (!travou) {
      for (let dow = 0; dow < 7; dow++) for (let h = 0; h < HORAS; h++) if (!travada[dow][h]) out[dow][h] += (restante * pesos[dow][h]) / sp;
      restante = 0;
    } else restante -= usado;
  }
  if (restante > 1e-9) {
    // sem peso nas horas livres: espalha por igual onde ainda cabe gente;
    // se nada cabe (demanda maior que o teto), espalha em todas as horas abertas
    const limite = (dow: number, h: number) => Math.max(minimo, teto) * aberta[dow][h];
    for (const respeitaTeto of [true, false]) {
      if (restante <= 1e-9) break;
      let folga = 0;
      aberta.forEach((d, dow) => d.forEach((f, h) => { folga += respeitaTeto ? Math.max(0, limite(dow, h) - out[dow][h]) : f; }));
      if (folga <= 1e-9) continue;
      const usar = respeitaTeto ? Math.min(restante, folga) : restante;
      aberta.forEach((d, dow) => d.forEach((f, h) => {
        const parte = respeitaTeto ? Math.max(0, limite(dow, h) - out[dow][h]) : f;
        out[dow][h] += (usar * parte) / folga;
      }));
      restante -= usar;
    }
  }
  return out;
}

function acharAperto(deficit: Grade): Aperto | null {
  let melhorDia = -1;
  let melhorSoma = 0;
  deficit.forEach((d, dow) => {
    const s = d.reduce((a, v) => a + Math.max(0, v), 0);
    if (s > melhorSoma + 1e-9) { melhorSoma = s; melhorDia = dow; }
  });
  if (melhorDia < 0) return null;
  const linha = deficit[melhorDia];
  const pico = Math.max(...linha);
  if (pico <= 1e-9) return null;
  const hPico = linha.indexOf(pico);
  let ini = hPico;
  let fim = hPico;
  while (ini > 0 && linha[ini - 1] >= pico * 0.6) ini--;
  while (fim < HORAS - 1 && linha[fim + 1] >= pico * 0.6) fim++;
  // falta espalhada pelo dia inteiro não é "aperto": não há faixa para destacar
  if (fim + 1 - ini >= 8) return null;
  return { dia_semana: melhorDia, hora_inicio: ini, hora_fim: fim + 1 };
}

export function dimensionar(
  setores: EntradaSetor[],
  horario: HorarioSemana,
  curva: CurvaVendas | null,
  opcoes: OpcoesDim,
): ResultadoDim {
  const reserva = Math.min(0.5, Math.max(0, opcoes.reserva ?? 0.1));
  const util = 1 - reserva;
  const aberta: Grade = Array.from({ length: 7 }, (_, dow) => fracaoAberta(horario[dow]));
  const horasAbertas = soma(aberta);

  const resultado: ResultadoSetor[] = setores
    .filter((s) => s.departamento.trim())
    .map((s) => {
      const quantidade = Math.max(0, Math.floor(s.quantidade || 0));
      const minimo = Math.max(0, Math.floor(s.minimo ?? 1));
      const origem = origemDoSetor(s.departamento, curva);
      const proprio = setorDoErp(s.departamento);
      const base: Grade =
        origem === "proprio" && curva && proprio ? curva.porSetor[proprio]
        : origem === "loja" && curva ? curva.loja
        : aberta;
      // só conta venda dentro do horário de funcionamento
      const pesos = base.map((d, dow) => d.map((v, h) => (aberta[dow][h] > 0 ? Math.max(0, v) * (origem === "uniforme" ? 1 : aberta[dow][h]) : 0)));
      const pesosValidos = soma(pesos) > 0 ? pesos : aberta;

      const vendaSemanal = origem === "proprio" ? soma(pesos) : 0;
      const entregaHoje = quantidade * opcoes.horas_referencia * util;
      const alvo = s.venda_por_pessoa_hora_alvo && s.venda_por_pessoa_hora_alvo > 0 && vendaSemanal > 0 ? s.venda_por_pessoa_hora_alvo : null;
      const base_horas = alvo ? vendaSemanal / alvo : entregaHoje;
      const pisoHoras = minimo * horasAbertas;
      const demanda = quantidade === 0 && !alvo ? 0 : Math.max(base_horas, pisoHoras);
      // ao mesmo tempo nunca há mais gente que o quadro equivalente presente num dia
      const marcoRef = opcoes.marcos.find((m) => m.horas_semanais === opcoes.horas_referencia);
      const diasRef = 7 - (marcoRef?.folgas_semanais ?? 2);
      const teto = Math.max(1, (demanda / (opcoes.horas_referencia * util)) * (diasRef / 7));
      const postos = demanda > 0 ? distribuir(demanda, pesosValidos, aberta, minimo, teto) : gradeVazia();

      const marcos = opcoes.marcos.map((marco): NecessidadeMarco => {
        const exato = demanda / (marco.horas_semanais * util);
        const necessario = Math.ceil(exato - 1e-6);
        const falta = exato - quantidade;
        return { marco, exato, necessario, diferenca: necessario - quantidade, falta_pessoas: falta, falta_horas: falta * marco.horas_semanais * util };
      });

      // onde aperta: compara o necessário com o que o quadro atual entrega no último marco
      const ultimo = opcoes.marcos[opcoes.marcos.length - 1];
      let aperto: Aperto | null = null;
      if (ultimo && demanda > 0) {
        const possivel = quantidade * ultimo.horas_semanais * util;
        if (possivel < demanda - 1e-6) {
          const atual = distribuir(possivel, pesosValidos, aberta, Math.min(minimo, horasAbertas ? possivel / horasAbertas : 0), teto);
          aperto = acharAperto(postos.map((d, dow) => d.map((v, h) => v - atual[dow][h])));
        }
      }

      return {
        departamento: s.departamento.trim(), quantidade, minimo, origem,
        horas_abertas: horasAbertas, demanda_horas: demanda,
        piso_domina: pisoHoras > base_horas + 1e-6 && demanda > 0,
        postos, venda_semanal: vendaSemanal,
        produtividade_atual: vendaSemanal > 0 && quantidade > 0 ? vendaSemanal / (quantidade * opcoes.horas_referencia * util) : null,
        marcos, aperto,
      };
    });

  const totais = opcoes.marcos.map((marco, i) => {
    const quadro = resultado.reduce((a, s) => a + s.quantidade, 0);
    const necessario = resultado.reduce((a, s) => a + s.marcos[i].necessario, 0);
    const faltas = resultado.reduce((a, s) => a + Math.max(0, s.marcos[i].falta_pessoas), 0);
    return {
      marco, quadro, necessario,
      necessario_exato: resultado.reduce((a, s) => a + s.marcos[i].exato, 0),
      contratar: Math.max(0, Math.ceil(faltas - TOLERANCIA)),
      contratar_por_setor: resultado.reduce((a, s) => a + Math.max(0, s.marcos[i].diferenca), 0),
      falta_horas: resultado.reduce((a, s) => a + Math.max(0, s.marcos[i].falta_horas), 0),
    };
  });
  return { setores: resultado, totais };
}

// ============================================================ leitura em texto

const hLabel = (h: number) => `${h}h`;

/** Frase curta, em linguagem de loja, para cada setor no marco escolhido. */
export function lerSetor(s: ResultadoSetor, indiceMarco: number): string {
  const m = s.marcos[indiceMarco];
  if (!m) return "";
  if (s.quantidade === 0 && m.necessario === 0) return `${s.departamento}: sem pessoas informadas.`;
  const partes: string[] = [];
  const dec = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (m.falta_pessoas > TOLERANCIA) {
    partes.push(`${s.departamento}: faltam ${Math.round(m.falta_horas)}h por semana, o mesmo que ${dec(m.falta_pessoas)} pessoa (tem ${s.quantidade}, precisa de ${dec(m.exato)} com ${m.marco.horas_semanais}h)`);
    if (s.aperto) partes.push(`aperta mais ${DIAS_SEMANA[s.aperto.dia_semana].toLowerCase()} das ${hLabel(s.aperto.hora_inicio)} às ${hLabel(s.aperto.hora_fim)}`);
    if (s.piso_domina) partes.push(`o mínimo de ${s.minimo} por hora aberta já exige esse quadro`);
  } else if (m.falta_pessoas < -TOLERANCIA) {
    partes.push(`${s.departamento}: quadro cobre com folga de ${dec(-m.falta_pessoas)} pessoa (tem ${s.quantidade}, precisa de ${dec(m.exato)} com ${m.marco.horas_semanais}h)`);
  } else {
    partes.push(`${s.departamento}: quadro de ${s.quantidade} é suficiente com ${m.marco.horas_semanais}h`);
  }
  if (s.origem === "uniforme") partes.push("sem curva de venda, horas divididas por igual");
  return `${partes.join("; ")}.`;
}

// ============================================================ turnos e cobertura

export interface TurnoSugerido {
  departamento: string;
  codigo: string;
  nome: string;
  inicio: string;
  fim: string;
  intervalo_min: number;
  pessoas: number;
}

export interface CoberturaSugerida {
  departamento: string;
  dia_semana: number;
  minimo: number;
}

export interface PlanoSetor {
  departamento: string;
  turnos: TurnoSugerido[];
  cobertura: CoberturaSugerida[];
  avisos: string[];
}

export function siglaSetor(departamento: string): string {
  const palavras = semAcento(departamento).replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter((p) => p.length > 2 || /\d/.test(p));
  if (palavras.length >= 2) return palavras.slice(0, 3).map((p) => p[0]).join("");
  return (palavras[0] || "SET").slice(0, 3);
}

function hamilton(total: number, pesos: number[], minimoCada: number): number[] {
  const n = pesos.length;
  if (!n) return [];
  const base = Array<number>(n).fill(total >= n * minimoCada ? minimoCada : 0);
  let resto = total - base.reduce((a, b) => a + b, 0);
  if (resto <= 0) {
    // menos pessoas que grupos: dá 1 para os de maior peso
    const ordem = pesos.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]);
    const out = Array<number>(n).fill(0);
    for (let k = 0; k < Math.min(total, n); k++) out[ordem[k][1]] = 1;
    return out;
  }
  const sp = pesos.reduce((a, b) => a + b, 0);
  const cotas = pesos.map((p) => (sp > 0 ? (resto * p) / sp : resto / n));
  const pisos = cotas.map(Math.floor);
  resto -= pisos.reduce((a, b) => a + b, 0);
  const ordem = cotas.map((c, i) => [c - Math.floor(c), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < resto; k++) pisos[ordem[k % n][1]]++;
  return base.map((b, i) => b + pisos[i]);
}

/**
 * Turnos e cobertura mínima para o quadro ATUAL (o que dá para cumprir),
 * prontos para gravar em escala_turnos / escala_cobertura.
 */
export function planejarSetor(
  s: ResultadoSetor,
  horario: HorarioSemana,
  marco: MarcoDim,
  opcoes: { intervalo_min?: number; reserva?: number } = {},
): PlanoSetor {
  const intervalo = opcoes.intervalo_min ?? 60;
  const reserva = opcoes.reserva ?? 0.1;
  const avisos: string[] = [];
  const diasTrab = 7 - marco.folgas_semanais;
  const liquida = Math.round((marco.horas_semanais * 60) / diasTrab);
  const bruta = liquida + intervalo;
  const sigla = siglaSetor(s.departamento);
  const plano: PlanoSetor = { departamento: s.departamento, turnos: [], cobertura: [], avisos };
  if (s.quantidade <= 0) return plano;

  // janela mais comum da semana
  const contagem = new Map<string, number>();
  horario.forEach((d) => { if (d?.abre && d.fecha) contagem.set(`${d.abre}|${d.fecha}`, (contagem.get(`${d.abre}|${d.fecha}`) || 0) + 1); });
  const principal = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!principal) { avisos.push("Loja sem horário de funcionamento informado."); return plano; }
  const [abre, fecha] = principal[0].split("|");
  const a = minutos(abre);
  let f = minutos(fecha);
  if (f <= a) f = 1440;
  const janela = f - a;

  // demanda média por hora (todos os dias) para repartir as pessoas entre os turnos
  const porHora = Array.from({ length: HORAS }, (_, h) => s.postos.reduce((acc, d) => acc + d[h], 0));
  const cargaNoTurno = (ini: number, fim: number) => {
    let c = 0;
    for (let h = 0; h < HORAS; h++) {
      const o = Math.min(fim, (h + 1) * 60) - Math.max(ini, h * 60);
      if (o > 0) c += porHora[h] * (o / 60);
    }
    return c;
  };

  type Faixa = { sufixo: string; nome: string; ini: number; fim: number };
  const faixas: Faixa[] = [];
  if (janela <= bruta) {
    faixas.push({ sufixo: "U", nome: "Único", ini: a, fim: f });
    if (janela < bruta) avisos.push(`A loja abre ${Math.floor(janela / 60)}h${String(janela % 60).padStart(2, "0")} e a jornada com intervalo tem ${Math.floor(bruta / 60)}h${String(bruta % 60).padStart(2, "0")}: o turno ficou do tamanho do horário de funcionamento.`);
  } else {
    faixas.push({ sufixo: "A", nome: "Abertura", ini: a, fim: a + bruta });
    if (s.quantidade >= 2) faixas.push({ sufixo: "F", nome: "Fechamento", ini: f - bruta, fim: f });
    else avisos.push("Com 1 pessoa só há turno de abertura: parte do horário fica sem ninguém do setor.");
    if (s.quantidade >= 3 && janela - bruta >= 120) {
      // intermediário no meio da janela: pega o fim da manhã e o começo da noite
      const ini = Math.round((a + (janela - bruta) / 2) / 30) * 30;
      faixas.splice(1, 0, { sufixo: "I", nome: "Intermediário", ini, fim: ini + bruta });
    }
    if (janela > 2 * bruta && !faixas.some((x) => x.sufixo === "I") && s.quantidade < 3) avisos.push("O horário de funcionamento é maior que dois turnos: há um vão sem cobertura no meio do dia.");
  }

  const pessoas = hamilton(s.quantidade, faixas.map((x) => cargaNoTurno(x.ini, x.fim) || 1), 1);
  plano.turnos = faixas.map((x, i) => ({
    departamento: s.departamento,
    codigo: `${sigla}-${x.sufixo}`,
    nome: `${s.departamento} · ${x.nome}`,
    inicio: hhmm(x.ini), fim: hhmm(x.fim), intervalo_min: x.fim - x.ini > 360 ? intervalo : x.fim - x.ini > 240 ? 15 : 0,
    pessoas: pessoas[i],
  })).filter((t) => t.pessoas > 0);

  // dias com horário diferente do principal
  horario.forEach((d, dow) => {
    if (!d?.abre || !d.fecha) return;
    if (`${d.abre}|${d.fecha}` !== principal[0]) avisos.push(`${DIAS_SEMANA[dow]} abre ${d.abre}–${d.fecha}, diferente do restante: ajuste o horário desse dia na célula da escala.`);
  });

  // cobertura: pessoas-dia que o quadro entrega, repartidas pelos dias conforme o movimento
  const pessoasDia = Math.floor(s.quantidade * diasTrab * (1 - reserva));
  const cargaDia = s.postos.map((d) => d.reduce((x, v) => x + v, 0));
  const abertos = cargaDia.map((c, dow) => (horario[dow]?.abre && horario[dow]?.fecha ? Math.max(c, 1e-6) : 0));
  const nAbertos = abertos.filter((c) => c > 0).length;
  if (nAbertos) {
    const idx = abertos.map((c, dow) => (c > 0 ? dow : -1)).filter((d) => d >= 0);
    const dist = hamilton(pessoasDia, idx.map((dow) => abertos[dow]), Math.min(1, Math.floor(pessoasDia / nAbertos)));
    plano.cobertura = idx.map((dow, i) => ({ departamento: s.departamento, dia_semana: dow, minimo: Math.min(dist[i], s.quantidade) }));
  }
  return plano;
}
