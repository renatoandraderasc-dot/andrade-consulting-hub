CREATE TABLE public.store_sync_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','partial','failed')),
 started_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 d1 date NOT NULL,
 total integer NOT NULL DEFAULT 0,
 processed integer NOT NULL DEFAULT 0,
 succeeded integer NOT NULL DEFAULT 0,
 failed integer NOT NULL DEFAULT 0,
 unavailable integer NOT NULL DEFAULT 0,
 current_report text,
 last_error text,
 tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
 lease_id uuid,
 lease_until timestamptz
);
GRANT SELECT ON public.store_sync_jobs TO authenticated;
GRANT ALL ON public.store_sync_jobs TO service_role;
ALTER TABLE public.store_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_sync_jobs_admin_read ON public.store_sync_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX store_sync_jobs_one_active ON public.store_sync_jobs(store_id) WHERE status IN ('pending','running');
CREATE INDEX store_sync_jobs_store_started ON public.store_sync_jobs(store_id, started_at DESC);
CREATE INDEX relatorio_cache_store_updated ON public.relatorio_cache(store_id, atualizado_em DESC);
CREATE OR REPLACE FUNCTION public.admin_store_sync_summary()
RETURNS TABLE(store_id uuid, last_saved_at timestamptz, saved_reports bigint, data_through date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT r.store_id, max(r.atualizado_em), count(*), max(r.fim)
 FROM public.relatorio_cache r
 WHERE public.has_role(auth.uid(), 'admin')
 GROUP BY r.store_id;
$$;
REVOKE ALL ON FUNCTION public.admin_store_sync_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_store_sync_summary() TO authenticated, service_role;