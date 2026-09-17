CREATE TABLE IF NOT EXISTS public.store_group_members (
  group_store_id  uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  member_store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  PRIMARY KEY (group_store_id, member_store_id),
  CHECK (group_store_id <> member_store_id)
);

GRANT SELECT ON public.store_group_members TO authenticated;
GRANT ALL ON public.store_group_members TO service_role;

ALTER TABLE public.store_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read group members" ON public.store_group_members;
CREATE POLICY "auth read group members" ON public.store_group_members FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.fn_grupo_recalc_daily(p_group uuid, p_date date, p_department text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  SELECT SUM(meta_vendas) mv, SUM(realizado_vendas) rv, SUM(projecao_vendas) pv,
         SUM(meta_lucro) ml, SUM(realizado_lucro) rl, SUM(projecao_lucro) pl,
         SUM(meta_volume) mvol, SUM(realizado_volume) rvol, SUM(projecao_volume) pvol,
         MIN(tipo_dia) tipo_dia, COUNT(*) n
    INTO r
  FROM store_daily_metrics d
  JOIN store_group_members g ON g.member_store_id = d.store_id
  WHERE g.group_store_id = p_group AND d.date = p_date AND d.department = p_department;

  IF r.n = 0 THEN
    DELETE FROM store_daily_metrics WHERE store_id = p_group AND date = p_date AND department = p_department;
    RETURN;
  END IF;

  INSERT INTO store_daily_metrics (store_id, department, date, tipo_dia,
      meta_vendas, realizado_vendas, projecao_vendas,
      meta_lucro, realizado_lucro, projecao_lucro,
      meta_margem_pct, realizado_margem_pct, projecao_margem_pct,
      meta_volume, realizado_volume, projecao_volume)
  VALUES (p_group, p_department, p_date, COALESCE(r.tipo_dia, 'D'),
      COALESCE(r.mv,0), COALESCE(r.rv,0), COALESCE(r.pv,0),
      COALESCE(r.ml,0), COALESCE(r.rl,0), COALESCE(r.pl,0),
      CASE WHEN COALESCE(r.mv,0) <> 0 THEN ROUND(r.ml / r.mv * 100, 2) ELSE 0 END,
      CASE WHEN COALESCE(r.rv,0) <> 0 THEN ROUND(r.rl / r.rv * 100, 2) ELSE 0 END,
      CASE WHEN COALESCE(r.pv,0) <> 0 THEN ROUND(r.pl / r.pv * 100, 2) ELSE 0 END,
      COALESCE(r.mvol,0), COALESCE(r.rvol,0), COALESCE(r.pvol,0))
  ON CONFLICT (store_id, department, date) DO UPDATE SET
      tipo_dia = EXCLUDED.tipo_dia,
      meta_vendas = EXCLUDED.meta_vendas, realizado_vendas = EXCLUDED.realizado_vendas, projecao_vendas = EXCLUDED.projecao_vendas,
      meta_lucro = EXCLUDED.meta_lucro, realizado_lucro = EXCLUDED.realizado_lucro, projecao_lucro = EXCLUDED.projecao_lucro,
      meta_margem_pct = EXCLUDED.meta_margem_pct, realizado_margem_pct = EXCLUDED.realizado_margem_pct, projecao_margem_pct = EXCLUDED.projecao_margem_pct,
      meta_volume = EXCLUDED.meta_volume, realizado_volume = EXCLUDED.realizado_volume, projecao_volume = EXCLUDED.projecao_volume;
END $$;

CREATE OR REPLACE FUNCTION public.fn_grupo_recalc_dept_month(p_group uuid, p_department text, p_month int, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  SELECT SUM(faturamento) f, SUM(faturamento_promocao) fp,
         CASE WHEN SUM(faturamento) <> 0 THEN SUM(faturamento * margem) / SUM(faturamento) ELSE AVG(margem) END m,
         COUNT(*) n
    INTO r
  FROM store_department_metrics d JOIN store_group_members g ON g.member_store_id = d.store_id
  WHERE g.group_store_id = p_group AND d.department = p_department AND d.month = p_month AND d.year = p_year;
  IF r.n = 0 THEN
    DELETE FROM store_department_metrics WHERE store_id = p_group AND department = p_department AND month = p_month AND year = p_year;
    RETURN;
  END IF;
  INSERT INTO store_department_metrics (store_id, department, month, year, faturamento, margem, faturamento_promocao)
  VALUES (p_group, p_department, p_month, p_year, COALESCE(r.f,0), ROUND(COALESCE(r.m,0), 2), COALESCE(r.fp,0))
  ON CONFLICT (store_id, department, month, year) DO UPDATE SET
    faturamento = EXCLUDED.faturamento, margem = EXCLUDED.margem, faturamento_promocao = EXCLUDED.faturamento_promocao;
END $$;

CREATE OR REPLACE FUNCTION public.fn_grupo_recalc_store_month(p_group uuid, p_month int, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  SELECT SUM(faturamento) f, SUM(meta_faturamento) mf, SUM(clientes) c,
         CASE WHEN SUM(faturamento) <> 0 THEN SUM(faturamento * margem) / SUM(faturamento) ELSE AVG(margem) END m,
         CASE WHEN SUM(clientes) > 0 THEN SUM(faturamento) / SUM(clientes) ELSE 0 END t,
         COUNT(*) n
    INTO r
  FROM store_metrics d JOIN store_group_members g ON g.member_store_id = d.store_id
  WHERE g.group_store_id = p_group AND d.month = p_month AND d.year = p_year;
  IF r.n = 0 THEN
    DELETE FROM store_metrics WHERE store_id = p_group AND month = p_month AND year = p_year;
    RETURN;
  END IF;
  INSERT INTO store_metrics (store_id, month, year, faturamento, margem, meta_faturamento, clientes, ticket_medio, updated_at)
  VALUES (p_group, p_month, p_year, COALESCE(r.f,0), ROUND(COALESCE(r.m,0),2), COALESCE(r.mf,0), COALESCE(r.c,0), ROUND(COALESCE(r.t,0),2), now())
  ON CONFLICT (store_id, month, year) DO UPDATE SET
    faturamento = EXCLUDED.faturamento, margem = EXCLUDED.margem, meta_faturamento = EXCLUDED.meta_faturamento,
    clientes = EXCLUDED.clientes, ticket_medio = EXCLUDED.ticket_medio, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.trg_grupo_daily() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g uuid; rec RECORD;
BEGIN
  rec := COALESCE(NEW, OLD);
  FOR g IN SELECT group_store_id FROM store_group_members WHERE member_store_id = rec.store_id LOOP
    PERFORM fn_grupo_recalc_daily(g, rec.date, rec.department);
    IF TG_OP = 'UPDATE' AND (OLD.date <> NEW.date OR OLD.department <> NEW.department) THEN
      PERFORM fn_grupo_recalc_daily(g, OLD.date, OLD.department);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_grupo_daily ON public.store_daily_metrics;
CREATE TRIGGER trg_grupo_daily AFTER INSERT OR UPDATE OR DELETE ON public.store_daily_metrics
  FOR EACH ROW EXECUTE FUNCTION public.trg_grupo_daily();

CREATE OR REPLACE FUNCTION public.trg_grupo_dept_month() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g uuid; rec RECORD;
BEGIN
  rec := COALESCE(NEW, OLD);
  FOR g IN SELECT group_store_id FROM store_group_members WHERE member_store_id = rec.store_id LOOP
    PERFORM fn_grupo_recalc_dept_month(g, rec.department, rec.month, rec.year);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_grupo_dept_month ON public.store_department_metrics;
CREATE TRIGGER trg_grupo_dept_month AFTER INSERT OR UPDATE OR DELETE ON public.store_department_metrics
  FOR EACH ROW EXECUTE FUNCTION public.trg_grupo_dept_month();

CREATE OR REPLACE FUNCTION public.trg_grupo_store_month() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g uuid; rec RECORD;
BEGIN
  rec := COALESCE(NEW, OLD);
  FOR g IN SELECT group_store_id FROM store_group_members WHERE member_store_id = rec.store_id LOOP
    PERFORM fn_grupo_recalc_store_month(g, rec.month, rec.year);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_grupo_store_month ON public.store_metrics;
CREATE TRIGGER trg_grupo_store_month AFTER INSERT OR UPDATE OR DELETE ON public.store_metrics
  FOR EACH ROW EXECUTE FUNCTION public.trg_grupo_store_month();

CREATE OR REPLACE FUNCTION public.fn_grupo_recalc_all(p_group uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  DELETE FROM store_daily_metrics WHERE store_id = p_group;
  DELETE FROM store_department_metrics WHERE store_id = p_group;
  DELETE FROM store_metrics WHERE store_id = p_group;
  FOR r IN SELECT DISTINCT d.date, d.department FROM store_daily_metrics d JOIN store_group_members g ON g.member_store_id = d.store_id WHERE g.group_store_id = p_group LOOP
    PERFORM fn_grupo_recalc_daily(p_group, r.date, r.department);
  END LOOP;
  FOR r IN SELECT DISTINCT d.department, d.month, d.year FROM store_department_metrics d JOIN store_group_members g ON g.member_store_id = d.store_id WHERE g.group_store_id = p_group LOOP
    PERFORM fn_grupo_recalc_dept_month(p_group, r.department, r.month, r.year);
  END LOOP;
  FOR r IN SELECT DISTINCT d.month, d.year FROM store_metrics d JOIN store_group_members g ON g.member_store_id = d.store_id WHERE g.group_store_id = p_group LOOP
    PERFORM fn_grupo_recalc_store_month(p_group, r.month, r.year);
  END LOOP;
END $$;