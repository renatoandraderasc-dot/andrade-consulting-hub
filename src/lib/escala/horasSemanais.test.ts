import { describe, expect, it } from 'vitest';
import { diasDoMes, dataParaNum, type Alocacao, type Turno } from './escala-motor';
import { semanasDoMes, minutosPorSemanaPorFuncionario } from './horasSemanais';

// Novembro/2026: dia 1 = domingo, dia 30 = segunda.
const DIAS = diasDoMes(2026, 11);
const TURNO: Turno = { id: 't1', codigo: 'A', inicio: '08:00', fim: '17:00', intervalo_min: 60, ativo: true, cor: '#000' } as Turno;
const NOTURNO: Turno = { id: 't2', codigo: 'N', inicio: '22:00', fim: '06:00', intervalo_min: 0, ativo: true, cor: '#000' } as Turno;

const aloc = (func: string, data: string, extra: Partial<Alocacao> = {}): Alocacao =>
  ({ funcionario_id: func, data, status: 'TRABALHO', turno_id: 't1', origem: 'auto', ...extra }) as Alocacao;

describe('semanasDoMes', () => {
  it('com semana começando na segunda, novembro/2026 tem 6 semanas', () => {
    const sem = semanasDoMes(DIAS, 1);
    expect(sem.length).toBe(6);
    expect(sem[0].rotulo).toBe('Sem 1');
    expect(sem[0].inicio).toBe(dataParaNum('2026-10-26')); // semana de segunda que só toca o domingo 1/11
    expect(sem[1].inicio).toBe(dataParaNum('2026-11-02')); // 2 a 8/11
    expect(sem[5].inicio).toBe(dataParaNum('2026-11-30'));
  });
  it('com semana começando no domingo, novembro/2026 tem 5 semanas', () => {
    const sem = semanasDoMes(DIAS, 0);
    expect(sem.length).toBe(5);
    expect(sem[0].inicio).toBe(dataParaNum('2026-11-01'));
    expect(sem[4].inicio).toBe(dataParaNum('2026-11-29'));
  });
});

describe('minutosPorSemanaPorFuncionario', () => {
  it('soma o líquido do turno por semana (08–17 com 1h de intervalo = 480min/dia)', () => {
    const alocacoes = [
      aloc('f1', '2026-11-02'), aloc('f1', '2026-11-03'), aloc('f1', '2026-11-04'), aloc('f1', '2026-11-05'), aloc('f1', '2026-11-06'), // sem 2
      aloc('f1', '2026-11-09'), aloc('f1', '2026-11-10'), // sem 3
    ];
    const r = minutosPorSemanaPorFuncionario(DIAS, alocacoes, [TURNO], 1);
    const f1 = r.get('f1')!;
    expect(f1.get(dataParaNum('2026-11-02'))).toBe(480 * 5);
    expect(f1.get(dataParaNum('2026-11-09'))).toBe(480 * 2);
    expect(f1.get(dataParaNum('2026-11-01'))).toBeUndefined();
  });
  it('turno noturno que vira a noite conta a duração real', () => {
    const r = minutosPorSemanaPorFuncionario(DIAS, [aloc('f2', '2026-11-03', { turno_id: 't2' })], [TURNO, NOTURNO], 1);
    expect(r.get('f2')!.get(dataParaNum('2026-11-02'))).toBe(480);
  });
  it('horário próprio substitui o turno e intervalo avulso desconta', () => {
    const r = minutosPorSemanaPorFuncionario(
      DIAS,
      [aloc('f3', '2026-11-03', { inicio: '09:00', fim: '12:00', intervalo_min: 15 })],
      [TURNO],
      1,
    );
    expect(r.get('f3')!.get(dataParaNum('2026-11-02'))).toBe(165);
  });
  it('ignora folgas, dias fora do mês e trabalho sem horário', () => {
    const alocacoes = [
      aloc('f4', '2026-11-03', { status: 'FOLGA' }),
      aloc('f4', '2026-10-30'),
      aloc('f4', '2026-12-01'),
      aloc('f4', '2026-11-04', { turno_id: null }),
    ];
    const r = minutosPorSemanaPorFuncionario(DIAS, alocacoes, [TURNO], 1);
    expect(r.get('f4')).toBeUndefined();
  });
});
