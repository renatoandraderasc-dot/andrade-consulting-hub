ALTER TABLE public.jornada_perfis
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_jornada_perfis_store ON public.jornada_perfis(store_id);