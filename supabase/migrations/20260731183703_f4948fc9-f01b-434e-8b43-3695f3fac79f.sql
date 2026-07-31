CREATE TABLE IF NOT EXISTS public.backup_embu_20260731 AS
SELECT * FROM public.store_daily_metrics
 WHERE store_id = '563ad29c-da1e-4de4-b1c5-e1eb6c80ffa8';

ALTER TABLE public.backup_embu_20260731 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.backup_embu_20260731 TO service_role;