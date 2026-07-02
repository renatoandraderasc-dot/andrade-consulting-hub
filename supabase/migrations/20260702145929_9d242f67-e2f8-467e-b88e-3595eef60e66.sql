
CREATE POLICY "auth read imagens" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'imagens');
CREATE POLICY "auth upload imagens" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'imagens');
CREATE POLICY "auth update imagens" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'imagens');
CREATE POLICY "auth delete imagens" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'imagens');
