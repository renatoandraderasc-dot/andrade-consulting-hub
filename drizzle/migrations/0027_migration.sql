CREATE TABLE public.compras_alcada_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  departamento text NOT NULL DEFAULT '',
  limite_dentro_dias numeric NOT NULL DEFAULT 15,
  limite_fora_dias numeric NOT NULL DEFAULT 30,
  limite_variacao_pct numeric NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);
CREATE UNIQUE INDEX compras_alcada_config_uk ON public.compras_alcada_config (COALESCE(store_id,'00000000-0000-0000-0000-000000000000'::uuid), departamento);
ALTER TABLE public.compras_alcada_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.compras_alcada_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.compras_alcada_config TO authenticated;
CREATE POLICY "alcada leitura" ON public.compras_alcada_config FOR SELECT TO authenticated
  USING (store_id IS NULL OR public.tem_acesso_loja(store_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "alcada admin escreve" ON public.compras_alcada_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.compras_alcada_config (store_id, departamento, limite_dentro_dias, limite_fora_dias) VALUES
 (NULL,'HORTIFRUTI',3,7),(NULL,'PADARIA',3,7),(NULL,'AÇOUGUE',7,15),(NULL,'',15,30);