INSERT INTO public.store_vr_config (store_id, api_url, api_key, enabled, sistema)
VALUES ('bd6c5261-450c-41ff-ad58-f73814adb15f', 'https://pants-slit-skedaddle.ngrok-free.dev', 'supermanos2026', true, 'VR')
ON CONFLICT (store_id) DO UPDATE SET
  api_url = EXCLUDED.api_url, api_key = EXCLUDED.api_key, enabled = true, sistema = 'VR', last_error = NULL;