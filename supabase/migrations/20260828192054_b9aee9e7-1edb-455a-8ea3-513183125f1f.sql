-- =========================================================
-- Encarte: inserção manual, capa & verso, diagnóstico
-- =========================================================

-- 1. Listas manuais -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.encarte_manual_lista (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  data_referencia date NOT NULL DEFAULT CURRENT_DATE,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_manual_lista TO authenticated;
GRANT ALL ON public.encarte_manual_lista TO service_role;
ALTER TABLE public.encarte_manual_lista ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_lista_select" ON public.encarte_manual_lista
  FOR SELECT TO authenticated USING (public.tem_acesso_loja(store_id));
CREATE POLICY "manual_lista_write" ON public.encarte_manual_lista
  FOR ALL TO authenticated
  USING (public.tem_acesso_loja(store_id))
  WITH CHECK (public.tem_acesso_loja(store_id));

CREATE TABLE IF NOT EXISTS public.encarte_manual_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id uuid NOT NULL REFERENCES public.encarte_manual_lista(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  codigo_digitado text,
  encontrado boolean NOT NULL DEFAULT true,
  codigo text,
  ean text,
  descricao text,
  descricao_encarte text,
  secao text,
  grupo text,
  estoque numeric,
  custo numeric,
  preco_venda numeric,
  margem_pct numeric,
  preco_encarte numeric,
  margem_encarte_pct numeric,
  posicao text NOT NULL DEFAULT 'capa',
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_manual_item TO authenticated;
GRANT ALL ON public.encarte_manual_item TO service_role;
ALTER TABLE public.encarte_manual_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_item_select" ON public.encarte_manual_item
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.encarte_manual_lista l
    WHERE l.id = lista_id AND public.tem_acesso_loja(l.store_id)));
CREATE POLICY "manual_item_write" ON public.encarte_manual_item
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.encarte_manual_lista l
    WHERE l.id = lista_id AND public.tem_acesso_loja(l.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.encarte_manual_lista l
    WHERE l.id = lista_id AND public.tem_acesso_loja(l.store_id)));

CREATE INDEX IF NOT EXISTS idx_manual_item_lista ON public.encarte_manual_item(lista_id, ordem);

-- 2. Regras de capa & verso ----------------------------------------
CREATE TABLE IF NOT EXISTS public.encarte_posicao_regra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  tipo_alvo text NOT NULL DEFAULT 'produto',
  codigo text,
  ean text,
  descricao text,
  categoria_id uuid REFERENCES public.encarte_categoria(id) ON DELETE CASCADE,
  departamento text,
  posicao text NOT NULL DEFAULT 'capa',
  fixo boolean NOT NULL DEFAULT false,
  prioridade integer NOT NULL DEFAULT 100,
  tipo_faixa text,
  slot_preferido integer,
  vigencia_inicio date,
  vigencia_fim date,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encarte_posicao_regra_tipo_chk CHECK (tipo_alvo IN ('produto','categoria','departamento')),
  CONSTRAINT encarte_posicao_regra_pos_chk CHECK (posicao IN ('capa','verso','ambos','excluir'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_posicao_regra TO authenticated;
GRANT ALL ON public.encarte_posicao_regra TO service_role;
ALTER TABLE public.encarte_posicao_regra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posicao_regra_select" ON public.encarte_posicao_regra
  FOR SELECT TO authenticated USING (public.tem_acesso_loja(store_id));
CREATE POLICY "posicao_regra_write" ON public.encarte_posicao_regra
  FOR ALL TO authenticated
  USING (public.tem_acesso_loja(store_id))
  WITH CHECK (public.tem_acesso_loja(store_id));

CREATE INDEX IF NOT EXISTS idx_posicao_regra_store ON public.encarte_posicao_regra(store_id, tipo_alvo, ativo);

CREATE OR REPLACE VIEW public.encarte_posicao_efetiva
WITH (security_invoker = true) AS
SELECT
  r.*,
  CASE r.tipo_alvo WHEN 'produto' THEN 1 WHEN 'categoria' THEN 2 ELSE 3 END AS peso
FROM public.encarte_posicao_regra r
WHERE r.ativo
  AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= CURRENT_DATE)
  AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= CURRENT_DATE);

GRANT SELECT ON public.encarte_posicao_efetiva TO authenticated;
GRANT SELECT ON public.encarte_posicao_efetiva TO service_role;

-- 4. Diagnóstico e relaxamento --------------------------------------
ALTER TABLE public.encarte_gerado ADD COLUMN IF NOT EXISTS diagnostico jsonb;
ALTER TABLE public.encarte_gerado ADD COLUMN IF NOT EXISTS lista_manual_id uuid REFERENCES public.encarte_manual_lista(id) ON DELETE SET NULL;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS nivel_relaxamento integer NOT NULL DEFAULT 0;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS motivo_escolha text;
ALTER TABLE public.encarte_item ADD COLUMN IF NOT EXISTS regra_posicao_id uuid REFERENCES public.encarte_posicao_regra(id) ON DELETE SET NULL;

-- 5. Cortes configuráveis por loja ----------------------------------
ALTER TABLE public.encarte_config_loja ADD COLUMN IF NOT EXISTS venda_minima_periodo numeric NOT NULL DEFAULT 0;
ALTER TABLE public.encarte_config_loja ADD COLUMN IF NOT EXISTS margem_minima_pct numeric NOT NULL DEFAULT 0;

-- 6. Triggers de updated_at -----------------------------------------
DROP TRIGGER IF EXISTS trg_manual_lista_upd ON public.encarte_manual_lista;
CREATE TRIGGER trg_manual_lista_upd BEFORE UPDATE ON public.encarte_manual_lista
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_posicao_regra_upd ON public.encarte_posicao_regra;
CREATE TRIGGER trg_posicao_regra_upd BEFORE UPDATE ON public.encarte_posicao_regra
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();