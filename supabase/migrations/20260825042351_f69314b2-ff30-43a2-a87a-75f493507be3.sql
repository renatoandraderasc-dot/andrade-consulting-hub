WITH nova AS (
  INSERT INTO public.stores (name)
  VALUES ('Sm União Loja 1'), ('Sm União Loja 2')
  RETURNING id, name
)
INSERT INTO public.store_vr_config (store_id, api_url, api_key, sistema, codigo_loja, enabled)
SELECT id,
       'https://image-vacant-process.ngrok-free.dev',
       'Smuniao',
       'VR',
       CASE WHEN name = 'Sm União Loja 1' THEN 1 ELSE 2 END,
       true
FROM nova;