CREATE OR REPLACE FUNCTION public.importar_lancamentos_vr_auto()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE r record; v_tot integer := 0; v_g integer; v_ini date; v_fim date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  v_ini := date_trunc('month', now() - interval '1 month')::date;
  v_fim := (now() + interval '1 day')::date;

  FOR r IN SELECT store_id, COALESCE(sistema,'VR') AS sistema
             FROM public.store_vr_config WHERE enabled LOOP
    BEGIN
      IF upper(r.sistema) = 'WEBSAC' THEN
        PERFORM net.http_post(
          url := current_setting('app.settings.supabase_url', true)
                 || '/functions/v1/importar-lancamentos-vr',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)),
          body := jsonb_build_object(
            'store_id', r.store_id,
            'user_id', (SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1),
            'inicio', v_ini, 'fim', v_fim));
      ELSE
        SELECT gravados INTO v_g
          FROM public.importar_lancamentos_vr(r.store_id, v_ini, v_fim);
        v_tot := v_tot + COALESCE(v_g, 0);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.store_vr_config SET last_error = SQLERRM WHERE store_id = r.store_id;
    END;
  END LOOP;
  RETURN v_tot;
END; $function$;