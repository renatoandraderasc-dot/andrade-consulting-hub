CREATE OR REPLACE FUNCTION public.pode_gerenciar_loja(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR (public.is_supervisor(auth.uid()) AND public.tem_acesso_loja(_store_id))
$$;

REVOKE ALL ON FUNCTION public.pode_gerenciar_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_gerenciar_loja(uuid) TO authenticated, service_role;

DO $do$
DECLARE
  f record;
  novo text;
BEGIN
  FOR f IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('gerar_metas','distribuir_metas','gerar_meta_mix','gerar_calendario','semear_taxas_padrao','gerar_metas_compra')
  LOOP
    novo := replace(
      f.def,
      'IF NOT public.has_role(auth.uid(), ''admin'') THEN',
      'IF NOT public.pode_gerenciar_loja(p_store_id) THEN'
    );
    IF novo <> f.def THEN
      EXECUTE novo;
    END IF;
  END LOOP;
END
$do$;