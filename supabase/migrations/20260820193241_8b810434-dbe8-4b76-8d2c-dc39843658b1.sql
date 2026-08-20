
-- ========== MODELO ==========
CREATE TABLE IF NOT EXISTS public.encarte_modelo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  padrao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_modelo TO authenticated;
GRANT ALL ON public.encarte_modelo TO service_role;
ALTER TABLE public.encarte_modelo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Modelos legiveis por autenticados" ON public.encarte_modelo FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam modelos" ON public.encarte_modelo FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.encarte_modelo_slot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES public.encarte_modelo(id) ON DELETE CASCADE,
  face text NOT NULL CHECK (face IN ('capa','verso')),
  posicao integer NOT NULL,
  tipo_faixa text NOT NULL DEFAULT 'neutro' CHECK (tipo_faixa IN ('vermelho','amarelo','neutro')),
  departamento text,
  categoria text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS encarte_modelo_slot_uk ON public.encarte_modelo_slot(modelo_id, face, posicao);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_modelo_slot TO authenticated;
GRANT ALL ON public.encarte_modelo_slot TO service_role;
ALTER TABLE public.encarte_modelo_slot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Slots legiveis por autenticados" ON public.encarte_modelo_slot FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam slots" ON public.encarte_modelo_slot FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ========== CATEGORIAS ==========
CREATE TABLE IF NOT EXISTS public.encarte_categoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  departamento text,
  termos text[] NOT NULL DEFAULT '{}',
  vermelho boolean NOT NULL DEFAULT true,
  amarelo boolean NOT NULL DEFAULT true,
  neutro boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_categoria TO authenticated;
