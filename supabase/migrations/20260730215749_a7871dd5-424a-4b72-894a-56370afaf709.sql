ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS origem_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_origem_unico
  ON public.lancamentos (store_id, origem, origem_ref)
  WHERE origem_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vr_lancamento_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  id_tipo integer NOT NULL,
  tipo text NOT NULL,
  subtipo text NOT NULL,
  descricao_vr text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vr_lancamento_map_padrao
  ON public.vr_lancamento_map (id_tipo) WHERE store_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vr_lancamento_map_loja
  ON public.vr_lancamento_map (store_id, id_tipo) WHERE store_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vr_lancamento_map TO authenticated;
GRANT ALL ON public.vr_lancamento_map TO service_role;

ALTER TABLE public.vr_lancamento_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth pode ver mapeamentos"
  ON public.vr_lancamento_map FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins gerenciam mapeamentos"
  ON public.vr_lancamento_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER vr_lancamento_map_updated_at
  BEFORE UPDATE ON public.vr_lancamento_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();