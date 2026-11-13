DO $$
DECLARE f record; definition text;
BEGIN
  FOR f IN SELECT p.oid, p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.prosecdef AND l.lanname='plpgsql' AND p.prorettype <> 'trigger'::regtype AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  LOOP
    definition := pg_get_functiondef(f.oid);
    definition := regexp_replace(definition, E'\\mBEGIN\\M', E'BEGIN\n  IF public.is_demo_account() THEN RAISE EXCEPTION ''Acesso restrito ao ambiente de demonstração.'' USING ERRCODE = ''42501''; END IF;', 'i');
    EXECUTE definition;
  END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION public.meta_venda_mes_dashboard(p_store_id uuid, p_ano integer, p_mes integer) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(sum(meta_vendas),0) FROM public.store_daily_metrics WHERE store_id=p_store_id AND department='LOJA' AND date>=make_date(p_ano,p_mes,1) AND date<(make_date(p_ano,p_mes,1)+interval '1 month')::date AND NOT public.is_demo_account();
$$;
CREATE OR REPLACE FUNCTION public.store_sistema(_store_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT upper(coalesce(sistema,'VR')) FROM public.store_vr_config WHERE store_id=_store_id AND NOT public.is_demo_account() LIMIT 1;
$$;