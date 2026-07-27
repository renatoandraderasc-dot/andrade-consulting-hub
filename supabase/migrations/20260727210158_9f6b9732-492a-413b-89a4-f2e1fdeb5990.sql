ALTER TABLE public.store_daily_metrics REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.store_daily_metrics;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;