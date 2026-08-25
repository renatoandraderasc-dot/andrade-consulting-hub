INSERT INTO public.store_margem_config (store_id, carga_tributaria_cmv_pct)
SELECT id, 2.84 FROM public.stores
ON CONFLICT (store_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.criar_margem_config_padrao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_margem_config (store_id, carga_tributaria_cmv_pct)
  VALUES (NEW.id, 2.84)
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criar_margem_config_padrao ON public.stores;
CREATE TRIGGER trg_criar_margem_config_padrao
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.criar_margem_config_padrao();