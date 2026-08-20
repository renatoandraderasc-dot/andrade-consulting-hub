CREATE TABLE public.concorrentes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  host text NOT NULL,
  plataforma text NOT NULL DEFAULT 'vtex',
  sales_channel integer NOT NULL DEFAULT 1,
  praca_esperada text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concorrentes TO authenticated;
GRANT ALL ON public.concorrentes TO service_role;
ALTER TABLE public.concorrentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concorrentes_select" ON public.concorrentes FOR SELECT TO authenticated USING (true);
CREATE POLICY "concorrentes_admin_write" ON public.concorrentes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_concorrentes_updated BEFORE UPDATE ON public.concorrentes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.precos_concorrente (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concorrente_id uuid NOT NULL REFERENCES public.concorrentes(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.scrape_jobs(id) ON DELETE SET NULL,
  sku text NOT NULL,
  produto_id text,
  ean text,
  nome text,
  marca text,
  categoria text,
  arvore_categoria text,
  url text,
  imagem_url text,
  preco numeric,
  preco_de numeric,
  preco_auditoria numeric,
  disponivel boolean NOT NULL DEFAULT false,
  em_promocao boolean NOT NULL DEFAULT false,
  promocao_multipla text[],
  colecoes text[],
  lojista text,
  sales_channel integer NOT NULL DEFAULT 1,
  coletado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concorrente_id, sku)
);
CREATE INDEX idx_precos_concorrente_ean ON public.precos_concorrente (ean);
CREATE INDEX idx_precos_concorrente_job ON public.precos_concorrente (job_id);
CREATE INDEX idx_precos_concorrente_conc ON public.precos_concorrente (concorrente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.precos_concorrente TO authenticated;
GRANT ALL ON public.precos_concorrente TO service_role;
ALTER TABLE public.precos_concorrente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "precos_concorrente_select" ON public.precos_concorrente FOR SELECT TO authenticated USING (true);
CREATE POLICY "precos_concorrente_admin_write" ON public.precos_concorrente FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_precos_concorrente_updated BEFORE UPDATE ON public.precos_concorrente FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS concorrente_id uuid REFERENCES public.concorrentes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS host text,
  ADD COLUMN IF NOT EXISTS sales_channel integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_pages integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skus_validos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skus_indisponiveis integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skus_sem_ean integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_limit_hits integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lojista_detectado text,
  ADD COLUMN IF NOT EXISTS categorias_incompletas jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS log_lines jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;