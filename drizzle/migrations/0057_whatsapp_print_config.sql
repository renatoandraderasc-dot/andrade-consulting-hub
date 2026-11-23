CREATE TABLE public.whatsapp_print_config (
  relatorio_id text PRIMARY KEY,
  largura int NOT NULL DEFAULT 1400,
  corte_topo int NOT NULL DEFAULT 0,
  corte_base int NOT NULL DEFAULT 0,
  altura_pagina int NOT NULL DEFAULT 0,
  formato text NOT NULL DEFAULT 'png' CHECK (formato IN ('png','jpeg')),
  qualidade numeric NOT NULL DEFAULT 0.9,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_print_config TO authenticated;
GRANT ALL ON public.whatsapp_print_config TO service_role;
ALTER TABLE public.whatsapp_print_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON public.whatsapp_print_config FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY demo_production_isolation ON public.whatsapp_print_config AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_demo_account()) WITH CHECK (NOT public.is_demo_account());