DROP POLICY IF EXISTS "tv_midia ler" ON storage.objects;
CREATE POLICY "tv_midia ler" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tv-midia'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.tem_acesso_loja(((storage.foldername(name))[1])::uuid)
  )
);