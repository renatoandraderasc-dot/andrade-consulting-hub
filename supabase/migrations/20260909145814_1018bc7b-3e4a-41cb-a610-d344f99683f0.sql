
-- Helper: é supervisor?
CREATE OR REPLACE FUNCTION public.is_supervisor(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'supervisor'
  )
$$;

REVOKE ALL ON FUNCTION public.is_supervisor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_supervisor(uuid) TO authenticated, service_role;

-- Poderes de admin, mas restritos às lojas autorizadas: uma policy por tabela com store_id
DO $do$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'store_id' AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS supervisor_store_all ON public.%I', t.tbl);
    EXECUTE format(
      'CREATE POLICY supervisor_store_all ON public.%I FOR ALL TO authenticated '
      'USING (public.is_supervisor() AND public.tem_acesso_loja(store_id)) '
      'WITH CHECK (public.is_supervisor() AND public.tem_acesso_loja(store_id))', t.tbl);
  END LOOP;
END
$do$;

-- Supervisores podem ver perfis e acessos das lojas que supervisionam
CREATE POLICY "Supervisores veem acessos das suas lojas"
ON public.user_store_access FOR SELECT TO authenticated
USING (public.is_supervisor() AND public.tem_acesso_loja(store_id));

CREATE POLICY "Supervisores veem perfis"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_supervisor());
