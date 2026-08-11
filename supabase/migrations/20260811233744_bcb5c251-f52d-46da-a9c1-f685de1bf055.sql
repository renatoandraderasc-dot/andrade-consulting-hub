CREATE TABLE public.encarte_calendario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo_faixa text NOT NULL DEFAULT 'neutro',
  dia_inicio int NOT NULL,
  dia_fim int NOT NULL,
  agv_pct numeric NOT NULL DEFAULT 0,
  agressivo boolean NOT NULL DEFAULT false,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.encarte_calendario TO authenticated;
GRANT ALL ON public.encarte_calendario TO service_role;
ALTER TABLE public.encarte_calendario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Calendario legivel por autenticados" ON public.encarte_calendario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam calendario" ON public.encarte_calendario FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.encarte_config_loja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  fecha_domingo boolean NOT NULL DEFAULT false,
  total_itens int NOT NULL DEFAULT 50,
  split_capa int NOT NULL DEFAULT 20,
  split_verso int NOT NULL DEFAULT 30,
  janela_nao_repetir_semanas int NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_config_loja TO authenticated;
GRANT ALL ON public.encarte_config_loja TO service_role;
ALTER TABLE public.encarte_config_loja ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam config encarte" ON public.encarte_config_loja FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Usuarios da loja leem config encarte" ON public.encarte_config_loja FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_store_access usa WHERE usa.user_id = auth.uid() AND usa.store_id = encarte_config_loja.store_id AND usa.approved));

CREATE TABLE public.encarte_gerado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  data_inicio date,
  data_fim date,
  agv_pct numeric,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_gerado TO authenticated;
GRANT ALL ON public.encarte_gerado TO service_role;
ALTER TABLE public.encarte_gerado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam encartes gerados" ON public.encarte_gerado FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Usuarios da loja leem encartes gerados" ON public.encarte_gerado FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_store_access usa WHERE usa.user_id = auth.uid() AND usa.store_id = encarte_gerado.store_id AND usa.approved));

CREATE TABLE public.encarte_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encarte_id uuid NOT NULL REFERENCES public.encarte_gerado(id) ON DELETE CASCADE,
  codigo text,
  descricao text,
  departamento text,
  tipo_faixa text,
  custo numeric,
  venda_atual numeric,
  preco_oferta numeric,
  margem_oferta numeric,
  indice_elast numeric,
  giro_90d numeric,
  estoque numeric,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_item TO authenticated;
GRANT ALL ON public.encarte_item TO service_role;
ALTER TABLE public.encarte_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam itens de encarte" ON public.encarte_item FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Usuarios da loja leem itens de encarte" ON public.encarte_item FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.encarte_gerado g JOIN public.user_store_access usa ON usa.store_id = g.store_id WHERE g.id = encarte_item.encarte_id AND usa.user_id = auth.uid() AND usa.approved));

CREATE INDEX idx_encarte_item_encarte ON public.encarte_item(encarte_id);
CREATE INDEX idx_encarte_gerado_store ON public.encarte_gerado(store_id);

CREATE TRIGGER trg_encarte_calendario_updated BEFORE UPDATE ON public.encarte_calendario FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_encarte_config_loja_updated BEFORE UPDATE ON public.encarte_config_loja FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_encarte_gerado_updated BEFORE UPDATE ON public.encarte_gerado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();