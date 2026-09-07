ALTER TABLE public.premiacao_config
  ADD COLUMN IF NOT EXISTS foto_cabecalho text,
  ADD COLUMN IF NOT EXISTS foto_rodape text,
  ADD COLUMN IF NOT EXISTS foto_faturamento text,
  ADD COLUMN IF NOT EXISTS foto_arrecadacao text,
  ADD COLUMN IF NOT EXISTS foto_volume text,
  ADD COLUMN IF NOT EXISTS foto_mix text,
  ADD COLUMN IF NOT EXISTS mostrar_valores boolean NOT NULL DEFAULT true;