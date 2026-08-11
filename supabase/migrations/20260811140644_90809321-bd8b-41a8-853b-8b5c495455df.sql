CREATE OR REPLACE FUNCTION public.store_sistema(_store_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(coalesce(sistema, 'VR')) FROM public.store_vr_config WHERE store_id = _store_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.store_sistema(uuid) TO authenticated;