GRANT ALL ON public.encarte_categoria TO service_role;
ALTER TABLE public.encarte_categoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categorias legiveis por autenticados" ON public.encarte_categoria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam categorias" ON public.encarte_categoria FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.encarte_categoria_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES public.encarte_categoria(id) ON DELETE CASCADE,
  secao text,
  grupo text,
  subgrupo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS encarte_categoria_map_store_idx ON public.encarte_categoria_map(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_categoria_map TO authenticated;
GRANT ALL ON public.encarte_categoria_map TO service_role;
ALTER TABLE public.encarte_categoria_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mapa legivel por autenticados" ON public.encarte_categoria_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam mapa" ON public.encarte_categoria_map FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ========== REGRAS POR FAIXA ==========
CREATE TABLE IF NOT EXISTS public.encarte_regra_faixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_faixa text NOT NULL UNIQUE CHECK (tipo_faixa IN ('vermelho','amarelo','neutro')),
  margem_minima_pct numeric NOT NULL DEFAULT 3,
  desconto_max_pct numeric NOT NULL DEFAULT 25,
  janela_giro_dias integer NOT NULL DEFAULT 90,
  peso_giro numeric NOT NULL DEFAULT 0.4,
  peso_margem numeric NOT NULL DEFAULT 0.2,
  peso_concorrente numeric NOT NULL DEFAULT 0.3,
  peso_estoque numeric NOT NULL DEFAULT 0.1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_regra_faixa TO authenticated;
GRANT ALL ON public.encarte_regra_faixa TO service_role;
ALTER TABLE public.encarte_regra_faixa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Regras legiveis por autenticados" ON public.encarte_regra_faixa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam regras" ON public.encarte_regra_faixa FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

INSERT INTO public.encarte_regra_faixa (tipo_faixa, margem_minima_pct, desconto_max_pct, janela_giro_dias, peso_giro, peso_margem, peso_concorrente, peso_estoque)
VALUES
 ('vermelho', 2, 30, 90, 0.40, 0.15, 0.35, 0.10),
 ('amarelo',  5, 20, 90, 0.35, 0.25, 0.25, 0.15),
 ('neutro',   8, 12, 90, 0.30, 0.35, 0.20, 0.15)
ON CONFLICT (tipo_faixa) DO NOTHING;

-- ========== COLUNAS NOVAS ==========
ALTER TABLE public.encarte_calendario ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES public.encarte_modelo(id) ON DELETE SET NULL;
ALTER TABLE public.encarte_config_loja ADD COLUMN IF NOT EXISTS carga_tributaria_pct numeric NOT NULL DEFAULT 0;
ALTER TABLE public.encarte_config_loja ADD COLUMN IF NOT EXISTS variacao_max_pct numeric NOT NULL DEFAULT 40;
ALTER TABLE public.encarte_gerado ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'rascunho';
ALTER TABLE public.encarte_gerado ADD COLUMN IF NOT EXISTS calendario_id uuid REFERENCES public.encarte_calendario(id) ON DELETE SET NULL;
ALTER TABLE public.encarte_gerado ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES public.encarte_modelo(id) ON DELETE SET NULL;
ALTER TABLE public.encarte_gerado ADD COLUMN IF NOT EXISTS tipo_faixa text;

ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS face text;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS posicao integer;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS ean text;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS pmz numeric;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS margem_atual numeric;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS volume_30d numeric;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS score numeric;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'sugerido';
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS motivo jsonb;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS alerta text;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS ciente boolean NOT NULL DEFAULT false;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS travado boolean NOT NULL DEFAULT false;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS aprovado boolean NOT NULL DEFAULT false;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS observacao text;
CREATE INDEX IF NOT EXISTS encarte_item_encarte_idx ON public.encarte_item(encarte_id);

-- ========== VIEW HISTORICO ==========
CREATE OR REPLACE VIEW public.encarte_historico_itens
WITH (security_invoker = true) AS
SELECT g.store_id, g.id AS encarte_id, g.data_inicio, g.data_fim, g.status,
       i.codigo, i.ean, i.descricao, i.preco_oferta
FROM public.encarte_item i
JOIN public.encarte_gerado g ON g.id = i.encarte_id;
GRANT SELECT ON public.encarte_historico_itens TO authenticated;
GRANT SELECT ON public.encarte_historico_itens TO service_role;

-- ========== SEED MODELO PADRAO ==========
DO $seed$
DECLARE
  v_modelo uuid;
  v_capa text[] := ARRAY['ACOUGUE','ACOUGUE','ACOUGUE','HORTIFRUTI','HORTIFRUTI','MERCEARIA','MERCEARIA','MERCEARIA','BEBIDAS','BEBIDAS','LATICINIOS','LATICINIOS','FRIOS','PADARIA','LIMPEZA','LIMPEZA','HIGIENE','CONGELADOS','BAZAR'];
  v_verso text[] := ARRAY['MERCEARIA','MERCEARIA','MERCEARIA','MERCEARIA','MERCEARIA','MERCEARIA','BEBIDAS','BEBIDAS','BEBIDAS','BEBIDAS','LIMPEZA','LIMPEZA','LIMPEZA','LIMPEZA','HIGIENE','HIGIENE','HIGIENE','LATICINIOS','LATICINIOS','FRIOS','FRIOS','ACOUGUE','ACOUGUE','HORTIFRUTI','HORTIFRUTI','PADARIA','CONGELADOS','CONGELADOS','BAZAR','BAZAR'];
  i integer;
BEGIN
  SELECT id INTO v_modelo FROM public.encarte_modelo WHERE nome = 'MCE - Semana do Precinho' LIMIT 1;
  IF v_modelo IS NULL THEN
    INSERT INTO public.encarte_modelo (nome, padrao) VALUES ('MCE - Semana do Precinho', true) RETURNING id INTO v_modelo;
    FOR i IN 1..array_length(v_capa,1) LOOP
      INSERT INTO public.encarte_modelo_slot (modelo_id, face, posicao, tipo_faixa, departamento)
      VALUES (v_modelo, 'capa', i, CASE WHEN i <= 8 THEN 'vermelho' ELSE 'amarelo' END, v_capa[i]);
    END LOOP;
    FOR i IN 1..array_length(v_verso,1) LOOP
      INSERT INTO public.encarte_modelo_slot (modelo_id, face, posicao, tipo_faixa, departamento)
      VALUES (v_modelo, 'verso', i, CASE WHEN i <= 10 THEN 'amarelo' ELSE 'neutro' END, v_verso[i]);
    END LOOP;
  END IF;
  UPDATE public.encarte_calendario SET modelo_id = v_modelo WHERE modelo_id IS NULL;
END
$seed$;

-- ========== SEED CATEGORIAS ==========
INSERT INTO public.encarte_categoria (nome, departamento, termos, vermelho, amarelo, neutro, ordem) VALUES
 ('Arroz','MERCEARIA', ARRAY['arroz'], true, true, true, 1),
 ('Feijão','MERCEARIA', ARRAY['feijao','feijão'], true, true, true, 2),
 ('Óleo','MERCEARIA', ARRAY['oleo','óleo'], true, true, true, 3),
 ('Açúcar','MERCEARIA', ARRAY['acucar','açúcar'], true, true, true, 4),
 ('Café','MERCEARIA', ARRAY['cafe','café'], true, true, true, 5),
 ('Macarrão','MERCEARIA', ARRAY['macarrao','macarrão','espaguete'], true, true, true, 6),
 ('Farinha','MERCEARIA', ARRAY['farinha'], false, true, true, 7),
 ('Molho de Tomate','MERCEARIA', ARRAY['molho','extrato'], false, true, true, 8),
 ('Biscoito','MERCEARIA', ARRAY['biscoito','bolacha'], false, true, true, 9),
 ('Contra Filé','ACOUGUE', ARRAY['contra file','contra filé'], true, true, true, 10),
 ('Coxão Mole','ACOUGUE', ARRAY['coxao mole','coxão mole'], true, true, true, 11),
 ('Frango','ACOUGUE', ARRAY['frango','coxa','sobrecoxa','file de peito'], true, true, true, 12),
 ('Linguiça','ACOUGUE', ARRAY['linguica','linguiça'], true, true, true, 13),
 ('Costela','ACOUGUE', ARRAY['costela'], false, true, true, 14),
 ('Banana','HORTIFRUTI', ARRAY['banana'], true, true, true, 15),
 ('Tomate','HORTIFRUTI', ARRAY['tomate'], true, true, true, 16),
 ('Batata','HORTIFRUTI', ARRAY['batata'], true, true, true, 17),
 ('Cebola','HORTIFRUTI', ARRAY['cebola'], false, true, true, 18),
 ('Refrigerante','BEBIDAS', ARRAY['refrigerante','refri','coca','guarana','guaraná'], true, true, true, 19),
 ('Cerveja','BEBIDAS', ARRAY['cerveja'], true, true, true, 20),
 ('Suco','BEBIDAS', ARRAY['suco','nectar'], false, true, true, 21),
 ('Água','BEBIDAS', ARRAY['agua','água'], false, true, true, 22),
 ('Leite','LATICINIOS', ARRAY['leite'], true, true, true, 23),
 ('Iogurte','LATICINIOS', ARRAY['iogurte'], false, true, true, 24),
 ('Manteiga/Margarina','LATICINIOS', ARRAY['manteiga','margarina'], false, true, true, 25),
 ('Queijo','FRIOS', ARRAY['queijo','mussarela','muçarela'], true, true, true, 26),
 ('Presunto','FRIOS', ARRAY['presunto','apresuntado'], false, true, true, 27),
 ('Pão','PADARIA', ARRAY['pao','pão'], true, true, true, 28),
 ('Detergente','LIMPEZA', ARRAY['detergente'], true, true, true, 29),
 ('Sabão em Pó','LIMPEZA', ARRAY['sabao','sabão'], true, true, true, 30),
 ('Amaciante','LIMPEZA', ARRAY['amaciante'], false, true, true, 31),
 ('Desinfetante','LIMPEZA', ARRAY['desinfetante','agua sanitaria','água sanitária'], false, true, true, 32),
 ('Papel Higiênico','HIGIENE', ARRAY['papel higienico','papel higiênico'], true, true, true, 33),
 ('Sabonete','HIGIENE', ARRAY['sabonete'], false, true, true, 34),
 ('Shampoo','HIGIENE', ARRAY['shampoo','condicionador'], false, true, true, 35),
 ('Congelados','CONGELADOS', ARRAY['congelado','empanado','nuggets','hamburguer','hambúrguer'], false, true, true, 36),
 ('Bazar','BAZAR', ARRAY['bazar','utilidade'], false, false, true, 37)
ON CONFLICT (nome) DO NOTHING;
