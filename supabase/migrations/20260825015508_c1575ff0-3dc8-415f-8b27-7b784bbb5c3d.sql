CREATE TABLE IF NOT EXISTS public.store_margem_config (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  carga_tributaria_cmv_pct numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_margem_config TO authenticated;
GRANT ALL ON public.store_margem_config TO service_role;
ALTER TABLE public.store_margem_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios com acesso leem config de margem" ON public.store_margem_config FOR SELECT TO authenticated USING (public.tem_acesso_loja(store_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins gerenciam config de margem" ON public.store_margem_config FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT INSERT, UPDATE, DELETE ON public.store_margem_config TO authenticated;
INSERT INTO public.store_margem_config (store_id, carga_tributaria_cmv_pct)
SELECT id, 2.84 FROM public.stores WHERE name ILIKE '%araujo%boca%' OR name ILIKE '%araújo%boca%'
ON CONFLICT (store_id) DO NOTHING;