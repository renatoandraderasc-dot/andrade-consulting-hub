ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS tipo_entrada text,
  ADD COLUMN IF NOT EXISTS id_tipo integer,
  ADD COLUMN IF NOT EXISTS classificacao_manual boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.controladoria_conta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'Despesas',
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, nome)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.controladoria_conta TO authenticated;
GRANT ALL ON public.controladoria_conta TO service_role;

ALTER TABLE public.controladoria_conta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contas visiveis para quem tem acesso a loja"
ON public.controladoria_conta FOR SELECT TO authenticated
USING (public.tem_acesso_loja(store_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins gerenciam contas"
ON public.controladoria_conta FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_controladoria_conta_updated_at
BEFORE UPDATE ON public.controladoria_conta
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();