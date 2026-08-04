CREATE OR REPLACE FUNCTION public.gerar_metas_compra(p_store_id uuid, p_ano integer, p_mes integer)
 RETURNS TABLE(departamentos integer, meta_venda_total numeric, meta_compra_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.compras_config%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT * INTO v_cfg FROM public.compras_config
   WHERE store_id = p_store_id AND ano = p_ano AND mes = p_mes;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuracao de compras nao encontrada para %/%', p_mes, p_ano;
  END IF;

  RETURN QUERY
  WITH hist AS (
    SELECT h.departamento,
           SUM(h.venda)  AS venda,
           SUM(h.cmv)    AS cmv,
           SUM(h.compra) AS compra
    FROM public.compras_historico h
    WHERE h.store_id = p_store_id
      AND make_date(h.ano, h.mes, 1) BETWEEN date_trunc('month', v_cfg.hist_inicio)::date
                                         AND date_trunc('month', v_cfg.hist_fim)::date
    GROUP BY h.departamento
  ), tot AS (
    SELECT SUM(venda) AS venda_total FROM hist
  ), calc AS (
    SELECT h.departamento,
           h.venda / NULLIF(t.venda_total, 0)                        AS participacao,
           (h.venda / NULLIF(t.venda_total, 0)) * v_cfg.meta_venda_mes AS meta_venda,
           h.cmv / NULLIF(h.venda, 0)                                AS cmv_pct,
           (h.cmv - h.compra) * COALESCE(d.tx_recuperacao, 1)
             / NULLIF(v_cfg.parcelas_excesso, 0)                     AS parcela,
           COALESCE(d.tx_perdas, 0)                                  AS tx_perdas
    FROM hist h
    CROSS JOIN tot t
    LEFT JOIN public.compras_departamento d
           ON d.store_id = p_store_id AND d.departamento = h.departamento
                                      AND d.ativo
  ), final AS (
    SELECT departamento, participacao, meta_venda, parcela,
           ROUND(COALESCE(cmv_pct,0) * COALESCE(meta_venda,0) + COALESCE(parcela,0)
                 + tx_perdas * COALESCE(meta_venda,0), 2) AS meta_compra
    FROM calc
  ), gravado AS (
    INSERT INTO public.compras_meta
      (store_id, departamento, ano, mes, participacao, meta_venda, meta_compra,
       parcela_excesso, compra_sobre_venda, gerado_em)
    SELECT p_store_id, departamento, p_ano, p_mes,
           ROUND(COALESCE(participacao,0), 6),
           ROUND(COALESCE(meta_venda,0), 2),
           COALESCE(meta_compra,0),
           ROUND(COALESCE(parcela,0), 2),
           COALESCE(ROUND(COALESCE(meta_compra,0) / NULLIF(meta_venda, 0), 4), 0),
           now()
    FROM final
    ON CONFLICT (store_id, departamento, ano, mes) DO UPDATE SET
      participacao       = EXCLUDED.participacao,
      meta_venda         = EXCLUDED.meta_venda,
      meta_compra        = EXCLUDED.meta_compra,
      parcela_excesso    = EXCLUDED.parcela_excesso,
      compra_sobre_venda = EXCLUDED.compra_sobre_venda,
      gerado_em          = now()
    RETURNING meta_venda, meta_compra
  )
  SELECT COUNT(*)::int, ROUND(COALESCE(SUM(meta_venda),0),2), ROUND(COALESCE(SUM(meta_compra),0),2)
  FROM gravado;
END; $function$;