CREATE TABLE public.premiacao_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  valor_premiacao numeric NOT NULL DEFAULT 0,
  peso_faturamento numeric NOT NULL DEFAULT 25,
  peso_arrecadacao numeric NOT NULL DEFAULT 40,
  peso_volume numeric NOT NULL DEFAULT 20,
  peso_mix numeric NOT NULL DEFAULT 15,
  atingimento_minimo numeric NOT NULL DEFAULT 99,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.premiacao_config TO authenticated;
GRANT ALL ON public.premiacao_config TO service_role;

ALTER TABLE public.premiacao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam premiacao_config"
ON public.premiacao_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_premiacao_config_updated
BEFORE UPDATE ON public.premiacao_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();