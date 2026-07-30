-- 1) Restrict SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.gerar_calendario(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gerar_metas(uuid, text, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gerar_metas_compra(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.semear_taxas_padrao(uuid, text, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_calendario(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_metas(uuid, text, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_metas_compra(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.semear_taxas_padrao(uuid, text, numeric, numeric, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- in-function admin enforcement
CREATE OR REPLACE FUNCTION public.gerar_calendario(p_store_id uuid, p_inicio date, p_fim date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
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
END; $function$;

CREATE OR REPLACE FUNCTION public.gerar_metas(p_store_id uuid, p_department text, p_ano integer, p_mes integer, p_base text DEFAULT 'ano_anterior'::text)
 RETURNS TABLE(dias_gerados integer, total_meta numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ini_alvo date := make_date(p_ano, p_mes, 1);
  v_fim_alvo date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
  v_ini_base date;
  v_fim_base date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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

CREATE OR REPLACE FUNCTION public.semear_taxas_padrao(p_store_id uuid, p_department text, p_tx_base numeric DEFAULT 0.02662, p_tx_forte numeric DEFAULT 0.05662, p_tx_margem numeric DEFAULT 0.0232)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_qtd integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
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
END; $function$;

CREATE OR REPLACE FUNCTION public.gerar_metas_compra(p_store_id uuid, p_ano integer, p_mes integer)
 RETURNS TABLE(departamentos integer, meta_venda_total numeric, meta_compra_total numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.compras_config%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT * INTO v_cfg FROM public.compras_config
   WHERE store_id = p_store_id AND ano = p_ano AND mes = p_mes;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuracao de compras nao encontrada para %/%', p_mes, p_ano;
  END IF;

  RETURN QUERY
  WITH hist AS (
    SELECT h.departamento,
           SUM(h.venda)  AS venda,
           SUM(h.cmv)    AS cmv,
           SUM(h.compra) AS compra
    FROM public.compras_historico h
    WHERE h.store_id = p_store_id
      AND make_date(h.ano, h.mes, 1) BETWEEN date_trunc('month', v_cfg.hist_inicio)::date
                                         AND date_trunc('month', v_cfg.hist_fim)::date
    GROUP BY h.departamento
  ), tot AS (
    SELECT SUM(venda) AS venda_total FROM hist
  ), calc AS (
    SELECT h.departamento,
           h.venda / NULLIF(t.venda_total, 0)                        AS participacao,
           (h.venda / NULLIF(t.venda_total, 0)) * v_cfg.meta_venda_mes AS meta_venda,
           h.cmv / NULLIF(h.venda, 0)                                AS cmv_pct,
           (h.cmv - h.compra) * COALESCE(d.tx_recuperacao, 1)
             / NULLIF(v_cfg.parcelas_excesso, 0)                     AS parcela,
           COALESCE(d.tx_perdas, 0)                                  AS tx_perdas
    FROM hist h
    CROSS JOIN tot t
    LEFT JOIN public.compras_departamento d
           ON d.store_id = p_store_id AND d.departamento = h.departamento
                                      AND d.ativo
  ), final AS (
    SELECT departamento, participacao, meta_venda, parcela,
           ROUND(COALESCE(cmv_pct,0) * meta_venda + COALESCE(parcela,0)
                 + tx_perdas * meta_venda, 2) AS meta_compra
    FROM calc
  ), gravado AS (
    INSERT INTO public.compras_meta
      (store_id, departamento, ano, mes, participacao, meta_venda, meta_compra,
       parcela_excesso, compra_sobre_venda, gerado_em)
    SELECT p_store_id, departamento, p_ano, p_mes,
           ROUND(COALESCE(participacao,0), 6),
           ROUND(COALESCE(meta_venda,0), 2),
           COALESCE(meta_compra,0),
           ROUND(COALESCE(parcela,0), 2),
           ROUND(COALESCE(meta_compra,0) / NULLIF(meta_venda, 0), 4),
           now()
    FROM final
    ON CONFLICT (store_id, departamento, ano, mes) DO UPDATE SET
      participacao       = EXCLUDED.participacao,
      meta_venda         = EXCLUDED.meta_venda,
      meta_compra        = EXCLUDED.meta_compra,
      parcela_excesso    = EXCLUDED.parcela_excesso,
      compra_sobre_venda = EXCLUDED.compra_sobre_venda,
      gerado_em          = now()
    RETURNING meta_venda, meta_compra
  )
  SELECT COUNT(*)::int, ROUND(COALESCE(SUM(meta_venda),0),2), ROUND(COALESCE(SUM(meta_compra),0),2)
  FROM gravado;
END; $function$;

-- 2) checklist-photos upload must be scoped to the user's own folder
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
CREATE POLICY "Users can upload own checklist photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'checklist-photos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 3) imagens bucket: read for authenticated, writes admin-only
DROP POLICY IF EXISTS "auth upload imagens" ON storage.objects;
DROP POLICY IF EXISTS "auth update imagens" ON storage.objects;
DROP POLICY IF EXISTS "auth delete imagens" ON storage.objects;
DROP POLICY IF EXISTS "auth read imagens" ON storage.objects;

CREATE POLICY "Authenticated can read imagens"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'imagens');

CREATE POLICY "Admins can upload imagens"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'imagens' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update imagens"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'imagens' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'imagens' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete imagens"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'imagens' AND public.has_role(auth.uid(), 'admin'));