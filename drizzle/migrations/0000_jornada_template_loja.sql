CREATE TABLE public.jornada_template_loja (
  template_id uuid NOT NULL REFERENCES public.jornada_templates(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, store_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jornada_template_loja TO authenticated;
GRANT ALL ON public.jornada_template_loja TO service_role;

ALTER TABLE public.jornada_template_loja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ler lojas do template" ON public.jornada_template_loja
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin gerencia lojas do template" ON public.jornada_template_loja
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_jornada_template_loja_store ON public.jornada_template_loja(store_id);