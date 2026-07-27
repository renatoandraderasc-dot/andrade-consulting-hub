CREATE OR REPLACE FUNCTION public.gerar_metas(p_store_id uuid, p_department text, p_ano integer, p_mes integer, p_base text DEFAULT 'ano_anterior'::text)
 RETURNS TABLE(dias_gerados integer, total_meta numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ini_alvo date := make_date(p_ano, p_mes, 1);
  v_fim_alvo date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
  v_ini_base date;
  v_fim_base date;
BEGIN
  IF p_base = 'mes_anterior' THEN
    v_ini_base := (v_ini_alvo - interval '1 month')::date;
  ELSE
    v_ini_base := (v_ini_alvo - interval '1 year')::date;
  END IF;
  v_fim_base := (v_ini_base + interval '1 month - 1 day')::date;
  PERFORM public.gerar_calendario(p_store_id, v_ini_base, v_fim_base);
  PERFORM public.gerar_calendario(p_store_id, v_ini_alvo, v_fim_alvo);
  RETURN QUERY
  WITH base AS (
    SELECT c.data, c.semana, c.dia_sem,
           COALESCE(m.realizado_vendas, 0)     AS vendas,
           COALESCE(m.realizado_margem_pct, 0) AS margem,
           COALESCE(m.realizado_volume, 0)     AS volume
    FROM public.vr_calendario c
    LEFT JOIN public.store_daily_metrics m
           ON m.store_id = p_store_id AND m.department = p_department AND m.date = c.data
    WHERE c.store_id = p_store_id AND c.data BETWEEN v_ini_base AND v_fim_base
  ), media_dia AS (
    SELECT dia_sem, AVG(NULLIF(vendas,0)) AS vendas, AVG(NULLIF(margem,0)) AS margem,
           AVG(NULLIF(volume,0)) AS volume
    FROM base GROUP BY dia_sem
  ), alvo AS (
    SELECT c.data, c.tipo, c.semana, c.dia_sem,
           COALESCE(b.vendas, md.vendas, 0) AS vendas_base,
           COALESCE(b.margem, md.margem, 0) AS margem_base,
           COALESCE(b.volume, md.volume, 0) AS volume_base
    FROM public.vr_calendario c
    LEFT JOIN base b       ON b.semana = c.semana AND b.dia_sem = c.dia_sem
    LEFT JOIN media_dia md ON md.dia_sem = c.dia_sem
    WHERE c.store_id = p_store_id AND c.data BETWEEN v_ini_alvo AND v_fim_alvo
  ), calc AS (
    SELECT a.data,
           ROUND(a.vendas_base / NULLIF(1 - COALESCE(t.tx_venda,0), 0), 2) AS meta_vendas,
           ROUND(a.margem_base + COALESCE(t.tx_margem,0) * 100, 2)         AS meta_margem_pct,
           ROUND(a.volume_base / NULLIF(1 - COALESCE(t.tx_volume,0), 0), 3) AS meta_volume
    FROM alvo a
    LEFT JOIN public.meta_taxas t
           ON t.store_id = p_store_id AND t.department = p_department AND t.tipo = a.tipo
  ), gravado AS (
    INSERT INTO public.store_daily_metrics
      (store_id, department, date, meta_vendas, meta_margem_pct, meta_lucro, meta_volume)
    SELECT p_store_id, p_department, data,
           COALESCE(meta_vendas,0), COALESCE(meta_margem_pct,0),
           ROUND(COALESCE(meta_vendas,0) * COALESCE(meta_margem_pct,0) / 100, 2),
           COALESCE(meta_volume,0)
    FROM calc
    ON CONFLICT (store_id, department, date) DO UPDATE SET
      meta_vendas     = EXCLUDED.meta_vendas,
      meta_margem_pct = EXCLUDED.meta_margem_pct,
      meta_lucro      = EXCLUDED.meta_lucro,
      meta_volume     = EXCLUDED.meta_volume
    RETURNING meta_vendas
  )
  SELECT COUNT(*)::int, ROUND(COALESCE(SUM(meta_vendas),0), 2) FROM gravado;
END; $function$;