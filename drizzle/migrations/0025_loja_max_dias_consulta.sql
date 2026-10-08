CREATE OR REPLACE FUNCTION public.loja_max_dias_consulta(p_store uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.max_dias_consulta FROM public.store_vr_config c
  WHERE c.store_id = p_store AND (public.has_role(auth.uid(),'admin') OR public.tem_acesso_loja(p_store))
$$;
REVOKE ALL ON FUNCTION public.loja_max_dias_consulta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_max_dias_consulta(uuid) TO authenticated;