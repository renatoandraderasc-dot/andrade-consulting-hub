UPDATE public.websac_relatorios
   SET sql = $$SELECT p.codproduto AS id_produto,
       CAST(p.codproduto AS text) AS cod,
       CAST(p.codproduto AS text) AS codigo,
       (CASE WHEN length(COALESCE(p.descricaofiscal,'')) > length(COALESCE(p.descricao,'')) THEN p.descricaofiscal ELSE p.descricao END) AS descricao,
       (SELECT ean.codean FROM public.produtoean ean
          WHERE ean.codproduto = p.codproduto
          ORDER BY LENGTH(CAST(ean.codean AS text)) DESC LIMIT 1) AS ean,
       d.nome AS departamento,
       CAST(p.coddepto AS text) AS id_departamento,
       pe.curva AS curva_abc,
       ult.data AS data_ultima_entrada,
       ult.qtd AS qtd_ultima_entrada,
       ult.custo_unit AS custo_unitario,
       ult.total AS valor_total_entrada,
       agg.qtd_entradas AS qtd_entradas_periodo,
       agg.custo_medio AS custo_medio_periodo,
       f.nome AS fornecedor,
       ult.codfornec AS id_fornecedor,
       ROUND(pe.precovrj,2) AS preco_atual,
       ROUND(pe.precovrjof,2) AS preco_oferta,
       ROUND(pe.sldatual,3) AS estoque,
       COALESCE(ven.qtd_vendida,0) AS qtd_vendida,
       COALESCE(ven.valor_vendido,0) AS valor_vendido
  FROM (
    SELECT DISTINCT ON (i.codproduto) i.codproduto, n.codparceiro AS codfornec, n.dtentrega AS data,
           i.quantidade AS qtd, ROUND(i.totalliquido/NULLIF(i.quantidade,0),4) AS custo_unit, i.totalliquido AS total
      FROM public.itnotafiscal i
      JOIN public.notafiscal n ON n.idnotafiscal = i.idnotafiscal
     WHERE i.codestabelec = {{loja}}
       AND n.operacao = 'CP'
       AND COALESCE(i.composicao,'N') <> 'F'
       AND n.dtentrega BETWEEN {{inicio}} AND {{fim}}
       AND CAST(n.codparceiro AS text) = ANY (string_to_array({{fornecedores}}, ','))
     ORDER BY i.codproduto, n.dtentrega DESC
  ) ult
  JOIN (
    SELECT i2.codproduto, COUNT(*) AS qtd_entradas,
           ROUND(SUM(i2.totalliquido)/NULLIF(SUM(i2.quantidade),0),4) AS custo_medio
      FROM public.itnotafiscal i2
      JOIN public.notafiscal n2 ON n2.idnotafiscal = i2.idnotafiscal
     WHERE i2.codestabelec = {{loja}}
       AND n2.operacao = 'CP'
       AND COALESCE(i2.composicao,'N') <> 'F'
       AND n2.dtentrega BETWEEN {{inicio}} AND {{fim}}
       AND CAST(n2.codparceiro AS text) = ANY (string_to_array({{fornecedores}}, ','))
     GROUP BY i2.codproduto
  ) agg ON agg.codproduto = ult.codproduto
  JOIN public.produto p ON p.codproduto = ult.codproduto
  JOIN public.produtoestab pe ON pe.codproduto = ult.codproduto AND pe.codestabelec = {{loja}}
  LEFT JOIN public.departamento d ON d.coddepto = p.coddepto
  LEFT JOIN public.fornecedor f ON f.codfornec = ult.codfornec
  LEFT JOIN (
    SELECT v.codproduto, ROUND(SUM(v.quantidade),3) AS qtd_vendida, ROUND(SUM(v.venda),2) AS valor_vendido
      FROM public.consvendadia v
     WHERE v.codestabelec = {{loja}}
       AND COALESCE(v.composicao,'N') <> 'F'
       AND v.dtmovto BETWEEN {{inicio}} AND {{fim}}
     GROUP BY v.codproduto
  ) ven ON ven.codproduto = ult.codproduto
 ORDER BY valor_vendido DESC$$,
       atualizado_em = now()
 WHERE nome = 'pricing_por_fornecedor';