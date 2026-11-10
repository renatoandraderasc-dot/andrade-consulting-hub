import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { HEADER_COLUMNS } from './recebimentoRules';
export type Receipt = Omit<Database['public']['Tables']['recebimentos']['Row'], 'xml_resumo' | 'codfornec' | 'idnfeestabelec' | 'entrada_iniciada_em' | 'liberado_por' | 'pedido_origem'>;
export type Criterio = Database['public']['Tables']['recebimento_criterios']['Row'];
export type Count = Database['public']['Tables']['lista_cega_itens']['Row'];
export const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
export const qtd = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', {maximumFractionDigits:3});
export const dataBR = (v?: string | null) => v ? v.slice(0,10).split('-').reverse().join('/') : '—';
export const cnpjBR = (v?: string | null) => (v || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
export async function invokeReceipt(store_id: string, acao: string, body: Record<string, unknown> = {}, entrada = false) {
  const res = await supabase.functions.invoke(entrada ? 'websac-entrada' : 'recebimento', {body: {store_id, ...(entrada ? {} : {acao}), ...body}});
  if (res.error) {
    const ctx = res.error.context;
    if (ctx instanceof Response) { const payload = await ctx.json().catch(() => null); if (payload) return payload; }
    throw new Error(res.error.message);
  }
  return res.data;
}
export async function readHeaders(store: string, id?: string) {
  let query = supabase.from('recebimentos').select(HEADER_COLUMNS).eq('store_id',store);
  if(id) query = query.eq('id',id);
  const {data,error} = await query.order('iniciado_em',{ascending:false});
  if(error) throw error;
  return (data || []) as unknown as Receipt[];
}
