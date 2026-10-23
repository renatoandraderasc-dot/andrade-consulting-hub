CREATE OR REPLACE FUNCTION public.fn_classificar_lancamentos(p_store_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 5000)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_total integer := 0;
BEGIN
  IF p_store_id IS NULL THEN
    IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'somente administrador pode reclassificar todas as lojas'; END IF;
  ELSE
    IF auth.uid() IS NOT NULL AND NOT (has_role(auth.uid(),'admin') OR is_supervisor(auth.uid()) OR tem_acesso_loja(p_store_id)) THEN
      RAISE EXCEPTION 'sem acesso a esta loja'; END IF;
  END IF;

  WITH base AS (
    SELECT l.id, l.tipo, l.subtipo,
      CASE WHEN m.tipo IS NOT NULL AND lower(coalesce(l.descricao,'')) !~ '(ministerio da fazenda|receita federal|sefaz|(^| )darf( |$)|(^| )gps( |$))' THEN m.tipo ELSE c.tipo END nt,
      CASE WHEN m.tipo IS NOT NULL AND lower(coalesce(l.descricao,'')) !~ '(ministerio da fazenda|receita federal|sefaz|(^| )darf( |$)|(^| )gps( |$))' THEN m.subtipo ELSE c.subtipo END ns
    FROM lancamentos l
    LEFT JOIN LATERAL (SELECT v.tipo, v.subtipo FROM vr_lancamento_map v
      WHERE v.id_tipo = l.id_tipo AND (v.store_id = l.store_id OR v.store_id IS NULL)
      ORDER BY v.store_id NULLS LAST LIMIT 1) m ON true
    CROSS JOIN LATERAL fn_classificar_lancamento(l.tipo_entrada, l.descricao, l.observacao) c
    WHERE coalesce(l.classificacao_manual, false) = false
      AND l.tipo NOT IN ('Faturamento','Recebimentos','Cancelamentos','Descontos')
      AND (p_store_id IS NULL OR l.store_id = p_store_id)
  ), alvo AS (
    SELECT id, nt, ns FROM base WHERE tipo IS DISTINCT FROM nt OR subtipo IS DISTINCT FROM ns
    LIMIT greatest(p_limite, 1)
  ), upd AS (
    UPDATE lancamentos l SET tipo = a.nt, subtipo = a.ns, updated_at = now()
    FROM alvo a WHERE l.id = a.id RETURNING 1
  )
  SELECT count(*) INTO v_total FROM upd;
  RETURN v_total;
END;
$function$;