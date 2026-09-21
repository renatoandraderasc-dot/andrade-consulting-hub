CREATE TABLE public.painel_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  ano integer NOT NULL,
  mes integer NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, ano, mes)
);

CREATE INDEX idx_painel_mensal_loja_ano ON public.painel_mensal (store_id, ano);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.painel_mensal TO authenticated;
GRANT ALL ON public.painel_mensal TO service_role;

ALTER TABLE public.painel_mensal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "painel_mensal leitura por acesso a loja"
ON public.painel_mensal FOR SELECT TO authenticated
USING (public.tem_acesso_loja(store_id));

CREATE POLICY "painel_mensal gravacao por acesso a loja"
ON public.painel_mensal FOR INSERT TO authenticated
WITH CHECK (public.tem_acesso_loja(store_id));

CREATE POLICY "painel_mensal atualizacao por acesso a loja"
ON public.painel_mensal FOR UPDATE TO authenticated
USING (public.tem_acesso_loja(store_id))
WITH CHECK (public.tem_acesso_loja(store_id));

CREATE POLICY "painel_mensal exclusao por acesso a loja"
ON public.painel_mensal FOR DELETE TO authenticated
USING (public.tem_acesso_loja(store_id));