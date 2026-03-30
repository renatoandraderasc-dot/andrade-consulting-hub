
-- 1. Fix user_roles INSERT policy: change from public to authenticated
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Add missing storage DELETE/UPDATE policies for checklist-photos
CREATE POLICY "Users can delete own photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'checklist-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'checklist-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can delete all photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'checklist-photos' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update all photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'checklist-photos' AND
  has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Fix metrics tables: restrict SELECT to user's approved stores (+ admins)
-- store_metrics
DROP POLICY IF EXISTS "Authenticated users can view store metrics" ON public.store_metrics;
CREATE POLICY "Users can view own store metrics"
ON public.store_metrics
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_store_access usa
    WHERE usa.user_id = auth.uid() AND usa.store_id = store_metrics.store_id AND usa.approved = true
  )
);

-- store_daily_metrics
DROP POLICY IF EXISTS "Authenticated users can view daily metrics" ON public.store_daily_metrics;
CREATE POLICY "Users can view own store daily metrics"
ON public.store_daily_metrics
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_store_access usa
    WHERE usa.user_id = auth.uid() AND usa.store_id = store_daily_metrics.store_id AND usa.approved = true
  )
);

-- store_department_metrics
DROP POLICY IF EXISTS "Authenticated users can view dept metrics" ON public.store_department_metrics;
CREATE POLICY "Users can view own store dept metrics"
ON public.store_department_metrics
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_store_access usa
    WHERE usa.user_id = auth.uid() AND usa.store_id = store_department_metrics.store_id AND usa.approved = true
  )
);

-- store_product_metrics
DROP POLICY IF EXISTS "Authenticated users can view product metrics" ON public.store_product_metrics;
CREATE POLICY "Users can view own store product metrics"
ON public.store_product_metrics
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_store_access usa
    WHERE usa.user_id = auth.uid() AND usa.store_id = store_product_metrics.store_id AND usa.approved = true
  )
);

-- 4. Make checklist-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'checklist-photos';

-- 5. Improve handle_new_user with input validation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    LEFT(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), 255)
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
