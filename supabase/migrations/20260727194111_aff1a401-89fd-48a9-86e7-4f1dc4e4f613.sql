
-- 1) has_role: switch to SECURITY INVOKER (safe because user_roles SELECT policy allows own rows)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) handle_new_user: revoke execute from clients (trigger fires as auth admin owner)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3) stores: remove anon read
DROP POLICY IF EXISTS "Anyone can view stores" ON public.stores;
CREATE POLICY "Authenticated can view stores"
  ON public.stores FOR SELECT TO authenticated
  USING (true);
REVOKE SELECT ON public.stores FROM anon;

-- 4) vendas_padaria: replace broad policies
DROP POLICY IF EXISTS "Authenticated can view vendas_padaria" ON public.vendas_padaria;
DROP POLICY IF EXISTS "Authenticated can insert vendas_padaria" ON public.vendas_padaria;
DROP POLICY IF EXISTS "Authenticated can update vendas_padaria" ON public.vendas_padaria;
DROP POLICY IF EXISTS "Authenticated can delete vendas_padaria" ON public.vendas_padaria;

CREATE POLICY "vendas_padaria admin all"
  ON public.vendas_padaria FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vendas_padaria store users select"
  ON public.vendas_padaria FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_store_access usa
      WHERE usa.user_id = auth.uid() AND usa.approved = true
    )
  );

-- 5) produtos: writes admin-only, reads authenticated
DROP POLICY IF EXISTS "auth read produtos" ON public.produtos;
DROP POLICY IF EXISTS "auth write produtos" ON public.produtos;
DROP POLICY IF EXISTS "auth update produtos" ON public.produtos;
DROP POLICY IF EXISTS "auth delete produtos" ON public.produtos;

CREATE POLICY "produtos read auth"
  ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "produtos admin insert"
  ON public.produtos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "produtos admin update"
  ON public.produtos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "produtos admin delete"
  ON public.produtos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6) encartes: read auth, writes admin
DROP POLICY IF EXISTS "auth all encartes" ON public.encartes;
CREATE POLICY "encartes read auth"
  ON public.encartes FOR SELECT TO authenticated USING (true);
CREATE POLICY "encartes admin write"
  ON public.encartes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "encartes admin update"
  ON public.encartes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "encartes admin delete"
  ON public.encartes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 7) encarte_itens: same
DROP POLICY IF EXISTS "auth all encarte_itens" ON public.encarte_itens;
CREATE POLICY "encarte_itens read auth"
  ON public.encarte_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "encarte_itens admin insert"
  ON public.encarte_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "encarte_itens admin update"
  ON public.encarte_itens FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "encarte_itens admin delete"
  ON public.encarte_itens FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 8) checklist_questions / departments: keep authenticated SELECT (intentional shared reference)
--    Already limited to authenticated + admin-manage. No change needed beyond confirming.
