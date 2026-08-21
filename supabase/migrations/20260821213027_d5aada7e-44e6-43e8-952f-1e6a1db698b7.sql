UPDATE public.compras_config c
SET parcelas_excesso = 6,
    hist_inicio = DATE '2026-02-01',
    hist_fim = DATE '2026-07-31'
FROM public.store_vr_config v
WHERE v.store_id = c.store_id
  AND upper(coalesce(v.sistema,'VR')) = 'VR'
  AND c.ano = 2026 AND c.mes = 8;