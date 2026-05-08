-- Remove anon read access to stores
DROP POLICY IF EXISTS "Anyone can view stores" ON public.stores;

-- Add storage policies for checklist-photos (delete/update)
CREATE POLICY "Users can delete own checklist photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'checklist-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own checklist photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'checklist-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can delete all checklist photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'checklist-photos' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update all checklist photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'checklist-photos' AND
  has_role(auth.uid(), 'admin'::app_role)
);