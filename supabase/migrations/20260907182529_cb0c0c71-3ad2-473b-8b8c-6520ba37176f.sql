-- ============================================================
-- Tabela central de parametrizações SaaS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.saas_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  valor text,
  tipo text NOT NULL DEFAULT 'text' CHECK (tipo IN ('text', 'number', 'boolean', 'select')),
  descricao text,
  categoria text NOT NULL DEFAULT 'Geral',
  opcoes jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_config TO authenticated;
GRANT ALL ON public.saas_config TO service_role;

ALTER TABLE public.saas_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage saas_config"
ON public.saas_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_saas_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_saas_config_updated_at ON public.saas_config;
CREATE TRIGGER trg_saas_config_updated_at
BEFORE UPDATE ON public.saas_config
FOR EACH ROW EXECUTE FUNCTION public.update_saas_config_updated_at();

-- ============================================================
-- Configuração padrão: intervalo de atualização automática
-- ============================================================
INSERT INTO public.saas_config (chave, valor, tipo, descricao, categoria, opcoes)
VALUES (
  'intervalo_atualizacao_minutos',
  '60',
  'number',
  'Intervalo em minutos para atualização automática dos dados da Visão da Rede.',
  'Integrações',
  '[{"label":"15 minutos","value":"15"},{"label":"30 minutos","value":"30"},{"label":"1 hora","value":"60"},{"label":"2 horas","value":"120"},{"label":"6 horas","value":"360"},{"label":"12 horas","value":"720"},{"label":"Diário","value":"1440"}]'::jsonb
)
ON CONFLICT (chave) DO NOTHING;

-- ============================================================
-- Função utilitária: minutos -> cron expression
-- ============================================================
CREATE OR REPLACE FUNCTION public.minutos_para_cron(minutos integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $function$
BEGIN
  IF minutos <= 0 OR minutos > 1440 THEN
    RETURN '0 0 * * *'; -- diário como fallback seguro
  END IF;
  IF minutos >= 60 AND minutos % 60 = 0 THEN
    RETURN '0 */' || (minutos / 60) || ' * * *';
  END IF;
  RETURN '*/' || minutos || ' * * * *';
END;
$function$;

-- ============================================================
-- Função que dispara a sincronização da Visão da Rede
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_rede_mensal_auto()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ano integer;
BEGIN
  v_ano := EXTRACT(YEAR FROM now())::integer;

  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sync-rede-mensal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('ano', v_ano)
  );

  RETURN v_ano;
END;
$function$;

-- ============================================================
-- Trigger que recria o cron job quando o intervalo muda
-- ============================================================
CREATE OR REPLACE FUNCTION public.saas_config_recreate_jobs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.chave = 'intervalo_atualizacao_minutos' THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-rede-mensal-auto';
    PERFORM cron.schedule(
      'sync-rede-mensal-auto',
      public.minutos_para_cron(COALESCE(NULLIF(NEW.valor, ''), '60')::integer),
      $cron$ SELECT public.sync_rede_mensal_auto(); $cron$
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_saas_config_recreate_jobs ON public.saas_config;
CREATE TRIGGER trg_saas_config_recreate_jobs
AFTER UPDATE ON public.saas_config
FOR EACH ROW EXECUTE FUNCTION public.saas_config_recreate_jobs();

-- ============================================================
-- Criar o cron job inicial com 1 hora
-- ============================================================
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-rede-mensal-auto';
SELECT cron.schedule(
  'sync-rede-mensal-auto',
  '0 * * * *',
  $cron$ SELECT public.sync_rede_mensal_auto(); $cron$
);