DROP POLICY IF EXISTS "Users view accessible stores" ON public.stores;
CREATE POLICY "Users view accessible stores" ON public.stores FOR SELECT TO authenticated
  USING (public.tem_acesso_loja(id));