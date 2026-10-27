import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { CONFIG_PADRAO, diasDoMes, numParaData, type ContextoEscala } from './escala-motor';

export type FuncionarioRow = Tables<'escala_funcionarios'>;
export type TurnoRow = Tables<'escala_turnos'>;
export type AlocacaoRow = Tables<'escala_alocacoes'>;
export type PeriodoRow = Tables<'escala_periodos'>;
export type ConfigRow = Tables<'escala_config_loja'>;
export interface DadosEscala {
  ctx: ContextoEscala;
  funcionarios: FuncionarioRow[];
  turnos: TurnoRow[];
  config: ConfigRow | null;
  periodo: PeriodoRow | null;
  alocacoes: AlocacaoRow[];
  cobertura: Tables<'escala_cobertura'>[];
  datas: Tables<'escala_datas'>[];
  marcos: Tables<'escala_marcos'>[];
  ausencias: Tables<'escala_ausencias'>[];
  podeGerir: boolean;
}
export function limitesMes(ano: number, mes: number) {
  const dias = diasDoMes(ano, mes);
  return { inicio: numParaData(dias[0]), fim: numParaData(dias[dias.length - 1]), historico: numParaData(dias[0] - 35) };
}
export function precedenciaDatas<T extends { data: string; tipo: string; store_id: string | null }>(rows: T[], loja: string): T[] {
  const mapa = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.data}|${row.tipo}`;
    if (!mapa.has(key) || row.store_id === loja) mapa.set(key, row);
  }
  return [...mapa.values()];
}
async function alocacoesPeriodo(storeId: string, inicio: string, fim: string) {
  const rows: AlocacaoRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('escala_alocacoes').select('*').eq('store_id', storeId).gte('data', inicio).lte('data', fim).order('data').order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data?.length || 0) < 1000) return rows;
  }
}
export async function carregarDadosEscala(storeId: string, ano: number, mes: number): Promise<DadosEscala> {
  const { inicio, fim, historico } = limitesMes(ano, mes);
  const permiso = await supabase.rpc('escala_pode_gerir', { p_store: storeId });
  if (permiso.error) throw permiso.error;
  const podeGerir = permiso.data === true;
  const [config, marcos, turnos, funcionarios, cobertura, datas, ausencias, periodo, todas] = await Promise.all([
    supabase.from('escala_config_loja').select('*').eq('store_id', storeId).maybeSingle(),
    supabase.from('escala_marcos').select('*').or(`store_id.is.null,store_id.eq.${storeId}`).order('vigencia_inicio'),
    supabase.from('escala_turnos').select('*').eq('store_id', storeId).order('codigo'),
    supabase.from('escala_funcionarios').select('*').eq('store_id', storeId).or(`ativo.eq.true,desligamento.gte.${inicio}`).order('departamento').order('nome'),
    supabase.from('escala_cobertura').select('*').eq('store_id', storeId),
    supabase.from('escala_datas').select('*').or(`store_id.is.null,store_id.eq.${storeId}`).gte('data', inicio).lte('data', fim).order('data'),
    supabase.from('escala_ausencias').select('*').eq('store_id', storeId).lte('inicio', fim).gte('fim', inicio),
    supabase.from('escala_periodos').select('*').eq('store_id', storeId).eq('ano', ano).eq('mes', mes).maybeSingle(),
    alocacoesPeriodo(storeId, historico, fim),
  ]);
  for (const result of [config, marcos, turnos, funcionarios, cobertura, datas, ausencias, periodo]) if (result.error) throw result.error;
  const trim = (a: AlocacaoRow) => ({ ...a, inicio: a.inicio?.slice(0, 5), fim: a.fim?.slice(0, 5) });
  const turnosRows = (turnos.data || []).map(t => ({ ...t, inicio: t.inicio.slice(0, 5), fim: t.fim.slice(0, 5) }));
  const alocacoes = todas.filter(a => a.data >= inicio).map(a => ({ ...a, inicio: a.inicio?.slice(0, 5) || null, fim: a.fim?.slice(0, 5) || null }));
  const datasRows = precedenciaDatas(datas.data || [], storeId);
  const configRow = config.data;
  const ctx: ContextoEscala = {
    store_id: storeId, ano, mes,
    config: { ...CONFIG_PADRAO, ...configRow, semana_inicia: configRow?.semana_inicia === 0 ? 0 : 1 },
    marcos: (marcos.data || []).map(m => ({ ...m, horas_semanais: Number(m.horas_semanais) })),
    turnos: turnosRows.filter(t => t.ativo).map(t => ({ ...t, nome: t.nome || undefined })),
    funcionarios: funcionarios.data || [], cobertura: cobertura.data || [], datas: datasRows,
    ausencias: (ausencias.data || []).map(a => ({ ...a, tipo: a.tipo as 'FERIAS' | 'ATESTADO' | 'AFASTADO' })),
    alocacoes: alocacoes.map(trim), historico: todas.filter(a => a.data < inicio).map(trim),
  };
  return { ctx, config: configRow, periodo: periodo.data, funcionarios: funcionarios.data || [], turnos: turnosRows, cobertura: cobertura.data || [], datas: datasRows, marcos: marcos.data || [], ausencias: ausencias.data || [], alocacoes, podeGerir };
}
export async function carregarContexto(storeId: string, ano: number, mes: number): Promise<ContextoEscala> {
  return (await carregarDadosEscala(storeId, ano, mes)).ctx;
}