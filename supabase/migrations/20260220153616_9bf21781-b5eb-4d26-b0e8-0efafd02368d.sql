
-- Allow anonymous users to view stores on the login page
CREATE POLICY "Anyone can view stores"
ON public.stores
FOR SELECT
TO anon
USING (true);
