
-- Table for monthly store metrics/goals
CREATE TABLE public.store_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  faturamento NUMERIC(12,2) DEFAULT 0,
  margem NUMERIC(12,2) DEFAULT 0,
  meta_faturamento NUMERIC(12,2) DEFAULT 0,
  clientes INTEGER DEFAULT 0,
  ticket_medio NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(store_id, month, year)
);

ALTER TABLE public.store_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage store metrics"
ON public.store_metrics FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view store metrics"
ON public.store_metrics FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Department-level metrics per store/month
CREATE TABLE public.store_department_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  faturamento NUMERIC(12,2) DEFAULT 0,
  margem NUMERIC(12,2) DEFAULT 0,
  faturamento_promocao NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(store_id, department, month, year)
);

ALTER TABLE public.store_department_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dept metrics"
ON public.store_department_metrics FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view dept metrics"
ON public.store_department_metrics FOR SELECT
USING (auth.uid() IS NOT NULL);
