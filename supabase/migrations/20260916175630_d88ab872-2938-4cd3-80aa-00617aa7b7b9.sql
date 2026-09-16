CREATE OR REPLACE FUNCTION public.distribuir_metas(p_store_id uuid, p_department text, p_ano integer, p_mes integer, p_faturamento numeric, p_margem_pct numeric, p_volume numeric, p_mix numeric)
RETURNS TABLE(dias_gerados integer, total_meta numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ini_alvo date := make_date(p_ano, p_mes, 1);
  v_fim_alvo date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
  v_ini_ma   date := (make_date(p_ano, p_mes, 1) - interval '1 month')::date;
  v_fim_ma   date := (make_date(p_ano, p_mes, 1) - interval '1 day')::date;
  v_ini_aa   date := (make_date(p_ano, p_mes, 1) - interval '1 year')::date;
  v_fim_aa   date := (make_date(p_ano, p_mes, 1) - interval '1 year' + interval '1 month - 1 day')::date;
  v_dias int;
  v_ultimo date;
  v_k numeric;
BEGIN
  IF NOT public.pode_gerenciar_loja(p_store_id) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  PERFORM public.gerar_calendario(p_store_id, v_ini_ma, v_fim_ma);
  PERFORM public.gerar_calendario(p_store_id, v_ini_aa, v_fim_aa);
  PERFORM public.gerar_calendario(p_store_id, v_ini_alvo, v_fim_alvo);

  DROP TABLE IF EXISTS tmp_calc;
  CREATE TEMP TABLE tmp_calc ON COMMIT DROP AS
  WITH base AS (
    SELECT c.semana, c.dia_sem,
           NULLIF(m.realizado_vendas, 0) AS vendas,
           NULLIF(m.realizado_volume, 0) AS volume,
           NULLIF(m.realizado_mix, 0)    AS mix,
           NULLIF(m.realizado_lucro, 0)  AS lucro
    FROM public.vr_calendario c
    LEFT JOIN public.store_daily_metrics m
           ON m.store_id = p_store_id AND m.department = p_department AND m.date = c.data
    WHERE c.store_id = p_store_id
      AND (c.data BETWEEN v_ini_ma AND v_fim_ma OR c.data BETWEEN v_ini_aa AND v_fim_aa)
  ), por_slot AS (
    SELECT semana, dia_sem, AVG(vendas) AS vendas, AVG(volume) AS volume, AVG(mix) AS mix,
           CASE WHEN SUM(vendas) > 0 THEN SUM(lucro) / SUM(vendas) * 100 END AS marg
    FROM base GROUP BY semana, dia_sem
  ), por_dia AS (
    SELECT dia_sem, AVG(vendas) AS vendas, AVG(volume) AS volume, AVG(mix) AS mix,
           CASE WHEN SUM(vendas) > 0 THEN SUM(lucro) / SUM(vendas) * 100 END AS marg
    FROM base GROUP BY dia_sem
  ), alvo AS (
    SELECT c.data,
           COALESCE(s.vendas, d.vendas, 1) AS w_vendas,
           COALESCE(s.volume, d.volume, s.vendas, d.vendas, 1) AS w_volume,
           COALESCE(s.mix, d.mix, s.vendas, d.vendas, 1) AS w_mix,
           COALESCE(s.marg, d.marg, COALESCE(p_margem_pct, 0)) AS w_marg
    FROM public.vr_calendario c
    LEFT JOIN por_slot s ON s.semana = c.semana AND s.dia_sem = c.dia_sem
    LEFT JOIN por_dia  d ON d.dia_sem = c.dia_sem
    WHERE c.store_id = p_store_id AND c.data BETWEEN v_ini_alvo AND v_fim_alvo
  ), tot AS (
    SELECT SUM(w_vendas) sv, SUM(w_volume) sl, SUM(w_mix) sm FROM alvo
  )
  SELECT a.data,
         ROUND(COALESCE(p_faturamento,0) * a.w_vendas / NULLIF(t.sv,0), 2) AS meta_vendas,
         ROUND(COALESCE(p_volume,0)      * a.w_volume / NULLIF(t.sl,0), 3) AS meta_volume,
         ROUND(COALESCE(p_mix,0)         * a.w_mix    / NULLIF(t.sm,0), 0) AS meta_mix,
         GREATEST(a.w_marg, 0) AS w_marg
  FROM alvo a CROSS JOIN tot t;

  SELECT MAX(data) INTO v_ultimo FROM tmp_calc;
  IF v_ultimo IS NOT NULL THEN
    UPDATE tmp_calc c SET
      meta_vendas = COALESCE(c.meta_vendas,0)
        + (COALESCE(p_faturamento,0) - (SELECT COALESCE(SUM(COALESCE(meta_vendas,0)),0) FROM tmp_calc)),
      meta_volume = COALESCE(c.meta_volume,0)
        + (COALESCE(p_volume,0) - (SELECT COALESCE(SUM(COALESCE(meta_volume,0)),0) FROM tmp_calc)),
      meta_mix = COALESCE(c.meta_mix,0)
        + (COALESCE(p_mix,0) - (SELECT COALESCE(SUM(COALESCE(meta_mix,0)),0) FROM tmp_calc))
    WHERE c.data = v_ultimo;
  END IF;

  SELECT CASE
           WHEN SUM(COALESCE(meta_vendas,0) * COALESCE(w_marg,0)) > 0
           THEN COALESCE(p_faturamento,0) * COALESCE(p_margem_pct,0)
                / SUM(COALESCE(meta_vendas,0) * COALESCE(w_marg,0))
           ELSE 0 END
    INTO v_k
    FROM tmp_calc;

  IF COALESCE(v_k, 0) <= 0 THEN
    UPDATE tmp_calc SET w_marg = COALESCE(p_margem_pct, 0) WHERE data IS NOT NULL;
  ELSE
    UPDATE tmp_calc SET w_marg = ROUND(COALESCE(w_marg,0) * v_k, 4) WHERE data IS NOT NULL;
  END IF;

  WITH gravado AS (
    INSERT INTO public.store_daily_metrics
      (store_id, department, date, meta_vendas, meta_margem_pct, meta_lucro, meta_volume, meta_mix,
       meta_base_vendas, meta_base_margem_pct, meta_base_volume, meta_base_mix)
    SELECT p_store_id, p_department, data,
           COALESCE(meta_vendas,0), COALESCE(w_marg,0),
           ROUND(COALESCE(meta_vendas,0) * COALESCE(w_marg,0) / 100, 2),
           COALESCE(meta_volume,0), COALESCE(meta_mix,0),
           COALESCE(meta_vendas,0), COALESCE(w_marg,0),
           COALESCE(meta_volume,0), COALESCE(meta_mix,0)
    FROM tmp_calc
    ON CONFLICT (store_id, department, date) DO UPDATE SET
      meta_vendas          = EXCLUDED.meta_vendas,
      meta_margem_pct      = EXCLUDED.meta_margem_pct,
      meta_lucro           = EXCLUDED.meta_lucro,
      meta_volume          = EXCLUDED.meta_volume,
      meta_mix             = EXCLUDED.meta_mix,
      meta_base_vendas     = EXCLUDED.meta_base_vendas,
      meta_base_margem_pct = EXCLUDED.meta_base_margem_pct,
      meta_base_volume     = EXCLUDED.meta_base_volume,
      meta_base_mix        = EXCLUDED.meta_base_mix
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_dias FROM gravado;

  DROP TABLE IF EXISTS tmp_calc;

  RETURN QUERY
  SELECT v_dias, r.total_meta
    FROM public.redistribuir_metas(p_store_id, p_department, p_ano, p_mes) r;
END;
$fn$;