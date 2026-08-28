UPDATE public.websac_relatorios
SET sql = $report$
SELECT p.codproduto AS codigo,
       p.descricao AS descricao,
       ROUND(pe.customedrep,4) AS custo,
       ROUND(pe.precovrj,2) AS preco_venda,
       ROUND(pe.precovrjof,2) AS preco_oferta,
       ROUND(pe.sldatual,3) AS estoque,
       (SELECT ean.codean FROM public.produtoean ean
          WHERE ean.codproduto = p.codproduto
          ORDER BY LENGTH(CAST(ean.codean AS text)) DESC LIMIT 1) AS codigo_barras,
       d.nome AS m1_departamento,
       g.descricao AS m2_grupo,
       sg.descricao AS m3_subgrupo,
       f.descricao AS m4_familia
  FROM public.produtoestab pe
  JOIN public.produto p ON p.codproduto = pe.codproduto
  LEFT JOIN public.departamento d ON d.coddepto = p.coddepto
  LEFT JOIN public.grupoprod g ON g.coddepto = p.coddepto AND g.codgrupo = p.codgrupo
  LEFT JOIN public.subgrupo sg ON sg.codgrupo = p.codgrupo AND sg.codsubgrupo = p.codsubgrupo
  LEFT JOIN public.familia f ON f.codfamilia = p.codfamilia
 WHERE pe.codestabelec = {{loja}}
   AND pe.dtinativo IS NULL
   AND (CAST({{busca}} AS text) = ''
        OR p.descricao ILIKE '%'||CAST({{busca}} AS text)||'%'
        OR CAST(p.codproduto AS text) = CAST({{busca}} AS text)
        OR EXISTS (SELECT 1 FROM public.produtoean ean2
                    WHERE ean2.codproduto = p.codproduto
                      AND CAST(ean2.codean AS text) = CAST({{busca}} AS text)))
 ORDER BY p.descricao
 LIMIT {{limite}} OFFSET {{offset}}
$report$
WHERE nome = 'catalogo_produtos';

UPDATE public.websac_relatorios
SET sql = $report$
SELECT p.codproduto AS codigo,
       p.descricao AS descricao,
       ROUND(pe.customedrep,4) AS custo,
       ROUND(pe.precovrj,2) AS preco_venda,
       ROUND(pe.precovrjof,2) AS preco_oferta,
       ROUND(pe.sldatual,3) AS estoque,
       (SELECT ean.codean FROM public.produtoean ean
          WHERE ean.codproduto = p.codproduto
          ORDER BY LENGTH(CAST(ean.codean AS text)) DESC LIMIT 1) AS codigo_barras,
       d.nome AS m1_departamento,
       g.descricao AS m2_grupo,
       sg.descricao AS m3_subgrupo,
       f.descricao AS m4_familia
  FROM public.produtoestab pe
  JOIN public.produto p ON p.codproduto = pe.codproduto
  LEFT JOIN public.departamento d ON d.coddepto = p.coddepto
  LEFT JOIN public.grupoprod g ON g.coddepto = p.coddepto AND g.codgrupo = p.codgrupo
  LEFT JOIN public.subgrupo sg ON sg.codgrupo = p.codgrupo AND sg.codsubgrupo = p.codsubgrupo
  LEFT JOIN public.familia f ON f.codfamilia = p.codfamilia
 WHERE pe.codestabelec = {{loja}}
   AND pe.dtinativo IS NULL
   AND (CAST({{busca}} AS text) = ''
        OR p.descricao ILIKE '%'||CAST({{busca}} AS text)||'%'
        OR CAST(p.codproduto AS text) = CAST({{busca}} AS text)
        OR EXISTS (SELECT 1 FROM public.produtoean ean2
                    WHERE ean2.codproduto = p.codproduto
                      AND CAST(ean2.codean AS text) = CAST({{busca}} AS text)))
   AND EXISTS (SELECT 1 FROM public.consvendadia v
                WHERE v.codproduto = p.codproduto
                  AND v.codestabelec = pe.codestabelec
                  AND COALESCE(v.composicao,'N') <> 'F'
                  AND v.dtmovto BETWEEN {{inicio}} AND {{fim}})
 ORDER BY p.descricao
 LIMIT {{limite}} OFFSET {{offset}}
$report$
WHERE nome = 'catalogo_produtos_vendidos';

UPDATE public.websac_relatorios
SET sql = $report$
SELECT p.codproduto AS codigo,
       p.descricao AS produto,
       (SELECT ean.codean FROM public.produtoean ean
          WHERE ean.codproduto = p.codproduto
          ORDER BY LENGTH(CAST(ean.codean AS text)) DESC LIMIT 1) AS codigo_barras,
       d.nome AS departamento,
       ROUND(pe.sldatual,3) AS estoque,
       ROUND(pe.customedrep,4) AS custo_unit,
       ROUND(pe.precovrj,2) AS preco_venda,
       ROUND(pe.sldatual*pe.customedrep,2) AS valor_estoque_custo,
       ROUND(pe.sldatual*pe.precovrj,2) AS valor_estoque_venda,
       pe.dtultvda AS ultima_venda,
       pe.curva AS curva
  FROM public.produtoestab pe
  JOIN public.produto p ON p.codproduto = pe.codproduto
  LEFT JOIN public.departamento d ON d.coddepto = p.coddepto
 WHERE pe.codestabelec = {{loja}}
   AND pe.dtinativo IS NULL
 ORDER BY valor_estoque_custo DESC
$report$
WHERE nome = 'estoque_atual';

UPDATE public.websac_relatorios
SET sql = $report$
SELECT COALESCE(d.nome,'SEM DEPARTAMENTO') AS nivel1,
       COALESCE(g.descricao,'SEM GRUPO') AS nivel2,
       COALESCE(s.descricao,'SEM SUBGRUPO') AS nivel3,
       COALESCE(p.descricao,'SEM DESCRICAO') AS produto,
       v.codproduto AS codigo,
       (SELECT ean.codean FROM public.produtoean ean
          WHERE ean.codproduto = v.codproduto
          ORDER BY LENGTH(CAST(ean.codean AS text)) DESC LIMIT 1) AS codigo_barras,
       ROUND(MAX(pe.sldatual),3) AS estoque,
       ROUND(SUM(v.quantidade),3) AS volume,
       ROUND(SUM(v.venda),2) AS total_vendido,
       ROUND(SUM(v.venda)-SUM(v.custo),2) AS lucro
  FROM public.consvendadia v
  LEFT JOIN public.produto p ON p.codproduto = v.codproduto
  LEFT JOIN public.produtoestab pe ON pe.codproduto = v.codproduto AND pe.codestabelec = v.codestabelec
  LEFT JOIN public.departamento d ON d.coddepto = p.coddepto
  LEFT JOIN public.grupoprod g ON g.coddepto = p.coddepto AND g.codgrupo = p.codgrupo
  LEFT JOIN public.subgrupo s ON s.codgrupo = p.codgrupo AND s.codsubgrupo = p.codsubgrupo
 WHERE v.codestabelec = {{loja}}
   AND COALESCE(v.composicao,'N') <> 'F'
   AND v.dtmovto BETWEEN {{inicio}} AND {{fim}}
 GROUP BY d.nome,g.descricao,s.descricao,p.descricao,v.codproduto
 ORDER BY total_vendido DESC
$report$
WHERE nome = 'vendas_hierarquia_periodo';