CREATE OR REPLACE FUNCTION public.tv_pode_gerir(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      EXISTS (SELECT 1 FROM public.user_module_access m
               WHERE m.user_id = auth.uid() AND m.module = 'admin_tv' AND m.allowed)
      AND EXISTS (SELECT 1 FROM public.user_store_access a
               WHERE a.user_id = auth.uid() AND a.store_id = _store_id AND a.approved)
    )
$$;
REVOKE EXECUTE ON FUNCTION public.tv_pode_gerir(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.tv_pode_gerir(uuid) TO authenticated;

CREATE POLICY "tv_telas gestor loja" ON public.tv_telas FOR ALL TO authenticated
  USING (public.tv_pode_gerir(store_id)) WITH CHECK (public.tv_pode_gerir(store_id));

CREATE POLICY "tv_itens gestor loja" ON public.tv_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tv_telas t WHERE t.id = tv_itens.tela_id AND public.tv_pode_gerir(t.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tv_telas t WHERE t.id = tv_itens.tela_id AND public.tv_pode_gerir(t.store_id)));

CREATE POLICY "tv_midia gestor ins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tv-midia' AND public.tv_pode_gerir(((storage.foldername(name))[1])::uuid));
CREATE POLICY "tv_midia gestor del" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tv-midia' AND public.tv_pode_gerir(((storage.foldername(name))[1])::uuid));