CREATE POLICY "sites ativos visiveis para escolha"
  ON public.sites_concorrentes FOR SELECT
  TO authenticated
  USING (ativo = true);