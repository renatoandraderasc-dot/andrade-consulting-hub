ALTER TABLE public.store_vr_config
  ADD COLUMN IF NOT EXISTS online boolean,
  ADD COLUMN IF NOT EXISTS last_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS health_error text;

CREATE OR REPLACE VIEW public.vr_sync_status AS
  SELECT store_id, enabled, last_sync_at, online, last_check_at, latency_ms, health_error
    FROM public.store_vr_config;

GRANT SELECT ON public.vr_sync_status TO authenticated;