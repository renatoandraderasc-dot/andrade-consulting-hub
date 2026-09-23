CREATE OR REPLACE FUNCTION public.fn_grupo_recalc_daily(p_group uuid, p_date date, p_department text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  SELECT SUM(meta_vendas) mv, SUM(realizado_vendas) rv, SUM(projecao_vendas) pv,
         SUM(meta_lucro) ml, SUM(realizado_lucro) rl, SUM(projecao_lucro) pl,
         SUM(meta_volume) mvol, SUM(realizado_volume) rvol, SUM(projecao_volume) pvol,
         SUM(meta_mix) mmix, SUM(realizado_mix) rmix, SUM(projecao_mix) pmix,
         BOOL_OR(dia_ativo) ativo,
         MIN(tipo_dia) tipo_dia, COUNT(*) n
    INTO r
  FROM store_daily_metrics d
  JOIN store_group_members g ON g.member_store_id = d.store_id
  WHERE g.group_store_id = p_group AND d.date = p_date AND d.department = p_department;

  IF r.n = 0 THEN
    DELETE FROM store_daily_metrics WHERE store_id = p_group AND date = p_date AND department = p_department;
    RETURN;
  END IF;

  INSERT INTO store_daily_metrics (store_id, department, date, tipo_dia, dia_ativo,
      meta_vendas, realizado_vendas, projecao_vendas,
      meta_lucro, realizado_lucro, projecao_lucro,
      meta_margem_pct, realizado_margem_pct, projecao_margem_pct,
      meta_volume, realizado_volume, projecao_volume,
      meta_mix, realizado_mix, projecao_mix)
  VALUES (p_group, p_department, p_date, COALESCE(r.tipo_dia, 'D'), COALESCE(r.ativo, true),
      COALESCE(r.mv,0), COALESCE(r.rv,0), COALESCE(r.pv,0),
      COALESCE(r.ml,0), COALESCE(r.rl,0), COALESCE(r.pl,0),
      CASE WHEN COALESCE(r.mv,0) <> 0 THEN ROUND(r.ml / r.mv * 100, 2) ELSE 0 END,
      CASE WHEN COALESCE(r.rv,0) <> 0 THEN ROUND(r.rl / r.rv * 100, 2) ELSE 0 END,
      CASE WHEN COALESCE(r.pv,0) <> 0 THEN ROUND(r.pl / r.pv * 100, 2) ELSE 0 END,
      COALESCE(r.mvol,0), COALESCE(r.rvol,0), COALESCE(r.pvol,0),
      COALESCE(r.mmix,0), COALESCE(r.rmix,0), COALESCE(r.pmix,0))
  ON CONFLICT (store_id, department, date) DO UPDATE SET
      tipo_dia = EXCLUDED.tipo_dia,
      dia_ativo = EXCLUDED.dia_ativo,
      meta_vendas = EXCLUDED.meta_vendas, realizado_vendas = EXCLUDED.realizado_vendas, projecao_vendas = EXCLUDED.projecao_vendas,
      meta_lucro = EXCLUDED.meta_lucro, realizado_lucro = EXCLUDED.realizado_lucro, projecao_lucro = EXCLUDED.projecao_lucro,
      meta_margem_pct = EXCLUDED.meta_margem_pct, realizado_margem_pct = EXCLUDED.realizado_margem_pct, projecao_margem_pct = EXCLUDED.projecao_margem_pct,
      meta_volume = EXCLUDED.meta_volume, realizado_volume = EXCLUDED.realizado_volume, projecao_volume = EXCLUDED.projecao_volume,
      meta_mix = EXCLUDED.meta_mix, realizado_mix = EXCLUDED.realizado_mix, projecao_mix = EXCLUDED.projecao_mix;
END
$$;
