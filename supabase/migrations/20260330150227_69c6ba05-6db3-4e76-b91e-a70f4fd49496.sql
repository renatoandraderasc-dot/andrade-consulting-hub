
-- Fix scrape_jobs INSERT policy: restrict to authenticated with proper check
DROP POLICY IF EXISTS "Authenticated can insert scrape jobs" ON public.scrape_jobs;
CREATE POLICY "Authenticated can insert scrape jobs"
ON public.scrape_jobs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Fix scrape_jobs UPDATE policy: restrict to authenticated with proper check
DROP POLICY IF EXISTS "Authenticated can update scrape jobs" ON public.scrape_jobs;
CREATE POLICY "Authenticated can update scrape jobs"
ON public.scrape_jobs
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
