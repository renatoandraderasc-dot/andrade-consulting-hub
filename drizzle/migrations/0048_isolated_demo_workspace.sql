CREATE TABLE public.demo_workspaces (
  user_id uuid PRIMARY KEY,
  store_name text NOT NULL DEFAULT 'Supermercado Aurora',
  enabled boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.demo_workspaces TO authenticated;
GRANT UPDATE (data, updated_at) ON public.demo_workspaces TO authenticated;
GRANT ALL ON public.demo_workspaces TO service_role;
ALTER TABLE public.demo_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_workspace_read ON public.demo_workspaces FOR SELECT TO authenticated USING (user_id = auth.uid() AND enabled);
CREATE POLICY demo_workspace_update ON public.demo_workspaces FOR UPDATE TO authenticated USING (user_id = auth.uid() AND enabled) WITH CHECK (user_id = auth.uid() AND enabled);
CREATE OR REPLACE FUNCTION public.is_demo_account() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.demo_workspaces WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_demo_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_demo_account() TO authenticated, service_role;
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity AND tablename <> 'demo_workspaces'
  LOOP
    EXECUTE format('CREATE POLICY demo_production_isolation ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_demo_account()) WITH CHECK (NOT public.is_demo_account())', t.schemaname, t.tablename);
  END LOOP;
END;
$$;
COMMENT ON TABLE public.demo_workspaces IS 'Protected fictional workspace. Demo accounts are ordinary auth users with no production store grants. Owners may update only fictional data and its timestamp.';