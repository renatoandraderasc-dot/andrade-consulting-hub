CREATE TABLE public.painel_periodo_cache (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  relatorio text NOT NULL,
  departamento text NOT NULL DEFAULT '',
  de date NOT NULL,
  ate date NOT NULL,
  dados jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, relatorio, departamento, de, ate)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.painel_periodo_cache TO authenticated;
GRANT ALL ON public.painel_periodo_cache TO service_role;

ALTER TABLE public.painel_periodo_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "painel_periodo_cache leitura por acesso a loja"
  ON public.painel_periodo_cache FOR SELECT TO authenticated
  USING (public.tem_acesso_loja(store_id));

CREATE POLICY "painel_periodo_cache gravacao por acesso a loja"
  ON public.painel_periodo_cache FOR INSERT TO authenticated
  WITH CHECK (public.tem_acesso_loja(store_id));

CREATE POLICY "painel_periodo_cache atualizacao por acesso a loja"
  ON public.painel_periodo_cache FOR UPDATE TO authenticated
  USING (public.tem_acesso_loja(store_id)) WITH CHECK (public.tem_acesso_loja(store_id));

CREATE POLICY "painel_periodo_cache exclusao por acesso a loja"
  ON public.painel_periodo_cache FOR DELETE TO authenticated
  USING (public.tem_acesso_loja(store_id));