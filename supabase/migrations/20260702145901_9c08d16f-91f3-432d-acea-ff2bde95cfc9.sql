
CREATE TABLE public.produtos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_interno TEXT UNIQUE,
  ean TEXT,
  descricao TEXT NOT NULL,
  secao TEXT,
  categoria TEXT,
  subcategoria TEXT,
  unidade TEXT NOT NULL DEFAULT 'un',
  preco_regular NUMERIC(12,2),
  imagem_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_produtos_descricao ON public.produtos USING gin (to_tsvector('portuguese', descricao));
CREATE INDEX idx_produtos_ean ON public.produtos(ean);
CREATE INDEX idx_produtos_secao ON public.produtos(secao);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read produtos" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write produtos" ON public.produtos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update produtos" ON public.produtos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete produtos" ON public.produtos FOR DELETE TO authenticated USING (true);

CREATE TABLE public.encartes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tema TEXT NOT NULL DEFAULT 'ofertao',
  formato TEXT NOT NULL DEFAULT 'a4',
  colunas INT NOT NULL DEFAULT 3,
  titulo TEXT DEFAULT 'OFERTAS DA SEMANA',
  validade_de DATE,
  validade_ate DATE,
  loja_nome TEXT,
  loja_telefone TEXT,
  loja_endereco TEXT,
  loja_logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encartes TO authenticated;
GRANT ALL ON public.encartes TO service_role;
ALTER TABLE public.encartes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all encartes" ON public.encartes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.encarte_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  encarte_id UUID NOT NULL REFERENCES public.encartes(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  preco_oferta NUMERIC(12,2) NOT NULL,
  preco_de NUMERIC(12,2),
  destaque BOOLEAN NOT NULL DEFAULT false,
  ordem INT NOT NULL DEFAULT 0,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_encarte_itens_encarte ON public.encarte_itens(encarte_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encarte_itens TO authenticated;
GRANT ALL ON public.encarte_itens TO service_role;
ALTER TABLE public.encarte_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all encarte_itens" ON public.encarte_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_produtos_updated BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_encartes_updated BEFORE UPDATE ON public.encartes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
