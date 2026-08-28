CREATE TABLE public.temperatura_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'Equipamento',
  temp_min numeric NOT NULL DEFAULT -18,
  temp_max numeric NOT NULL DEFAULT -12,
  turnos text[] NOT NULL DEFAULT ARRAY['Manhã','Tarde','Noite'],
  exige_foto boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.temperatura_equipamentos TO authenticated;
GRANT ALL ON public.temperatura_equipamentos TO service_role;
ALTER TABLE public.temperatura_equipamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipamentos visiveis por acesso a loja"
ON public.temperatura_equipamentos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.tem_acesso_loja(store_id));

CREATE POLICY "Equipamentos gerenciados por acesso a loja"
ON public.temperatura_equipamentos FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.tem_acesso_loja(store_id))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.tem_acesso_loja(store_id));

CREATE TRIGGER trg_temperatura_equipamentos_updated
BEFORE UPDATE ON public.temperatura_equipamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.temperatura_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  equipamento_id uuid NOT NULL REFERENCES public.temperatura_equipamentos(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  turno text NOT NULL DEFAULT 'Manhã',
  temperatura numeric NOT NULL,
  conforme boolean NOT NULL DEFAULT true,
  observacao text,
  photo_url text,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipamento_id, data, turno)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.temperatura_registros TO authenticated;
GRANT ALL ON public.temperatura_registros TO service_role;
ALTER TABLE public.temperatura_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Registros visiveis por acesso a loja"
ON public.temperatura_registros FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.tem_acesso_loja(store_id));

CREATE POLICY "Registros inseridos por acesso a loja"
ON public.temperatura_registros FOR INSERT TO authenticated
WITH CHECK ((public.has_role(auth.uid(), 'admin') OR public.tem_acesso_loja(store_id)) AND user_id = auth.uid());

CREATE POLICY "Registros editados pelo autor ou admin"
ON public.temperatura_registros FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR (user_id = auth.uid() AND public.tem_acesso_loja(store_id)))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR (user_id = auth.uid() AND public.tem_acesso_loja(store_id)));

CREATE POLICY "Registros removidos por admin"
ON public.temperatura_registros FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_temp_registros_store_data ON public.temperatura_registros (store_id, data DESC);

CREATE TRIGGER trg_temperatura_registros_updated
BEFORE UPDATE ON public.temperatura_registros
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins gerenciam departamentos"
ON public.departments FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));