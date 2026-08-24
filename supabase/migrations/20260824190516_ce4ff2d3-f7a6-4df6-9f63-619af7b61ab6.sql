CREATE UNIQUE INDEX IF NOT EXISTS precos_concorrente_site_sku_key
  ON public.precos_concorrente (site_concorrente_id, sku)
  WHERE site_concorrente_id IS NOT NULL;

INSERT INTO public.cliente_concorrentes (store_id, site_concorrente_id, apelido, prioridade)
VALUES ('0b7759de-0143-4a80-8be4-6cf62b2c98c3', '103636dd-d6a9-46de-9c4e-90292b1db405', 'Savegnago', 1)
ON CONFLICT (store_id, site_concorrente_id) DO NOTHING;