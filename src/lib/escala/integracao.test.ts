import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { limitesMes, precedenciaDatas } from './carregarContexto';
describe('contexto da escala', () => {
  it('carrega os 35 dias anteriores ao primeiro dia do mês', () => {
    expect(limitesMes(2026, 10)).toEqual({ inicio: '2026-10-01', fim: '2026-10-31', historico: '2026-08-27' });
  });
  it('a data da loja prevalece sobre a nacional no mesmo dia e tipo', () => {
    const local = { data: '2026-12-25', tipo: 'feriado', store_id: 'loja', loja_abre: false };
    const global = { ...local, store_id: null, loja_abre: true };
    expect(precedenciaDatas([local, global], 'loja')).toEqual([local]);
    expect(precedenciaDatas([global, local], 'loja')).toEqual([local]);
  });
});