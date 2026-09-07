ALTER TABLE public.premiacao_config
  ADD COLUMN IF NOT EXISTS fotos_departamentos jsonb NOT NULL DEFAULT '{}'::jsonb;