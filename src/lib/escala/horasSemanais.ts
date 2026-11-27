// Horas trabalhadas por semana na grade mensal.
// Espelha exatamente o cálculo do motor (horarioDe + duracaoBruta em escala-motor.ts),
// apenas agrupando por semana em vez de somar o mês inteiro.
import { dataParaNum, diaSemana, hhmmParaMin, type Turno } from './escala-motor';

/** Aceita tanto Alocacao do motor quanto a linha vinda do banco. */
export interface AlocacaoParaHoras {
  funcionario_id: string;
  data: string;
  status: string;
  turno_id?: string | null;
  inicio?: string | null;
  fim?: string | null;
  intervalo_min?: number | null;
}

export interface SemanaInfo {
  inicio: number; // nº do dia (dias desde a época) do primeiro dia da semana
  rotulo: string; // "Sem 1", "Sem 2"...
}

/** Semanas tocadas pelo mês, na ordem, respeitando em que dia a semana começa. */
export function semanasDoMes(dias: number[], semanaInicia: 0 | 1): SemanaInfo[] {
  const inicios = [...new Set(dias.map((n) => n - ((diaSemana(n) - semanaInicia + 7) % 7)))].sort((a, b) => a - b);
  return inicios.map((inicio, i) => ({ inicio, rotulo: `Sem ${i + 1}` }));
}

/**
 * Minutos líquidos trabalhados por funcionário × semana (chave = primeiro dia da semana).
 * Só contam dias do mês com status TRABALHO e horário definido (turno ou horário próprio),
 * descontando o intervalo — igual ao motor.
 */
export function minutosPorSemanaPorFuncionario(
  dias: number[],
  alocacoes: AlocacaoParaHoras[],
  turnos: Turno[],
  semanaInicia: 0 | 1,
): Map<string, Map<number, number>> {
  const turnoMap = new Map(turnos.map((t) => [t.id, t]));
  const diasMes = new Set(dias);
  const resultado = new Map<string, Map<number, number>>();
  for (const a of alocacoes) {
    if (a.status !== 'TRABALHO') continue;
    const n = dataParaNum(a.data);
    if (!diasMes.has(n)) continue;
    const t = a.turno_id ? turnoMap.get(a.turno_id) : undefined;
    const ini = a.inicio ?? t?.inicio;
    const fim = a.fim ?? t?.fim;
    if (!ini || !fim) continue;
    const i = hhmmParaMin(ini);
    let f = hhmmParaMin(fim);
    if (f <= i) f += 1440; // vira a noite
    const liquido = f - i - (a.intervalo_min ?? t?.intervalo_min ?? 0);
    if (liquido <= 0) continue;
    const ws = n - ((diaSemana(n) - semanaInicia + 7) % 7);
    let porSemana = resultado.get(a.funcionario_id);
    if (!porSemana) {
      porSemana = new Map();
      resultado.set(a.funcionario_id, porSemana);
    }
    porSemana.set(ws, (porSemana.get(ws) || 0) + liquido);
  }
  return resultado;
}
