UPDATE public.websac_relatorios SET sql = $q$SELECT p.codproduto AS codigo,
       p.descricao AS descricao,
       ROUND(pe.customedrep,4) AS custo,
       ROUND(pe.precovrj,2) AS preco_venda,
       ROUND(pe.precovrjof,2) AS preco_oferta,
       (SELECT ean.codean FROM public.produtoean ean
          WHERE ean.codproduto = p.codproduto
          ORDER BY LENGTH(ean.codean) DESC LIMIT 1) AS codigo_barras,
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
 LIMIT {{limite}} OFFSET {{offset}}$q$, atualizado_em = now()
WHERE nome = 'catalogo_produtos';