REVOKE EXECUTE ON FUNCTION public.tem_acesso_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_acesso_loja(uuid) TO authenticated, service_role;