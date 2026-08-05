DROP INDEX IF EXISTS public.lancamentos_origem_unico;
ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_origem_unico UNIQUE (store_id, origem, origem_ref);