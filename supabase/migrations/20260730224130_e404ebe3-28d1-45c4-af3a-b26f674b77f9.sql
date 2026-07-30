CREATE OR REPLACE FUNCTION public.importar_lancamentos_vr(
  p_store_id uuid, p_inicio date, p_fim date, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(linhas integer, gravados integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_cfg public.store_vr_config%ROWTYPE; v_url text; v_resp extensions.http_response;
  v_json jsonb; v_user uuid; v_lin integer := 0; v_grav integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  SELECT * INTO v_cfg FROM public.store_vr_config WHERE store_id = p_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'loja sem conexao VR cadastrada'; END IF;

  v_user := COALESCE(p_user_id, auth.uid(),
                     (SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1));
  IF v_user IS NULL THEN RAISE EXCEPTION 'sem usuario para atribuir os lancamentos'; END IF;

  v_url := rtrim(v_cfg.api_url, '/') || '/relatorios/pagamentos_periodo?inicio='
        || p_inicio || '&fim=' || p_fim || '&chave=' || extensions.urlencode(v_cfg.api_key);

  SELECT * INTO v_resp FROM extensions.http((
    'GET', v_url,
    ARRAY[extensions.http_header('ngrok-skip-browser-warning','true')],
    NULL, NULL)::extensions.http_request);

  IF v_resp.status <> 200 THEN
    RAISE EXCEPTION 'API VR % : %', v_resp.status, left(v_resp.content, 200);
  END IF;

  v_json := v_resp.content::jsonb;
  SELECT jsonb_array_length(v_json) INTO v_lin;

  WITH linhas AS (SELECT l FROM jsonb_array_elements(v_json) AS l),
  prep AS (
    SELECT (l->>'data_pagamento')::date AS data,
           COALESCE((l->>'valor_pago')::numeric, 0) AS valor,
           NULLIF(l->>'id_tipo','')::int AS id_tipo,
           l->>'fornecedor' AS fornecedor, l->>'documento' AS documento,
           l->>'observacao' AS observacao, l->>'ref' AS ref
    FROM linhas WHERE COALESCE(l->>'origem','') <> 'TRANSFERENCIA'
  ), classif AS (
    SELECT p.*,
      COALESCE((SELECT m.tipo FROM public.vr_lancamento_map m
                 WHERE m.id_tipo = p.id_tipo AND m.store_id = p_store_id LIMIT 1),
               (SELECT m.tipo FROM public.vr_lancamento_map m
                 WHERE m.id_tipo = p.id_tipo AND m.store_id IS NULL LIMIT 1)) AS tipo,
      COALESCE((SELECT m.subtipo FROM public.vr_lancamento_map m
                 WHERE m.id_tipo = p.id_tipo AND m.store_id = p_store_id LIMIT 1),
               (SELECT m.subtipo FROM public.vr_lancamento_map m
                 WHERE m.id_tipo = p.id_tipo AND m.store_id IS NULL LIMIT 1)) AS subtipo
    FROM prep p
  ), ins AS (
    INSERT INTO public.lancamentos
      (store_id, user_id, data, competencia_mes, competencia_ano, tipo, subtipo,
       descricao, valor, observacao, status, origem, origem_ref)
    SELECT p_store_id, v_user, c.data,
           EXTRACT(MONTH FROM c.data)::int, EXTRACT(YEAR FROM c.data)::int,
           COALESCE(c.tipo, 'Despesas'), COALESCE(c.subtipo, 'OUTROS'),
           left(concat_ws(' · ', NULLIF(c.fornecedor,''),
                CASE WHEN c.documento IS NOT NULL THEN 'Doc ' || c.documento END,
                NULLIF(c.observacao,'')), 300),
           round(c.valor, 2),
           CASE WHEN c.tipo IS NULL THEN 'NAO CLASSIFICADO — tipo VR ' || COALESCE(c.id_tipo::text,'-') END,
           'ativo', 'VR', c.ref
    FROM classif c
    ON CONFLICT (store_id, origem, origem_ref) DO UPDATE SET
      data = EXCLUDED.data, competencia_mes = EXCLUDED.competencia_mes,
      competencia_ano = EXCLUDED.competencia_ano, tipo = EXCLUDED.tipo,
      subtipo = EXCLUDED.subtipo, descricao = EXCLUDED.descricao,
      valor = EXCLUDED.valor, observacao = EXCLUDED.observacao, updated_at = now()
    RETURNING 1
  )
  SELECT count(*)::int INTO v_grav FROM ins;

  RETURN QUERY SELECT v_lin, v_grav;
END; $$;

CREATE OR REPLACE FUNCTION public.importar_lancamentos_vr_auto()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE r record; v_tot integer := 0; v_g integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  FOR r IN SELECT store_id FROM public.store_vr_config WHERE enabled LOOP
    BEGIN
      SELECT gravados INTO v_g FROM public.importar_lancamentos_vr(
        r.store_id, date_trunc('month', now() - interval '1 month')::date,
        (now() + interval '1 day')::date);
      v_tot := v_tot + COALESCE(v_g, 0);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.store_vr_config SET last_error = SQLERRM WHERE store_id = r.store_id;
    END;
  END LOOP;
  RETURN v_tot;
END; $$;