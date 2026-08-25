CREATE TABLE IF NOT EXISTS public.rede_metricas_mensais (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  mes text NOT NULL,
  faturamento numeric NOT NULL DEFAULT 0,
  cmv numeric NOT NULL DEFAULT 0,
  arrecadacao numeric NOT NULL DEFAULT 0,
  margem_pct numeric,
  volume numeric NOT NULL DEFAULT 0,
  cupons integer NOT NULL DEFAULT 0,
  ticket_medio numeric,
  compras numeric NOT NULL DEFAULT 0,
  pct_compras_vendas numeric,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, mes)
);

ALTER TABLE public.rede_metricas_mensais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read rede metricas" ON public.rede_metricas_mensais;
CREATE POLICY "Admins read rede metricas" ON public.rede_metricas_mensais
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.rede_metricas_mensais TO authenticated;
GRANT ALL ON public.rede_metricas_mensais TO service_role;