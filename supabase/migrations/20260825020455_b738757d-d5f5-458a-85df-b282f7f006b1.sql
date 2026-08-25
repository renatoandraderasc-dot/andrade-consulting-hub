DROP TRIGGER IF EXISTS trg_criar_margem_config_padrao ON public.stores;
DROP FUNCTION IF EXISTS public.criar_margem_config_padrao();
DROP TABLE IF EXISTS public.store_margem_config;