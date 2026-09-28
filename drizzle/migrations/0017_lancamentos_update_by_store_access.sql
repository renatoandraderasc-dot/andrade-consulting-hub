DROP POLICY IF EXISTS "Users can update own lancamentos" ON public.lancamentos;
CREATE POLICY "Users can update lancamentos of their stores" ON public.lancamentos
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_store_access usa WHERE usa.user_id = auth.uid() AND usa.store_id = lancamentos.store_id AND usa.approved = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_store_access usa WHERE usa.user_id = auth.uid() AND usa.store_id = lancamentos.store_id AND usa.approved = true));