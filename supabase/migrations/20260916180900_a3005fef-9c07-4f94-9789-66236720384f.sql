-- ============================================================
-- Modo de sincronizacao diaria (D-1) por loja + cache de relatorios
-- ============================================================

ALTER TABLE public.store_vr_config
  ADD COLUMN IF NOT EXISTS modo_sync text NOT NULL DEFAULT 'ao_vivo'
  CHECK (modo_sync IN ('ao_vivo', 'diario_d1'));

CREATE TABLE IF NOT EXISTS public.relatorio_cache (
  id            bigserial PRIMARY KEY,
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  relatorio     text NOT NULL,
  params_chave  text NOT NULL,
  params        jsonb NOT NULL DEFAULT '{}'::jsonb,
  fim           date,
  dados         jsonb NOT NULL DEFAULT '[]'::jsonb,
  linhas        integer NOT NULL DEFAULT 0,
  origem        text NOT NULL DEFAULT 'proxy',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, relatorio, params_chave)
);

GRANT SELECT ON public.relatorio_cache TO authenticated;
GRANT ALL ON public.relatorio_cache TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.relatorio_cache_id_seq TO service_role;

CREATE INDEX IF NOT EXISTS relatorio_cache_store_fim_idx
  ON public.relatorio_cache (store_id, fim DESC);

ALTER TABLE public.relatorio_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relatorio_cache_select ON public.relatorio_cache;
CREATE POLICY relatorio_cache_select ON public.relatorio_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.user_store_access a
               WHERE a.user_id = auth.uid() AND a.store_id = relatorio_cache.store_id AND a.approved = true)
  );

-- Sta Izabel entra no modo diario
UPDATE public.store_vr_config
   SET modo_sync = 'diario_d1'
 WHERE store_id = '0bd78cba-a25d-45e2-babe-55961267bd37';

-- ============================================================
-- Job das 08:00 (Brasilia = 11:00 UTC)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_diario_d1_auto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sync-diario-d1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
END;
$function$;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-diario-d1-0800';
SELECT cron.schedule(
  'sync-diario-d1-0800',
  '0 11 * * *',
  $cron$ SELECT public.sync_diario_d1_auto(); $cron$
);
