/** LOJA/GERAL são metas agregadas, não departamentos para somar novamente. */
export function somarMetasDepartamento(rows: { departamento: string; meta_compra: unknown }[]): number {
  return rows.filter(r => !["LOJA", "GERAL"].includes(r.departamento.trim().toUpperCase()))
    .reduce((s, r) => s + (Number(r.meta_compra) || 0), 0);
}