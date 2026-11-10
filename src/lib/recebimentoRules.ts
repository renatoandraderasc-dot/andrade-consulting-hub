export const RECEBIMENTO_DEFAULTS = { dias_max_emissao: 3, tolerancia_prazo: 2, tolerancia_preco: 1, tolerancia_qtd: 0, recontagens: 1, exigir_pedido: true, entrada_automatica: false };
export type Criterion = { criterio: number; resultado: string; ciente_por: string | null };
export function podeContar(criterios: Criterion[]) {
  return [1, 2, 3, 4].every(n => criterios.some(c => c.criterio === n && (c.resultado === 'OK' || (c.resultado === 'AVISO' && !!c.ciente_por))));
}
export function podeAprovar(criterios: Criterion[], supervisor: boolean) {
  return podeContar(criterios) && criterios.some(c => c.criterio === 5 && (c.resultado === 'OK' || (c.resultado === 'AVISO' && supervisor)));
}
export function podeEntrar(estado: string, supervisor: boolean) {
  return supervisor && ['APROVADA', 'APROVADA_COM_RESSALVA', 'ENTRADA_PENDENTE_SUPERVISOR'].includes(estado);
}
export const HEADER_COLUMNS = 'id,store_id,chave,numero_nf,serie,cnpj_emitente,nome_emitente,data_emissao,total_nf,estado,iniciado_em,iniciado_por,atualizado_em,idnotafiscal_entrada,entrada_confirmada_em,liberado_em,justificativa,numpedido';
export const SAFE_CRITERIA_COLUMNS = 'criterio,resultado,ciente_por';
export function recontagemSegura(itens: { ean?: string | null; descricao?: string | null; situacao: string }[]) {
  return itens.filter(i => i.situacao !== 'OK').map(i => ({ ean: i.ean || '', descricao: i.descricao || '' }));
}