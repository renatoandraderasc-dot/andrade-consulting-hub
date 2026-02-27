
-- Tabela de métricas diárias por loja e departamento
CREATE TABLE public.store_daily_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  date DATE NOT NULL,
  tipo_dia TEXT NOT NULL DEFAULT 'D',
  meta_vendas NUMERIC DEFAULT 0,
  realizado_vendas NUMERIC DEFAULT 0,
  projecao_vendas NUMERIC DEFAULT 0,
  meta_lucro NUMERIC DEFAULT 0,
  realizado_lucro NUMERIC DEFAULT 0,
  projecao_lucro NUMERIC DEFAULT 0,
  meta_margem_pct NUMERIC DEFAULT 0,
  realizado_margem_pct NUMERIC DEFAULT 0,
  projecao_margem_pct NUMERIC DEFAULT 0,
  meta_volume NUMERIC DEFAULT 0,
  realizado_volume NUMERIC DEFAULT 0,
  projecao_volume NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(store_id, department, date)
);

ALTER TABLE public.store_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage daily metrics"
ON public.store_daily_metrics FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view daily metrics"
ON public.store_daily_metrics FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Tabela de comparativo de produtos
CREATE TABLE public.store_product_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  vendas_valor NUMERIC DEFAULT 0,
  vendas_volume NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(store_id, product_name, month, year)
);

ALTER TABLE public.store_product_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage product metrics"
ON public.store_product_metrics FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view product metrics"
ON public.store_product_metrics FOR SELECT
USING (auth.uid() IS NOT NULL);
