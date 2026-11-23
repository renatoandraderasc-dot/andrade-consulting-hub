ALTER TABLE public.whatsapp_contatos ADD COLUMN IF NOT EXISTS relatorios text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.whatsapp_envios ADD COLUMN IF NOT EXISTS imagens text[] NOT NULL DEFAULT '{}';