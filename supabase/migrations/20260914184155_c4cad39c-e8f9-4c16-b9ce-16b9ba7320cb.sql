UPDATE public.websac_relatorios
   SET sql = REPLACE(sql, 'string_to_array({{fornecedores}}, '','')', 'string_to_array(CAST({{fornecedores}} AS text), '','')'),
       atualizado_em = now()
 WHERE nome = 'pricing_por_fornecedor';