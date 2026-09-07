-- ============================================================
-- Reverter funções desnecessárias de SECURITY DEFINER para INVOKER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_saas_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ============================================================
-- Revogar EXECUTE direto das funções administrativas/cron
-- ============================================================
REVOKE ALL ON FUNCTION public.sync_rede_mensal_auto() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_config_recreate_jobs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.minutos_para_cron(integer) FROM PUBLIC, anon;

-- service_role e postgres mantêm acesso implícito como owners/cron
GRANT EXECUTE ON FUNCTION public.minutos_para_cron(integer) TO authenticated;

-- Garantir que apenas service_role/cron disparem as funções admin
GRANT EXECUTE ON FUNCTION public.sync_rede_mensal_auto() TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_config_recreate_jobs() TO service_role;