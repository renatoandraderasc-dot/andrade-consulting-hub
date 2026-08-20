ALTER TABLE public.concorrentes
  ADD COLUMN IF NOT EXISTS cep_referencia text,
  ADD COLUMN IF NOT EXISTS region_id text,
  ADD COLUMN IF NOT EXISTS seller_id text,
  ADD COLUMN IF NOT EXISTS seller_nome text;

ALTER TABLE public.precos_concorrente
  ADD COLUMN IF NOT EXISTS region_id text,
  ADD COLUMN IF NOT EXISTS cep_referencia text,
  ADD COLUMN IF NOT EXISTS seller_id text,
  ADD COLUMN IF NOT EXISTS seller_nome text;

ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS fila jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_atividade timestamptz,
  ADD COLUMN IF NOT EXISTS region_id text,
  ADD COLUMN IF NOT EXISTS cep_referencia text,
  ADD COLUMN IF NOT EXISTS seller_esperado text,
  ADD COLUMN IF NOT EXISTS categorias_erro jsonb NOT NULL DEFAULT '[]'::jsonb;