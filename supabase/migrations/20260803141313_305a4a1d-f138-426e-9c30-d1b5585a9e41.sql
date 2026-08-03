UPDATE public.websac_relatorios
SET sql = $q$SELECT v.dtmovto AS data,
       COALESCE(d.nome,'SEM DEPARTAMENTO') || ' / ' || COALESCE(g.descricao,'SEM GRUPO') AS secao,
       COALESCE(d.nome,'SEM DEPARTAMENTO') AS categoria,
       COALESCE(g.descricao,'SEM GRUPO') AS grupo,
       ROUND(SUM(v.venda),2) AS total_vendido,
       ROUND(SUM(v.venda)-SUM(v.custo),2) AS lucro,
       ROUND(SUM(v.quantidade),3) AS volume
  FROM public.consvendadia v
  LEFT JOIN public.produto p ON p.codproduto = v.codproduto
  LEFT JOIN public.departamento d ON d.coddepto = p.coddepto
  LEFT JOIN public.grupoprod g ON g.coddepto = p.coddepto AND g.codgrupo = p.codgrupo
 WHERE v.codestabelec = {{loja}}
   AND v.dtmovto BETWEEN {{inicio}} AND {{fim}}
 GROUP BY v.dtmovto, d.nome, g.descricao
 ORDER BY v.dtmovto, total_vendido DESC$q$,
    atualizado_em = now()
WHERE nome = 'vendas_secao_periodo';