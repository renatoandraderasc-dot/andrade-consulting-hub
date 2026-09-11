ALTER TABLE public.saas_config REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.saas_config;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;