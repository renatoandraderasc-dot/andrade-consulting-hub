CREATE TABLE IF NOT EXISTS public.user_department_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  department text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, department)
);

GRANT SELECT ON public.user_department_access TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_department_access TO authenticated;
GRANT ALL ON public.user_department_access TO service_role;

ALTER TABLE public.user_department_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario ve seus departamentos"
ON public.user_department_access
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin gerencia departamentos"
ON public.user_department_access
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_uda_user ON public.user_department_access(user_id);