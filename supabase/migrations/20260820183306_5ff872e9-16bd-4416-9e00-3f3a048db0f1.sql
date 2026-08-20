INSERT INTO public.store_vr_config (store_id, api_url, api_key, sistema, enabled, codigo_loja)
VALUES ('791b3d14-da86-4297-ad77-1c36d57198dd', 'https://choosing-surreal-iciness.ngrok-free.dev', 'araujo', 'VR', true, 1)
ON CONFLICT (store_id) DO UPDATE
SET api_url = EXCLUDED.api_url,
    api_key = EXCLUDED.api_key,
    sistema = EXCLUDED.sistema,
    enabled = true;