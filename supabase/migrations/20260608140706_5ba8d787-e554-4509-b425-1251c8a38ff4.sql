
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.vendas_padaria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  ranking_dia_semana text,
  tipo text,
  mes integer,
  dia_sem text,
  vendas_realizada numeric DEFAULT 0,
  margem_realizada numeric DEFAULT 0,
  volume numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas_padaria TO authenticated;
GRANT ALL ON public.vendas_padaria TO service_role;

ALTER TABLE public.vendas_padaria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view vendas_padaria" ON public.vendas_padaria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert vendas_padaria" ON public.vendas_padaria FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update vendas_padaria" ON public.vendas_padaria FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete vendas_padaria" ON public.vendas_padaria FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_vendas_padaria_data ON public.vendas_padaria(data);
CREATE INDEX idx_vendas_padaria_mes ON public.vendas_padaria(mes);

CREATE TRIGGER update_vendas_padaria_updated_at
  BEFORE UPDATE ON public.vendas_padaria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
