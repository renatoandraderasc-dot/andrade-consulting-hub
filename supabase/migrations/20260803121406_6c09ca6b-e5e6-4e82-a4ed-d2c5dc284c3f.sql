ALTER TABLE public.store_vr_config
  ADD COLUMN IF NOT EXISTS codigo_loja integer,
  ADD COLUMN IF NOT EXISTS sistema text NOT NULL DEFAULT 'VR';

COMMENT ON COLUMN public.store_vr_config.codigo_loja IS
  'Codigo da loja no sistema de origem (codestabelec no WebSac).';
COMMENT ON COLUMN public.store_vr_config.sistema IS
  'VR ou WEBSAC.';

CREATE TABLE IF NOT EXISTS public.websac_relatorios (
  nome text PRIMARY KEY,
  descricao text,
  sql text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.websac_relatorios TO authenticated;
GRANT ALL ON public.websac_relatorios TO service_role;

ALTER TABLE public.websac_relatorios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage websac relatorios" ON public.websac_relatorios;
CREATE POLICY "Admins manage websac relatorios" ON public.websac_relatorios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));