REVOKE ALL ON FUNCTION public.sync_diario_d1_auto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_diario_d1_auto() TO postgres, service_role;