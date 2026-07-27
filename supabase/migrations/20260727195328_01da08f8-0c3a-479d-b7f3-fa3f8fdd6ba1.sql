-- 1. Conexao VR de cada loja (SOMENTE admins enxergam — a chave fica aqui)
CREATE TABLE IF NOT EXISTS public.store_vr_config (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  api_url text NOT NULL,
  api_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_vr_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage vr config" ON public.store_vr_config;
CREATE POLICY "Admins manage vr config" ON public.store_vr_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_vr_config TO authenticated;
GRANT ALL ON public.store_vr_config TO service_role;

-- 2. Mapeamento: nome da secao no VR -> departamento do Hub
CREATE TABLE IF NOT EXISTS public.vr_secao_departamento (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  secao_vr text NOT NULL,
  department text NOT NULL,
  UNIQUE (store_id, secao_vr)
);

ALTER TABLE public.vr_secao_departamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage secao map" ON public.vr_secao_departamento;
CREATE POLICY "Admins manage secao map" ON public.vr_secao_departamento
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vr_secao_departamento TO authenticated;
GRANT ALL ON public.vr_secao_departamento TO service_role;

-- 3. Status da sincronizacao visivel aos clientes (sem expor url/chave)
CREATE OR REPLACE VIEW public.vr_sync_status AS
  SELECT store_id, enabled, last_sync_at FROM public.store_vr_config;

GRANT SELECT ON public.vr_sync_status TO authenticated;

-- 4. SEGURANCA: vendas_padaria aceita INSERT/UPDATE/DELETE de qualquer
--    usuario logado. Restringe a admins.
DROP POLICY IF EXISTS "Authenticated can insert vendas_padaria" ON public.vendas_padaria;
DROP POLICY IF EXISTS "Admins can insert vendas_padaria" ON public.vendas_padaria;
CREATE POLICY "Admins can insert vendas_padaria" ON public.vendas_padaria
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can update vendas_padaria" ON public.vendas_padaria;
DROP POLICY IF EXISTS "Admins can update vendas_padaria" ON public.vendas_padaria;
CREATE POLICY "Admins can update vendas_padaria" ON public.vendas_padaria
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can delete vendas_padaria" ON public.vendas_padaria;
DROP POLICY IF EXISTS "Admins can delete vendas_padaria" ON public.vendas_padaria;
CREATE POLICY "Admins can delete vendas_padaria" ON public.vendas_padaria
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));