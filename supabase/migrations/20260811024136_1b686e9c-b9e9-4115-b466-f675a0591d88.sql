CREATE OR REPLACE FUNCTION public.distribuir_metas(
  p_store_id uuid,
  p_department text,
  p_ano integer,
  p_mes integer,
  p_faturamento numeric,
  p_margem_pct numeric,
  p_volume numeric,
  p_mix numeric
)
RETURNS TABLE(dias_gerados integer, total_meta numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ini_alvo date := make_date(p_ano, p_mes, 1);
  v_fim_alvo date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
  v_ini_ma   date := (make_date(p_ano, p_mes, 1) - interval '1 month')::date;
  v_fim_ma   date := (make_date(p_ano, p_mes, 1) - interval '1 day')::date;
  v_ini_aa   date := (make_date(p_ano, p_mes, 1) - interval '1 year')::date;
  v_fim_aa   date := (make_date(p_ano, p_mes, 1) - interval '1 year' + interval '1 month - 1 day')::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  PERFORM public.gerar_calendario(p_store_id, v_ini_ma, v_fim_ma);
  PERFORM public.gerar_calendario(p_store_id, v_ini_aa, v_fim_aa);
  PERFORM public.gerar_calendario(p_store_id, v_ini_alvo, v_fim_alvo);

  RETURN QUERY
  WITH base AS (
    SELECT c.semana, c.dia_sem,
           NULLIF(m.realizado_vendas, 0) AS vendas,
           NULLIF(m.realizado_volume, 0) AS volume,
           NULLIF(m.realizado_mix, 0)    AS mix
    FROM public.vr_calendario c
    LEFT JOIN public.store_daily_metrics m
           ON m.store_id = p_store_id AND m.department = p_department AND m.date = c.data
    WHERE c.store_id = p_store_id
      AND (c.data BETWEEN v_ini_ma AND v_fim_ma OR c.data BETWEEN v_ini_aa AND v_fim_aa)
  ), por_slot AS (
    SELECT semana, dia_sem, AVG(vendas) AS vendas, AVG(volume) AS volume, AVG(mix) AS mix
    FROM base GROUP BY semana, dia_sem
  ), por_dia AS (
    SELECT dia_sem, AVG(vendas) AS vendas, AVG(volume) AS volume, AVG(mix) AS mix
    FROM base GROUP BY dia_sem
  ), alvo AS (
    SELECT c.data,
           COALESCE(s.vendas, d.vendas, 1) AS w_vendas,
           COALESCE(s.volume, d.volume, s.vendas, d.vendas, 1) AS w_volume,
           COALESCE(s.mix, d.mix, s.vendas, d.vendas, 1) AS w_mix
    FROM public.vr_calendario c
    LEFT JOIN por_slot s ON s.semana = c.semana AND s.dia_sem = c.dia_sem
    LEFT JOIN por_dia  d ON d.dia_sem = c.dia_sem
    WHERE c.store_id = p_store_id AND c.data BETWEEN v_ini_alvo AND v_fim_alvo
  ), tot AS (
    SELECT SUM(w_vendas) sv, SUM(w_volume) sl, SUM(w_mix) sm FROM alvo
  ), calc AS (
    SELECT a.data,
           ROUND(COALESCE(p_faturamento,0) * a.w_vendas / NULLIF(t.sv,0), 2) AS meta_vendas,
           ROUND(COALESCE(p_volume,0)      * a.w_volume / NULLIF(t.sl,0), 3) AS meta_volume,
           ROUND(COALESCE(p_mix,0)         * a.w_mix    / NULLIF(t.sm,0), 0) AS meta_mix
    FROM alvo a CROSS JOIN tot t
  ), gravado AS (
    INSERT INTO public.store_daily_metrics
      (store_id, department, date, meta_vendas, meta_margem_pct, meta_lucro, meta_volume, meta_mix)
    SELECT p_store_id, p_department, data,
           COALESCE(meta_vendas,0), COALESCE(p_margem_pct,0),
           ROUND(COALESCE(meta_vendas,0) * COALESCE(p_margem_pct,0) / 100, 2),
           COALESCE(meta_volume,0), COALESCE(meta_mix,0)
    FROM calc
    ON CONFLICT (store_id, department, date) DO UPDATE SET
      meta_vendas     = EXCLUDED.meta_vendas,
      meta_margem_pct = EXCLUDED.meta_margem_pct,
      meta_lucro      = EXCLUDED.meta_lucro,
      meta_volume     = EXCLUDED.meta_volume,
      meta_mix        = EXCLUDED.meta_mix
    RETURNING meta_vendas
  )
  SELECT COUNT(*)::int, ROUND(COALESCE(SUM(meta_vendas),0), 2) FROM gravado;
END; $function$;