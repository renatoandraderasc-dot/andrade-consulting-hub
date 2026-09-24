-- Destino completo de um lancamento: tenta o tipo de entrada do ERP, depois o
-- texto do beneficiario/descricao e, por fim, trata titulo de fornecedor como
-- compra/pagamento de mercadoria. Nunca devolve linha sem destino.
CREATE OR REPLACE FUNCTION public.fn_classificar_lancamento(
  p_tipo_entrada text,
  p_descricao text,
  p_observacao text DEFAULT NULL
)
RETURNS TABLE(tipo text, subtipo text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r record;
  padrao_tipo constant text := 'Despesas';
  padrao_sub  constant text := 'OUTRAS DESPESAS (ADMINISTRATIVA)';
BEGIN
  -- 1) Tipo de entrada do ERP (fonte mais confiavel)
  IF coalesce(trim(p_tipo_entrada), '') <> ''
     AND lower(trim(p_tipo_entrada)) NOT IN ('outros','outro','sem tipo','nao cadastrado','não cadastrado','sem classe','-') THEN
    SELECT * INTO r FROM fn_classificar_conta(p_tipo_entrada);
    IF NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
      RETURN QUERY SELECT r.tipo, r.subtipo; RETURN;
    END IF;
  END IF;

  -- 2) Texto do beneficiario / historico
  IF coalesce(trim(p_descricao), '') <> '' OR coalesce(trim(p_observacao), '') <> '' THEN
    SELECT * INTO r FROM fn_classificar_conta(concat_ws(' ', p_descricao, p_observacao));
    IF NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
      RETURN QUERY SELECT r.tipo, r.subtipo; RETURN;
    END IF;
  END IF;

  -- 3) Titulo de fornecedor sem pista = compra / pagamento de mercadoria
  IF coalesce(trim(p_descricao), '') <> '' THEN
    RETURN QUERY SELECT 'Compra do Mês', 'COMPRA DO MÊS'; RETURN;
  END IF;

  RETURN QUERY SELECT padrao_tipo, padrao_sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_classificar_lancamento(text, text, text) TO authenticated, service_role;

-- Reaplica o destino canonico nos lancamentos, respeitando a edicao manual.
CREATE OR REPLACE FUNCTION public.fn_classificar_lancamentos(
  p_store_id uuid DEFAULT NULL,
  p_limite integer DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
BEGIN
  IF p_store_id IS NULL THEN
    IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'somente administrador pode reclassificar todas as lojas';
    END IF;
  ELSE
    IF auth.uid() IS NOT NULL
       AND NOT (has_role(auth.uid(),'admin') OR is_supervisor(auth.uid()) OR tem_acesso_loja(p_store_id)) THEN
      RAISE EXCEPTION 'sem acesso a esta loja';
    END IF;
  END IF;

  WITH alvo AS (
    SELECT l.id, c.tipo AS nt, c.subtipo AS ns
    FROM lancamentos l
    CROSS JOIN LATERAL fn_classificar_lancamento(l.tipo_entrada, l.descricao, l.observacao) c
    WHERE coalesce(l.classificacao_manual, false) = false
      AND l.tipo NOT IN ('Faturamento', 'Recebimentos')
      AND (p_store_id IS NULL OR l.store_id = p_store_id)
      AND (l.tipo IS DISTINCT FROM c.tipo OR l.subtipo IS DISTINCT FROM c.subtipo)
    LIMIT greatest(p_limite, 1)
  ), upd AS (
    UPDATE lancamentos l
    SET tipo = a.nt, subtipo = a.ns, updated_at = now()
    FROM alvo a WHERE l.id = a.id
    RETURNING 1
  )
  SELECT count(*) INTO v_total FROM upd;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_classificar_lancamentos(uuid, integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fn_classificar_lancamentos(uuid);