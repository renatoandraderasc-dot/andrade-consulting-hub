ALTER TABLE public.store_vr_config ALTER COLUMN codigo_loja TYPE text USING codigo_loja::text;
UPDATE public.store_vr_config SET codigo_loja='001' WHERE store_id='06fb8b1e-eef3-47e9-b1b6-db1cbc1d4dc9';
UPDATE public.store_vr_config SET codigo_loja='202' WHERE store_id='cf87d862-a7cc-475a-b92a-bfe5810c836a';
UPDATE public.store_vr_config SET codigo_loja='003' WHERE store_id='c1e23e04-eca4-483a-bb93-86945a7c793f';