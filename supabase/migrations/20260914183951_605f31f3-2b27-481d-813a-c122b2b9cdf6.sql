DELETE FROM public.websac_relatorios WHERE nome IN ('fornecedores','pricing_por_fornecedor','custos_por_produto');

INSERT INTO public.websac_relatorios (nome, descricao, sql, atualizado_em) VALUES
('fornecedores',
 'Fornecedores com nota de entrada nos ultimos 12 meses',
 $$SELECT f.codfornec AS id,
       f.codfornec AS id_fornecedor,
       COALESCE(NULLIF(f.razaosocial,''), f.nome) AS razao_social,
       f.nome AS nome,
       f.cpfcnpj AS cnpj
  FROM public.fornecedor f
 WHERE EXISTS (SELECT 1 FROM public.notafiscal n
                WHERE n.codparceiro = f.codfornec
                  AND n.operacao = 'CP'
                  AND n.codestabelec = {{loja}}
                  AND n.dtentrega >= CURRENT_DATE - INTERVAL '12 months')
 ORDER BY razao_social$$,
 now()),
('pricing_por_fornecedor',
 'Produtos com entrada de nota dos fornecedores selecionados no periodo',
 $$WITH entradas AS (
  SELECT i.codproduto, n.codparceiro AS codfornec, n.dtentrega AS data,
         i.quantidade AS qtd, i.totalliquido AS total,
         ROUND(i.totalliquido/NULLIF(i.quantidade,0),4) AS custo_unit
    FROM public.itnotafiscal i
    JOIN public.notafiscal n ON n.idnotafiscal = i.idnotafiscal
   WHERE i.codestabelec = {{loja}}
     AND n.operacao = 'CP'
     AND COALESCE(i.composicao,'N') <> 'F'
     AND n.dtentrega BETWEEN {{inicio}} AND {{fim}}
     AND CAST(n.codparceiro AS text) = ANY (string_to_array({{fornecedores}}, ','))
), ult AS (
  SELECT DISTINCT ON (codproduto) codproduto, codfornec, data, qtd, custo_unit, total
    FROM entradas ORDER BY codproduto, data DESC
), agg AS (
  SELECT codproduto, COUNT(*) AS qtd_entradas,
         ROUND(SUM(total)/NULLIF(SUM(qtd),0),4) AS custo_medio
    FROM entradas GROUP BY codproduto
), vendas AS (
  SELECT v.codproduto, ROUND(SUM(v.quantidade),3) AS qtd_vendida,
         ROUND(SUM(v.venda),2) AS valor_vendido
    FROM public.consvendadia v
   WHERE v.codestabelec = {{loja}}
     AND COALESCE(v.composicao,'N') <> 'F'
     AND v.dtmovto BETWEEN {{inicio}} AND {{fim}}
   GROUP BY v.codproduto
)
SELECT p.codproduto AS id_produto,
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
  FROM ult
  JOIN agg ON agg.codproduto = ult.codproduto
  JOIN public.produto p ON p.codproduto = ult.codproduto
  JOIN public.produtoestab pe ON pe.codproduto = ult.codproduto AND pe.codestabelec = {{loja}}
  LEFT JOIN public.departamento d ON d.coddepto = p.coddepto
  LEFT JOIN public.fornecedor f ON f.codfornec = ult.codfornec
  LEFT JOIN vendas ven ON ven.codproduto = ult.codproduto
 ORDER BY valor_vendido DESC$$,
 now()),
('custos_por_produto',
 'Custo, preco e estoque atuais de uma lista de codigos de produto',
 $$SELECT CAST(p.codproduto AS text) AS cod,
       p.codproduto AS id_produto,
       (CASE WHEN length(COALESCE(p.descricaofiscal,'')) > length(COALESCE(p.descricao,'')) THEN p.descricaofiscal ELSE p.descricao END) AS descricao,
       (SELECT ean.codean FROM public.produtoean ean
          WHERE ean.codproduto = p.codproduto
          ORDER BY LENGTH(CAST(ean.codean AS text)) DESC LIMIT 1) AS ean,
       ROUND(pe.customedrep,4) AS custo_atual,
       ROUND(pe.precovrj,2) AS preco_atual,
       ROUND(pe.sldatual,3) AS estoque_atual,
       ROUND(100*(pe.precovrj-pe.customedrep)/NULLIF(pe.precovrj,0),2) AS margem_cadastrada
  FROM public.produtoestab pe
  JOIN public.produto p ON p.codproduto = pe.codproduto
 WHERE pe.codestabelec = {{loja}}
   AND pe.dtinativo IS NULL
   AND CAST(p.codproduto AS text) = ANY (string_to_array({{codigos}}, ','))$$,
 now());