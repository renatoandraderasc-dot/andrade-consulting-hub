CREATE OR REPLACE FUNCTION public.gerar_metas_compra(p_store_id uuid, p_ano integer, p_mes integer)
RETURNS TABLE(departamentos integer, meta_venda_total numeric, meta_compra_total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.compras_config%ROWTYPE;
  v_meta numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'acesso negado'; END IF;
  SELECT * INTO v_cfg FROM public.compras_config WHERE store_id = p_store_id AND ano = p_ano AND mes = p_mes;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configuracao de compras nao encontrada para %/%', p_mes, p_ano; END IF;
  v_meta := public.meta_venda_mes_dashboard(p_store_id, p_ano, p_mes);
  IF COALESCE(v_meta,0) <= 0 THEN v_meta := COALESCE(v_cfg.meta_venda_mes,0); END IF;
  IF v_meta <= 0 THEN RAISE EXCEPTION 'Meta de venda do mês %/% não encontrada no Dashboard de Vendas', p_mes, p_ano; END IF;
  UPDATE public.compras_config SET meta_venda_mes = v_meta WHERE store_id = p_store_id AND ano = p_ano AND mes = p_mes;
  -- LOJA e GERAL são metas agregadas independentes, nunca geradas por departamento.
  DELETE FROM public.compras_meta WHERE store_id = p_store_id AND ano = p_ano AND mes = p_mes AND upper(trim(departamento)) NOT IN ('LOJA','GERAL');
  RETURN QUERY
  WITH hist AS (
    SELECT h.departamento, SUM(h.venda) AS venda, SUM(h.cmv) AS cmv, SUM(h.compra) AS compra, d.tx_recuperacao, d.tx_perdas
    FROM public.compras_historico h JOIN public.compras_departamento d ON d.store_id = h.store_id AND d.departamento = h.departamento AND d.ativo
    WHERE h.store_id = p_store_id AND upper(trim(h.departamento)) NOT IN ('LOJA','GERAL')
      AND make_date(h.ano,h.mes,1) BETWEEN date_trunc('month',v_cfg.hist_inicio)::date AND date_trunc('month',v_cfg.hist_fim)::date
    GROUP BY h.departamento,d.tx_recuperacao,d.tx_perdas
  ), tot AS (SELECT SUM(venda) AS venda_total FROM hist), base AS (
    SELECT h.*, h.venda / NULLIF(t.venda_total,0) AS participacao,
      ROUND(COALESCE(h.venda / NULLIF(t.venda_total,0) * v_meta,0),2) AS mv_arred,
      h.cmv / NULLIF(h.venda,0) AS cmv_pct,
      h.cmv - h.compra AS historico_assinado,
      (h.cmv - h.compra) * LEAST(GREATEST(CASE WHEN h.tx_recuperacao > 1 THEN h.tx_recuperacao/100 ELSE COALESCE(h.tx_recuperacao,1) END,0),1) / NULLIF(v_cfg.parcelas_excesso,0) AS parcela,
      LEAST(GREATEST(CASE WHEN h.tx_perdas > 1 THEN h.tx_perdas/100 ELSE COALESCE(h.tx_perdas,0) END,0),1) AS perdas_normalizadas,
      ROW_NUMBER() OVER (ORDER BY h.venda DESC NULLS LAST,h.departamento) AS rk
    FROM hist h CROSS JOIN tot t
  ), residuo AS (
    SELECT CASE WHEN (SELECT venda_total FROM tot) > 0 THEN ROUND(v_meta,2)-COALESCE(SUM(mv_arred),0) ELSE 0 END AS r FROM base
  ), calc AS (
    SELECT b.*, b.mv_arred + CASE WHEN b.rk=1 THEN r.r ELSE 0 END AS meta_venda FROM base b CROSS JOIN residuo r
  ), final AS (
    SELECT *, GREATEST(ROUND(COALESCE(cmv_pct,0)*COALESCE(meta_venda,0)*(1-perdas_normalizadas)+COALESCE(parcela,0),2),0) AS meta_compra FROM calc
  ), gravado AS (
    INSERT INTO public.compras_meta (store_id,departamento,ano,mes,participacao,meta_venda,meta_compra,parcela_excesso,compra_sobre_venda,venda_hist,cmv_hist,compra_hist,cmv_pct,excesso_hist,gerado_em)
    SELECT p_store_id,departamento,p_ano,p_mes,ROUND(COALESCE(participacao,0),6),meta_venda,meta_compra,ROUND(COALESCE(parcela,0),2),COALESCE(ROUND(meta_compra/NULLIF(meta_venda,0),4),0),ROUND(venda,2),ROUND(cmv,2),ROUND(compra,2),ROUND(COALESCE(cmv_pct,0),6),ROUND(historico_assinado,2),NOW() FROM final
    ON CONFLICT (store_id,departamento,ano,mes) DO UPDATE SET participacao=EXCLUDED.participacao,meta_venda=EXCLUDED.meta_venda,meta_compra=EXCLUDED.meta_compra,parcela_excesso=EXCLUDED.parcela_excesso,compra_sobre_venda=EXCLUDED.compra_sobre_venda,venda_hist=EXCLUDED.venda_hist,cmv_hist=EXCLUDED.cmv_hist,compra_hist=EXCLUDED.compra_hist,cmv_pct=EXCLUDED.cmv_pct,excesso_hist=EXCLUDED.excesso_hist,gerado_em=NOW()
    RETURNING meta_venda,meta_compra
  ) SELECT COUNT(*)::int,ROUND(COALESCE(SUM(meta_venda),0),2),ROUND(COALESCE(SUM(meta_compra),0),2) FROM gravado;
END; $function$;
REVOKE ALL ON FUNCTION public.gerar_metas_compra(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gerar_metas_compra(uuid,integer,integer) TO authenticated,service_role;