
-- 1) Restrict checklist-photos storage SELECT to authenticated owner (folder = user id) or admin
DROP POLICY IF EXISTS "Anyone can view checklist photos" ON storage.objects;

CREATE POLICY "Authenticated owners or admins can view checklist photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'checklist-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

-- 2) Lock down scrape_jobs to admins only
DROP POLICY IF EXISTS "Authenticated can view scrape jobs" ON public.scrape_jobs;
DROP POLICY IF EXISTS "Authenticated can insert scrape jobs" ON public.scrape_jobs;
DROP POLICY IF EXISTS "Authenticated can update scrape jobs" ON public.scrape_jobs;

-- The existing "Admins can manage scrape jobs" ALL policy already covers admins.
-- Edge functions use the service role and bypass RLS.

-- 3) user_roles: add admin UPDATE and DELETE policies
CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
