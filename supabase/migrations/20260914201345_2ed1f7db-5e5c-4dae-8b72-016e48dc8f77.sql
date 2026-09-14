ALTER TABLE public.store_daily_metrics
  ADD COLUMN IF NOT EXISTS dia_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS meta_base_vendas numeric,
  ADD COLUMN IF NOT EXISTS meta_base_volume numeric,
  ADD COLUMN IF NOT EXISTS meta_base_mix numeric,
  ADD COLUMN IF NOT EXISTS meta_base_margem_pct numeric;

CREATE OR REPLACE FUNCTION public.redistribuir_metas(p_store_id uuid, p_department text, p_ano integer, p_mes integer)
RETURNS TABLE(dias_ativos integer, total_meta numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ini date := make_date(p_ano, p_mes, 1);
  v_fim date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
  v_tot_v numeric; v_tot_l numeric; v_tot_m numeric;
  v_act_v numeric; v_act_l numeric; v_act_m numeric;
  v_cnt numeric;
BEGIN
  IF NOT public.pode_gerenciar_loja(p_store_id) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  UPDATE public.store_daily_metrics m
     SET meta_base_vendas     = COALESCE(m.meta_base_vendas, m.meta_vendas, 0),
         meta_base_volume     = COALESCE(m.meta_base_volume, m.meta_volume, 0),
         meta_base_mix        = COALESCE(m.meta_base_mix, m.meta_mix, 0),
         meta_base_margem_pct = COALESCE(m.meta_base_margem_pct, m.meta_margem_pct, 0)
   WHERE m.store_id = p_store_id AND m.department = p_department
     AND m.date BETWEEN v_ini AND v_fim
     AND (m.meta_base_vendas IS NULL OR m.meta_base_volume IS NULL
          OR m.meta_base_mix IS NULL OR m.meta_base_margem_pct IS NULL);

  SELECT COALESCE(SUM(meta_base_vendas), 0),
         COALESCE(SUM(meta_base_volume), 0),
         COALESCE(SUM(meta_base_mix), 0),
         COALESCE(SUM(meta_base_vendas) FILTER (WHERE dia_ativo), 0),
         COALESCE(SUM(meta_base_volume) FILTER (WHERE dia_ativo), 0),
         COALESCE(SUM(meta_base_mix)    FILTER (WHERE dia_ativo), 0),
         COALESCE(COUNT(*) FILTER (WHERE dia_ativo), 0)
    INTO v_tot_v, v_tot_l, v_tot_m, v_act_v, v_act_l, v_act_m, v_cnt
    FROM public.store_daily_metrics
   WHERE store_id = p_store_id AND department = p_department
     AND date BETWEEN v_ini AND v_fim;

  IF v_cnt = 0 THEN
    RETURN QUERY SELECT 0, 0::numeric;
    RETURN;
  END IF;

  UPDATE public.store_daily_metrics m SET
    meta_vendas = CASE WHEN m.dia_ativo THEN
        ROUND(v_tot_v * (CASE WHEN v_act_v > 0 THEN COALESCE(m.meta_base_vendas,0) ELSE 1 END)
              / (CASE WHEN v_act_v > 0 THEN v_act_v ELSE v_cnt END), 2)
      ELSE 0 END,
    meta_volume = CASE WHEN m.dia_ativo THEN
        ROUND(v_tot_l * (CASE WHEN v_act_l > 0 THEN COALESCE(m.meta_base_volume,0) ELSE 1 END)
              / (CASE WHEN v_act_l > 0 THEN v_act_l ELSE v_cnt END), 3)
      ELSE 0 END,
    meta_mix = CASE WHEN m.dia_ativo THEN
        ROUND(v_tot_m * (CASE WHEN v_act_m > 0 THEN COALESCE(m.meta_base_mix,0) ELSE 1 END)
              / (CASE WHEN v_act_m > 0 THEN v_act_m ELSE v_cnt END), 0)
      ELSE 0 END,
    meta_margem_pct = CASE WHEN m.dia_ativo THEN COALESCE(m.meta_base_margem_pct, 0) ELSE 0 END,
    meta_lucro = CASE WHEN m.dia_ativo THEN
        ROUND(
          ROUND(v_tot_v * (CASE WHEN v_act_v > 0 THEN COALESCE(m.meta_base_vendas,0) ELSE 1 END)
                / (CASE WHEN v_act_v > 0 THEN v_act_v ELSE v_cnt END), 2)
          * COALESCE(m.meta_base_margem_pct, 0) / 100, 2)
      ELSE 0 END
  WHERE m.store_id = p_store_id AND m.department = p_department
    AND m.date BETWEEN v_ini AND v_fim;

  RETURN QUERY
  SELECT COUNT(*) FILTER (WHERE dia_ativo)::int,
         ROUND(COALESCE(SUM(meta_vendas), 0), 2)
    FROM public.store_daily_metrics
   WHERE store_id = p_store_id AND department = p_department
     AND date BETWEEN v_ini AND v_fim;
END; $function$;

CREATE OR REPLACE FUNCTION public.distribuir_metas(p_store_id uuid, p_department text, p_ano integer, p_mes integer, p_faturamento numeric, p_margem_pct numeric, p_volume numeric, p_mix numeric)
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
  v_dias int;
BEGIN
  IF NOT public.pode_gerenciar_loja(p_store_id) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  PERFORM public.gerar_calendario(p_store_id, v_ini_ma, v_fim_ma);
  PERFORM public.gerar_calendario(p_store_id, v_ini_aa, v_fim_aa);
  PERFORM public.gerar_calendario(p_store_id, v_ini_alvo, v_fim_alvo);

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
      (store_id, department, date, meta_vendas, meta_margem_pct, meta_lucro, meta_volume, meta_mix,
       meta_base_vendas, meta_base_margem_pct, meta_base_volume, meta_base_mix)
    SELECT p_store_id, p_department, data,
           COALESCE(meta_vendas,0), COALESCE(p_margem_pct,0),
           ROUND(COALESCE(meta_vendas,0) * COALESCE(p_margem_pct,0) / 100, 2),
           COALESCE(meta_volume,0), COALESCE(meta_mix,0),
           COALESCE(meta_vendas,0), COALESCE(p_margem_pct,0),
           COALESCE(meta_volume,0), COALESCE(meta_mix,0)
    FROM calc
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

  RETURN QUERY
  SELECT v_dias, r.total_meta
    FROM public.redistribuir_metas(p_store_id, p_department, p_ano, p_mes) r;
END; $function$;

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
  v_dias int;
BEGIN
  IF NOT public.pode_gerenciar_loja(p_store_id) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  IF p_base = 'mes_anterior' THEN
    v_ini_base := (v_ini_alvo - interval '1 month')::date;
  ELSE
    v_ini_base := (v_ini_alvo - interval '1 year')::date;
  END IF;
  v_fim_base := (v_ini_base + interval '1 month - 1 day')::date;
  PERFORM public.gerar_calendario(p_store_id, v_ini_base, v_fim_base);
  PERFORM public.gerar_calendario(p_store_id, v_ini_alvo, v_fim_alvo);

  WITH base AS (
    SELECT c.data, c.semana, c.dia_sem,
           NULLIF(m.realizado_vendas, 0)     AS vendas,
           NULLIF(m.realizado_margem_pct, 0) AS margem,
           NULLIF(m.realizado_volume, 0)     AS volume,
           NULLIF(m.realizado_mix, 0)        AS mix
    FROM public.vr_calendario c
    LEFT JOIN public.store_daily_metrics m
           ON m.store_id = p_store_id AND m.department = p_department AND m.date = c.data
    WHERE c.store_id = p_store_id AND c.data BETWEEN v_ini_base AND v_fim_base
  ), media_dia AS (
    SELECT dia_sem, AVG(vendas) AS vendas, AVG(margem) AS margem,
           AVG(volume) AS volume, AVG(mix) AS mix
    FROM base GROUP BY dia_sem
  ), alvo AS (
    SELECT c.data, c.tipo, c.semana, c.dia_sem,
           COALESCE(b.vendas, md.vendas, 0) AS vendas_base,
           COALESCE(b.margem, md.margem, 0) AS margem_base,
           COALESCE(b.volume, md.volume, 0) AS volume_base,
           COALESCE(b.mix,    md.mix,    0) AS mix_base
    FROM public.vr_calendario c
    LEFT JOIN base b       ON b.semana = c.semana AND b.dia_sem = c.dia_sem
    LEFT JOIN media_dia md ON md.dia_sem = c.dia_sem
    WHERE c.store_id = p_store_id AND c.data BETWEEN v_ini_alvo AND v_fim_alvo
  ), calc AS (
    SELECT a.data,
           ROUND(a.vendas_base / NULLIF(1 - COALESCE(t.tx_venda, tg.tx_venda, 0), 0), 2) AS meta_vendas,
           ROUND(a.margem_base + COALESCE(t.tx_margem, tg.tx_margem, 0) * 100, 2)        AS meta_margem_pct,
           ROUND(a.volume_base / NULLIF(1 - COALESCE(t.tx_volume, tg.tx_volume, 0), 0), 3) AS meta_volume,
           ROUND(a.mix_base / NULLIF(1 - COALESCE(t.tx_volume, tg.tx_volume, 0), 0), 0)    AS meta_mix
    FROM alvo a
    LEFT JOIN public.meta_taxas t
           ON t.store_id = p_store_id AND t.department = p_department AND t.tipo = a.tipo
    LEFT JOIN public.meta_taxas tg
           ON tg.store_id = p_store_id AND tg.department = p_department
          AND tg.tipo = regexp_replace(a.tipo, '^(SEG|TER|QUA|QUI|SEX|SAB|DOM) [0-9]+ ', '\1 ')
  ), gravado AS (
    INSERT INTO public.store_daily_metrics
      (store_id, department, date, meta_vendas, meta_margem_pct, meta_lucro, meta_volume, meta_mix,
       meta_base_vendas, meta_base_margem_pct, meta_base_volume, meta_base_mix)
    SELECT p_store_id, p_department, data,
           COALESCE(meta_vendas,0), COALESCE(meta_margem_pct,0),
           ROUND(COALESCE(meta_vendas,0) * COALESCE(meta_margem_pct,0) / 100, 2),
           COALESCE(meta_volume,0), COALESCE(meta_mix,0),
           COALESCE(meta_vendas,0), COALESCE(meta_margem_pct,0),
           COALESCE(meta_volume,0), COALESCE(meta_mix,0)
    FROM calc
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

  RETURN QUERY
  SELECT v_dias, r.total_meta
    FROM public.redistribuir_metas(p_store_id, p_department, p_ano, p_mes) r;
END; $function$;