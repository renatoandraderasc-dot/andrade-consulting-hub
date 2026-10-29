CREATE TABLE public.calendario_promocional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  nome text NOT NULL DEFAULT '',
  agv_pct numeric,
  destaque boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.calendario_promocional(store_id, data_inicio);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendario_promocional TO authenticated;
GRANT ALL ON public.calendario_promocional TO service_role;
ALTER TABLE public.calendario_promocional ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver calendario" ON public.calendario_promocional FOR SELECT TO authenticated USING (public.tem_acesso_loja(store_id));
CREATE POLICY "gerir calendario" ON public.calendario_promocional FOR ALL TO authenticated USING (public.tem_acesso_loja(store_id)) WITH CHECK (public.tem_acesso_loja(store_id));