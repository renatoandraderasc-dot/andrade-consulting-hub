INSERT INTO public.meta_taxas (store_id, department, tipo, tx_venda, tx_margem, tx_volume)
SELECT 'a0e2d7f3-7017-4b27-9afe-6749be40f7df'::uuid, d.department, t.tipo,
       CASE WHEN t.forte THEN 0.05662 ELSE 0.02662 END, 0.0232, 0
FROM (VALUES ('PADARIA'),('AÇOUGUE'),('HORTIFRUTI'),('OUTROS'),('LOJA')) AS d(department)
CROSS JOIN (
  SELECT tipo, forte FROM (VALUES
    ('SEG D', false), ('TER D', false), ('QUA D', false),
    ('QUI D', true),  ('SEX D', true),
    ('SAB F', true),  ('DOM F', true),
    ('PRIMEIRO DIA D', true), ('PRIMEIRO DIA F', true),
    ('ULTIMO DIA D', true),   ('ULTIMO DIA F', true),
    ('4o DIA UTIL D', true),  ('5o DIA UTIL D', true),
    ('VALE D', true), ('VALE F', true),
    ('FERIADO D', false), ('FERIADO F', false)
  ) AS g(tipo, forte)
  UNION ALL
  SELECT x.dia || ' ' || s.n || ' ' || x.suf, x.forte
  FROM (VALUES
    ('SEG','D',false), ('TER','D',false), ('QUA','D',false),
    ('QUI','D',true),  ('SEX','D',true),
    ('SAB','F',true),  ('DOM','F',true)
  ) AS x(dia, suf, forte)
  CROSS JOIN generate_series(1, 6) AS s(n)
) AS t(tipo, forte)
ON CONFLICT (store_id, department, tipo) DO NOTHING;