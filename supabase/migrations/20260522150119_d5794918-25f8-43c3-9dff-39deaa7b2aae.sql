DROP POLICY IF EXISTS "Authenticated can view stores" ON public.stores;
CREATE POLICY "Anyone can view stores" ON public.stores FOR SELECT TO anon, authenticated USING (true);