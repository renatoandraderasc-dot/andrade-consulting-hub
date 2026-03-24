
CREATE TABLE public.scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_url text NOT NULL,
  competitor_name text,
  status text NOT NULL DEFAULT 'pending',
  firecrawl_crawl_id text,
  total_urls_found integer DEFAULT 0,
  pages_crawled integer DEFAULT 0,
  products_found integer DEFAULT 0,
  progress_pct integer DEFAULT 0,
  error_message text,
  products_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scrape jobs" ON public.scrape_jobs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view scrape jobs" ON public.scrape_jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert scrape jobs" ON public.scrape_jobs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update scrape jobs" ON public.scrape_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
