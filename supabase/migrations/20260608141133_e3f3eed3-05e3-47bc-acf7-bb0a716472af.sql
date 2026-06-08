
ALTER TABLE public.vendas_padaria
  ADD COLUMN IF NOT EXISTS vendas_meta numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margem_meta numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lucro_meta numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loja text,
  ADD COLUMN IF NOT EXISTS part_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lucro numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ano integer,
  ADD COLUMN IF NOT EXISTS mes_nome text;

CREATE INDEX IF NOT EXISTS idx_vendas_padaria_ano ON public.vendas_padaria(ano);
CREATE INDEX IF NOT EXISTS idx_vendas_padaria_loja ON public.vendas_padaria(loja);
