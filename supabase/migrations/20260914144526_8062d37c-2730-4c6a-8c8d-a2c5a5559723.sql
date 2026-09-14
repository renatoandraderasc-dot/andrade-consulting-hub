ALTER TABLE public.store_vr_config ADD COLUMN IF NOT EXISTS id_usuario_vr INTEGER;

CREATE TABLE IF NOT EXISTS public.margens_padrao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('produto','fornecedor','departamento')),
  referencia_id INTEGER NOT NULL,
  referencia_nome TEXT,
  margem_pct NUMERIC NOT NULL CHECK (margem_pct > 0 AND margem_pct < 500),
  margem_min NUMERIC,
  margem_max NUMERIC,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(store_id, tipo, referencia_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.margens_padrao TO authenticated;
GRANT ALL ON public.margens_padrao TO service_role;

CREATE INDEX IF NOT EXISTS idx_margens_padrao_store_tipo ON public.margens_padrao(store_id, tipo);

ALTER TABLE public.margens_padrao ENABLE ROW LEVEL SECURITY;

CREATE POLICY margens_padrao_select ON public.margens_padrao FOR SELECT TO authenticated USING (public.tem_acesso_loja(store_id));
CREATE POLICY margens_padrao_insert ON public.margens_padrao FOR INSERT TO authenticated WITH CHECK (public.tem_acesso_loja(store_id));
CREATE POLICY margens_padrao_update ON public.margens_padrao FOR UPDATE TO authenticated USING (public.tem_acesso_loja(store_id));
CREATE POLICY margens_padrao_delete ON public.margens_padrao FOR DELETE TO authenticated USING (public.tem_acesso_loja(store_id));

CREATE TRIGGER trg_margens_padrao_updated_at
  BEFORE UPDATE ON public.margens_padrao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.historico_aplicacao_preco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  id_produto INTEGER NOT NULL,
  descricao TEXT,
  ean TEXT,
  fornecedor TEXT,
  preco_anterior NUMERIC,
  preco_aplicado NUMERIC NOT NULL,
  margem_meta NUMERIC,
  custo_referencia NUMERIC,
  propagou_familia BOOLEAN NOT NULL DEFAULT false,
  qtd_produtos_afetados INTEGER,
  id_usuario_vr INTEGER,
  applied_by UUID REFERENCES auth.users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT ON public.historico_aplicacao_preco TO authenticated;
GRANT ALL ON public.historico_aplicacao_preco TO service_role;

CREATE INDEX IF NOT EXISTS idx_hap_store_data ON public.historico_aplicacao_preco(store_id, applied_at DESC);

ALTER TABLE public.historico_aplicacao_preco ENABLE ROW LEVEL SECURITY;

CREATE POLICY hap_select ON public.historico_aplicacao_preco FOR SELECT TO authenticated USING (public.tem_acesso_loja(store_id));
CREATE POLICY hap_insert ON public.historico_aplicacao_preco FOR INSERT TO authenticated WITH CHECK (public.tem_acesso_loja(store_id));