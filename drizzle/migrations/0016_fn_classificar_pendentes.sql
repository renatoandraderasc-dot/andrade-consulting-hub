-- Classifica apenas os lancamentos pendentes (sem destino valido).
-- Pre-seleciona por filtro barato antes de rodar o classificador (caro).
CREATE OR REPLACE FUNCTION public.fn_classificar_pendentes(p_store_id uuid DEFAULT NULL, p_limite integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'nao autenticado';
  END IF;

  WITH pend AS (
    SELECT l.id, l.tipo_entrada, l.descricao, l.observacao
    FROM lancamentos l
    WHERE coalesce(l.classificacao_manual, false) = false
      AND l.tipo NOT IN ('Faturamento', 'Recebimentos')
      AND (p_store_id IS NULL OR l.store_id = p_store_id)
      AND (l.subtipo IS NULL OR btrim(l.subtipo) = '' OR l.subtipo = 'OUTROS')
    LIMIT greatest(p_limite, 1)
  ), alvo AS (
    SELECT p.id, c.tipo AS nt, c.subtipo AS ns
    FROM pend p
    CROSS JOIN LATERAL fn_classificar_lancamento(p.tipo_entrada, p.descricao, p.observacao) c
  ), upd AS (
    UPDATE lancamentos l
    SET tipo = a.nt, subtipo = a.ns, updated_at = now()
    FROM alvo a WHERE l.id = a.id
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM upd;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_classificar_pendentes(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_classificar_pendentes(uuid, integer) TO authenticated, service_role;
