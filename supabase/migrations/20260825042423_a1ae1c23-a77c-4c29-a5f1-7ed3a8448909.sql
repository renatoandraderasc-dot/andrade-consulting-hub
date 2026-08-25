UPDATE public.store_vr_config SET store_id = 'f90692e5-3239-4d6a-9b37-abc793733dba' WHERE store_id = 'ad60f74e-a4b8-44d0-a6b4-04a0e72a7b1c';
UPDATE public.store_vr_config SET store_id = 'b6cf149d-8ec7-4600-87bf-d9abf7c18e25' WHERE store_id = '571eb618-0416-441e-9e2e-080e541140d1';
DELETE FROM public.stores WHERE id IN ('ad60f74e-a4b8-44d0-a6b4-04a0e72a7b1c','571eb618-0416-441e-9e2e-080e541140d1');