INSERT INTO public.websac_relatorios (nome, descricao, sql) VALUES (
'estoque_dinamico',
'Compras x Vendas por produto no periodo, com estoque dinamico',
$SQL$
SELECT x.codproduto AS codigo,
       p.descricao AS descricao,
       (SELECT ean.codean FROM public.produtoean ean
          WHERE ean.codproduto = p.codproduto
          ORDER BY LENGTH(CAST(ean.codean AS text)) DESC LIMIT 1) AS codigo_barras,
       COALESCE(d.nome,'SEM DEPARTAMENTO') AS departamento,
       COALESCE(g.descricao,'SEM GRUPO') AS grupo,
       MAX(x.dt_compra) AS ultima_compra,
       COALESCE(MAX(x.dt_venda), MAX(pe.dtultvda)) AS ultima_venda,
       (CURRENT_DATE - MAX(x.dt_compra)) AS dias_desde_ultima_compra,
       ROUND(SUM(x.qtde_compra),3) AS qtd_compra,
       ROUND(SUM(x.compra),2) AS valor_compra,
       ROUND(SUM(x.qtde_venda),3) AS qtd_venda,
       ROUND(SUM(x.venda),2) AS valor_venda,
       ROUND(100*SUM(x.qtde_venda)/NULLIF(SUM(x.qtde_compra),0),2) AS progresso_venda,
       ROUND(SUM(x.qtde_compra)-SUM(x.qtde_venda),3) AS estoque_dinamico,
       ROUND((SUM(x.qtde_compra)-SUM(x.qtde_venda))*MAX(COALESCE(pe.customedrep,0)),2) AS valor_estoque_dinamico,
       ROUND(MAX(COALESCE(pe.sldatual,0)),3) AS estoque_sistema,
       ROUND(MAX(COALESCE(pe.customedrep,0)),4) AS custo_unit,
       ROUND(MAX(COALESCE(pe.precovrj,0)),2) AS preco_venda
  FROM (
    SELECT v.codproduto,
           v.quantidade AS qtde_venda, v.venda,
           0 AS qtde_compra, 0 AS compra,
           NULL::date AS dt_compra, v.dtmovto::date AS dt_venda
      FROM public.consvendadia v
     WHERE v.codestabelec = {{loja}}
       AND COALESCE(v.composicao,'N') <> 'F'
       AND v.dtmovto BETWEEN {{inicio}} AND {{fim}}
    UNION ALL
    SELECT i.codproduto,
           0, 0,
           i.quantidade, i.totalliquido,
           n.dtentrega::date AS dt_compra, NULL::date AS dt_venda
      FROM public.itnotafiscal i
      JOIN public.notafiscal n ON n.idnotafiscal = i.idnotafiscal
     WHERE i.codestabelec = {{loja}}
       AND n.operacao = 'CP'
       AND COALESCE(i.composicao,'N') <> 'F'
       AND n.dtentrega BETWEEN {{inicio}} AND {{fim}}
  ) x
  JOIN public.produto p ON p.codproduto = x.codproduto
  LEFT JOIN public.produtoestab pe ON pe.codproduto = x.codproduto AND pe.codestabelec = {{loja}}
  LEFT JOIN public.departamento d ON d.coddepto = p.coddepto
  LEFT JOIN public.grupoprod g ON g.coddepto = p.coddepto AND g.codgrupo = p.codgrupo
 GROUP BY x.codproduto, p.codproduto, p.descricao, d.nome, g.descricao
 ORDER BY valor_compra DESC
$SQL$
)
ON CONFLICT (nome) DO UPDATE SET sql = EXCLUDED.sql, descricao = EXCLUDED.descricao, atualizado_em = now();
