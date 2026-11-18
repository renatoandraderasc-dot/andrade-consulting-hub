import { z } from 'npm:zod@3';
export const VinculoSchema = z.object({
  recebimento_id: z.string().uuid(), rodada: z.number().int().positive().default(1),
  ean: z.string().transform(v => v.replace(/\D/g, '')).pipe(z.string().regex(/^\d{8,14}$/)),
  seq_xml: z.number().int().positive(), gravar_websac: z.boolean().default(false),
});
export { normalizarEan, podeVincular } from './vinculoRules.ts';