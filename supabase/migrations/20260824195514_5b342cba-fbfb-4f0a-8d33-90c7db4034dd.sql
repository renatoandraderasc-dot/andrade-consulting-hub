DROP INDEX IF EXISTS public.precos_concorrente_site_sku_key;
DELETE FROM public.precos_concorrente a USING public.precos_concorrente b
 WHERE a.ctid < b.ctid AND a.site_concorrente_id IS NOT NULL
   AND a.site_concorrente_id = b.site_concorrente_id AND a.sku = b.sku;
CREATE UNIQUE INDEX precos_concorrente_site_sku_key
  ON public.precos_concorrente (site_concorrente_id, sku);

ALTER TABLE public.sites_concorrentes
  ADD COLUMN IF NOT EXISTS provedor text,
  ADD COLUMN IF NOT EXISTS coletor_disponivel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deteccao_evidencia text,
  ADD COLUMN IF NOT EXISTS loja_externa_param text;

CREATE TABLE IF NOT EXISTS public.plataformas_detectadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL,
  plataforma text NOT NULL,
  provedor text,
  evidencia text,
  coletor_disponivel boolean NOT NULL DEFAULT false,
  suporta_regiao boolean NOT NULL DEFAULT false,
  corrigida_manualmente boolean NOT NULL DEFAULT false,
  plataforma_corrigida text,
  site_concorrente_id uuid REFERENCES public.sites_concorrentes(id) ON DELETE SET NULL,
  detectada_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plataformas_detectadas TO authenticated;
GRANT ALL ON public.plataformas_detectadas TO service_role;
ALTER TABLE public.plataformas_detectadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin gerencia deteccoes" ON public.plataformas_detectadas
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "autenticado le deteccoes" ON public.plataformas_detectadas
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_plataformas_detectadas_host ON public.plataformas_detectadas (host);