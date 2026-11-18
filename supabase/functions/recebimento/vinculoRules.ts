export const normalizarEan = (v: unknown) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
export function podeVincular(estado: string) { return estado === 'EM_CONTAGEM'; }