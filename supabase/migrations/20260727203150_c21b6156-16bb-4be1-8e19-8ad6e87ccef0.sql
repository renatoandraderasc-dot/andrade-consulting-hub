CREATE TABLE IF NOT EXISTS public.vr_calendario (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo text NOT NULL,
  dia_sem text NOT NULL,
  semana int NOT NULL,
  editado boolean NOT NULL DEFAULT false,
  UNIQUE (store_id, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vr_calendario TO authenticated;
GRANT ALL ON public.vr_calendario TO service_role;
ALTER TABLE public.vr_calendario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage calendario" ON public.vr_calendario;
CREATE POLICY "Admins manage calendario" ON public.vr_calendario
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Store users view calendario" ON public.vr_calendario;
CREATE POLICY "Store users view calendario" ON public.vr_calendario
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_store_access usa
                 WHERE usa.store_id = vr_calendario.store_id
                   AND usa.user_id = auth.uid() AND usa.approved));

CREATE TABLE IF NOT EXISTS public.meta_taxas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  department text NOT NULL,
  tipo text NOT NULL,
  tx_venda numeric NOT NULL DEFAULT 0,
  tx_margem numeric NOT NULL DEFAULT 0,
  tx_volume numeric NOT NULL DEFAULT 0,
  UNIQUE (store_id, department, tipo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_taxas TO authenticated;
GRANT ALL ON public.meta_taxas TO service_role;
ALTER TABLE public.meta_taxas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage meta taxas" ON public.meta_taxas;
CREATE POLICY "Admins manage meta taxas" ON public.meta_taxas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Store users view meta taxas" ON public.meta_taxas;
CREATE POLICY "Store users view meta taxas" ON public.meta_taxas
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_store_access usa
                 WHERE usa.store_id = meta_taxas.store_id
                   AND usa.user_id = auth.uid() AND usa.approved));

CREATE OR REPLACE FUNCTION public.gerar_calendario(
  p_store_id uuid, p_inicio date, p_fim date
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qtd integer := 0;
BEGIN
  WITH dias AS (
    SELECT d::date AS data FROM generate_series(p_inicio, p_fim, interval '1 day') d
  ), calc AS (
    SELECT
      data,
      CASE EXTRACT(DOW FROM data)::int
        WHEN 0 THEN 'DOM' WHEN 1 THEN 'SEG' WHEN 2 THEN 'TER' WHEN 3 THEN 'QUA'
        WHEN 4 THEN 'QUI' WHEN 5 THEN 'SEX' ELSE 'SAB' END AS dia_sem,
      FLOOR((EXTRACT(DAY FROM data)::int - 1 + EXTRACT(DOW FROM date_trunc('month', data))::int) / 7)::int + 1 AS semana,
      CASE WHEN EXTRACT(DOW FROM data)::int IN (0, 6) THEN 'F' ELSE 'D' END AS sufixo,
      data = date_trunc('month', data)::date AS primeiro,
      data = (date_trunc('month', data) + interval '1 month - 1 day')::date AS ultimo,
      (SELECT COUNT(*) FROM generate_series(date_trunc('month', data)::date, data, interval '1 day') u
        WHERE EXTRACT(DOW FROM u)::int NOT IN (0, 6))::int AS n_util
    FROM dias
  )
  INSERT INTO public.vr_calendario (store_id, data, tipo, dia_sem, semana)
  SELECT p_store_id, data,
         CASE
           WHEN ultimo   THEN 'ULTIMO DIA ' || sufixo
           WHEN primeiro THEN 'PRIMEIRO DIA ' || sufixo
           WHEN sufixo = 'D' AND n_util = 4 THEN '4o DIA UTIL D'
           WHEN sufixo = 'D' AND n_util = 5 THEN '5o DIA UTIL D'
           ELSE dia_sem || ' ' || sufixo
         END,
         dia_sem, semana
  FROM calc
  ON CONFLICT (store_id, data) DO UPDATE
     SET tipo     = CASE WHEN public.vr_calendario.editado THEN public.vr_calendario.tipo ELSE EXCLUDED.tipo END,
         dia_sem  = EXCLUDED.dia_sem,
         semana   = EXCLUDED.semana;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END; $$;

CREATE OR REPLACE FUNCTION public.semear_taxas_padrao(
  p_store_id uuid, p_department text,
  p_tx_base numeric DEFAULT 0.02662,
  p_tx_forte numeric DEFAULT 0.05662,
  p_tx_margem numeric DEFAULT 0.0232
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qtd integer := 0;
BEGIN
  INSERT INTO public.meta_taxas (store_id, department, tipo, tx_venda, tx_margem, tx_volume)
  SELECT p_store_id, p_department, t.tipo,
         CASE WHEN t.forte THEN p_tx_forte ELSE p_tx_base END,
         p_tx_margem, 0
  FROM (VALUES
    ('SEG D', false), ('TER D', false), ('QUA D', false),
    ('QUI D', true),  ('SEX D', true),
    ('SAB F', true),  ('DOM F', true),
    ('PRIMEIRO DIA D', true), ('PRIMEIRO DIA F', true),
    ('ULTIMO DIA D', true),   ('ULTIMO DIA F', true),
    ('4o DIA UTIL D', true),  ('5o DIA UTIL D', true),
    ('VALE D', true), ('VALE F', true),
    ('FERIADO D', false), ('FERIADO F', false)
  ) AS t(tipo, forte)
  ON CONFLICT (store_id, department, tipo) DO NOTHING;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END; $$;

CREATE OR REPLACE FUNCTION public.gerar_metas(
  p_store_id uuid, p_department text, p_ano int, p_mes int,
  p_base text DEFAULT 'ano_anterior'
) RETURNS TABLE (dias_gerados int, total_meta numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
           ROUND((a.margem_base + COALESCE(t.tx_margem,0)) * 100, 2)       AS meta_margem_pct,
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
END; $$;

GRANT EXECUTE ON FUNCTION public.gerar_calendario(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.semear_taxas_padrao(uuid, text, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_metas(uuid, text, int, int, text) TO authenticated;