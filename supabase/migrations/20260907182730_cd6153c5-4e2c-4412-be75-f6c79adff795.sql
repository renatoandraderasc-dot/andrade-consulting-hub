-- ============================================================
-- Função para consultar status do cron job de sincronização
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_sync_rede_cron_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_schedule text;
  v_next_run timestamptz;
BEGIN
  SELECT schedule, next_run_at
    INTO v_schedule, v_next_run
    FROM cron.job
   WHERE jobname = 'sync-rede-mensal-auto';

  RETURN jsonb_build_object(
    'schedule', v_schedule,
    'next_run', v_next_run
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sync_rede_cron_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sync_rede_cron_status() TO authenticated, service_role;