CREATE TABLE IF NOT EXISTS public.mix_cadastro (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  ean text NOT NULL,
  descricao text,
  secao text NOT NULL DEFAULT '',
  grupo text NOT NULL DEFAULT '',
  PRIMARY KEY (store_id, codigo)
);
GRANT ALL ON public.mix_cadastro TO service_role;
CREATE INDEX IF NOT EXISTS mix_cadastro_ean_idx ON public.mix_cadastro (store_id, ean);

CREATE TABLE IF NOT EXISTS public.mix_base_12m (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  ean text NOT NULL,
  descricao text,
  secao text NOT NULL DEFAULT '',
  grupo text NOT NULL DEFAULT '',
  dias integer NOT NULL,
  vendas numeric NOT NULL,
  lucro numeric NOT NULL,
  volume numeric NOT NULL,
  venda_secao numeric NOT NULL,
  ini_acum numeric NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, ean)
);
GRANT ALL ON public.mix_base_12m TO service_role;
CREATE INDEX IF NOT EXISTS mix_base_12m_ean_idx ON public.mix_base_12m (ean);

ALTER TABLE public.mix_cadastro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mix_base_12m ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.mix_ean(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT ltrim(regexp_replace(split_part(coalesce(v, ''), '.', 1), '\D', '', 'g'), '0')
$$;

CREATE OR REPLACE FUNCTION public.mix_atualizar_base()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  TRUNCATE public.mix_base_12m, public.mix_cadastro;
  INSERT INTO public.mix_cadastro (store_id, codigo, ean, descricao, secao, grupo)
  WITH reg AS (
    SELECT DISTINCT ON (c.store_id) c.id, c.store_id
    FROM public.relatorio_cache c
    WHERE c.relatorio IN ('produtos', 'catalogo_produtos') AND c.linhas > 0
    ORDER BY c.store_id, (c.relatorio = 'produtos') DESC, c.linhas DESC, c.id DESC
  ), lin AS (
    SELECT r.store_id,
           ltrim(btrim(coalesce(l->>'codigo', l->>'cod', l->>'CODIGO')), '0') AS codigo,
           public.mix_ean(coalesce(l->>'ean', l->>'codigo_barras', l->>'barras', l->>'barcode', l->>'CODIGO_BARRAS')) AS ean,
           coalesce(l->>'descricao', l->>'produto', l->>'DESCRICAO') AS descricao,
           upper(btrim(coalesce(l->>'secao', l->>'departamento', l->>'m1_departamento', l->>'n1', l->>'SECAO', ''))) AS secao,
           upper(btrim(coalesce(l->>'grupo', l->>'m2_grupo', l->>'n2', l->>'GRUPO', ''))) AS grupo
    FROM reg r
    JOIN public.relatorio_cache c ON c.id = r.id AND jsonb_typeof(c.dados) = 'array'
    CROSS JOIN LATERAL jsonb_array_elements(c.dados) l
  )
  SELECT DISTINCT ON (store_id, codigo) store_id, codigo, ean, descricao, secao, grupo
  FROM lin
  WHERE coalesce(codigo, '') <> '' AND length(ean) BETWEEN 8 AND 14
    AND NOT (length(ean) = 13 AND left(ean, 1) = '2')
  ORDER BY store_id, codigo;

  INSERT INTO public.mix_base_12m (store_id, ean, descricao, secao, grupo, dias, vendas, lucro, volume, venda_secao, ini_acum)
  WITH diarios AS (
    SELECT DISTINCT ON (c.store_id, c.params->>'inicio') c.id, c.store_id, 1 AS dias
    FROM public.relatorio_cache c
    WHERE c.relatorio = 'ranking_produtos' AND c.linhas > 0
      AND c.params->>'inicio' = c.params->>'fim'
      AND c.params->>'inicio' >= to_char(current_date - 365, 'YYYY-MM-DD')
    ORDER BY c.store_id, c.params->>'inicio', c.linhas DESC, c.id DESC
  ), periodo AS (
    SELECT DISTINCT ON (c.store_id) c.id, c.store_id,
           ((c.params->>'fim')::date - (c.params->>'inicio')::date + 1) AS dias
    FROM public.relatorio_cache c
    WHERE c.relatorio = 'ranking_produtos' AND c.linhas > 0
      AND c.params->>'inicio' ~ '^\d{4}-\d{2}-\d{2}$'
      AND c.params->>'fim' ~ '^\d{4}-\d{2}-\d{2}$'
      AND c.params->>'inicio' <> c.params->>'fim'
      AND c.params->>'inicio' >= to_char(current_date - 365, 'YYYY-MM-DD')
      AND NOT EXISTS (SELECT 1 FROM diarios d WHERE d.store_id = c.store_id)
    ORDER BY c.store_id, c.linhas DESC, c.id DESC
  ), regs AS (SELECT * FROM diarios UNION ALL SELECT * FROM periodo),
  dias_loja AS (SELECT store_id, sum(dias)::int AS dias FROM regs GROUP BY 1),
  vend AS (
    SELECT r.store_id,
           ltrim(btrim(coalesce(l->>'codigo', l->>'cod', l->>'CODIGO', l->>'id_produto')), '0') AS codigo,
           max(coalesce(l->>'ean', l->>'codigo_barras', l->>'barras', l->>'CODIGO_BARRAS')) AS ean_r,
           max(coalesce(l->>'produto', l->>'descricao', l->>'PRODUTO')) AS descricao,
           max(coalesce(l->>'secao', l->>'departamento', l->>'m1_departamento')) AS secao,
           max(coalesce(l->>'grupo', l->>'m2_grupo')) AS grupo,
           sum(CASE WHEN x.v ~ '^-?\d+(\.\d+)?$' THEN x.v::numeric ELSE 0 END) AS vendas,
           sum(CASE WHEN x.p ~ '^-?\d+(\.\d+)?$' THEN x.p::numeric ELSE 0 END) AS lucro,
           sum(CASE WHEN x.q ~ '^-?\d+(\.\d+)?$' THEN x.q::numeric ELSE 0 END) AS volume
    FROM regs r
    JOIN public.relatorio_cache c ON c.id = r.id AND jsonb_typeof(c.dados) = 'array'
    CROSS JOIN LATERAL jsonb_array_elements(c.dados) l
    CROSS JOIN LATERAL (SELECT coalesce(l->>'vendas', l->>'total_vendido', l->>'valor', l->>'VENDAS') AS v,
           coalesce(l->>'lucro', l->>'LUCRO') AS p,
           coalesce(l->>'volume', l->>'qtd', l->>'VOLUME') AS q) x
    GROUP BY 1, 2
  ), junto AS (
    SELECT v.store_id, coalesce(nullif(public.mix_ean(v.ean_r), ''), k.ean, '') AS ean,
           coalesce(nullif(v.descricao, ''), k.descricao) AS descricao,
           upper(btrim(coalesce(nullif(v.secao, ''), k.secao, ''))) AS secao,
           upper(btrim(coalesce(nullif(v.grupo, ''), k.grupo, ''))) AS grupo,
           v.vendas, v.lucro, v.volume
    FROM vend v
    LEFT JOIN public.mix_cadastro k ON k.store_id = v.store_id AND k.codigo = v.codigo
  ), agg AS (
    SELECT j.store_id, j.ean, max(j.descricao) AS descricao, max(j.secao) AS secao, max(j.grupo) AS grupo,
           d.dias, sum(j.vendas) AS vendas, sum(j.lucro) AS lucro, sum(j.volume) AS volume
    FROM junto j
    JOIN public.stores s ON s.id = j.store_id
    JOIN dias_loja d ON d.store_id = j.store_id
    LEFT JOIN public.store_vr_config cfg ON cfg.store_id = j.store_id
    WHERE length(j.ean) BETWEEN 8 AND 14
      AND NOT (length(j.ean) = 13 AND left(j.ean, 1) = '2')
      AND s.name NOT ILIKE '%Grupo%' AND coalesce(cfg.codigo_loja, '') <> '0'
    GROUP BY j.store_id, j.ean, d.dias HAVING sum(j.vendas) > 0
  )
  SELECT a.store_id, a.ean, a.descricao, a.secao, a.grupo, a.dias, a.vendas, a.lucro, a.volume,
         sum(a.vendas) OVER w_sec AS venda_secao,
         coalesce((sum(a.vendas) OVER (PARTITION BY a.store_id, a.secao ORDER BY a.vendas DESC, a.ean
                                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING))
                  / nullif(sum(a.vendas) OVER w_sec, 0), 0) AS ini_acum
  FROM agg a WINDOW w_sec AS (PARTITION BY a.store_id, a.secao);
END;
$function$;
REVOKE ALL ON FUNCTION public.mix_atualizar_base() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mix_atualizar_base() TO service_role;

CREATE OR REPLACE FUNCTION public.mix_sugestoes(p_store_id uuid, p_presenca_min integer DEFAULT 35, p_top integer DEFAULT 40)
RETURNS TABLE (
  categoria text, prioridade integer, grupo text, ean text, descricao text, situacao text,
  lojas_vendem integer, lojas_base integer, presenca_pct numeric,
  lojas_curva_a integer, lojas_curva_ab integer,
  venda_mes_loja numeric, unid_mes_loja numeric, preco_medio numeric,
  margem_pct numeric, part_secao_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Acesso restrito ao administrador'; END IF;
  RETURN QUERY
  WITH alvo_venda AS (SELECT b.ean, b.secao, b.grupo FROM public.mix_base_12m b WHERE b.store_id = p_store_id),
  alvo_cad AS (
    SELECT DISTINCT ON (t.ean) t.ean, t.secao, t.grupo, t.cadastrado FROM (
      SELECT k.ean, k.secao, k.grupo, true AS cadastrado, 1 AS ord
      FROM public.mix_cadastro k WHERE k.store_id = p_store_id AND k.secao <> ''
      UNION ALL SELECT v.ean, v.secao, v.grupo, false, 2 FROM alvo_venda v WHERE v.secao <> ''
    ) t ORDER BY t.ean, t.ord
  ), base AS (SELECT b.* FROM public.mix_base_12m b WHERE b.store_id <> p_store_id AND b.dias >= 30),
  n_base AS (SELECT count(DISTINCT b.store_id)::int AS n FROM base b),
  voto AS (
    SELECT b.store_id, b.secao, b.grupo, c.secao AS secao_alvo, count(*) AS n
    FROM base b JOIN alvo_cad c ON c.ean = b.ean GROUP BY 1, 2, 3, 4
  ), depara AS (
    SELECT DISTINCT ON (v.store_id, v.secao, v.grupo) v.store_id, v.secao, v.grupo, v.secao_alvo
    FROM voto v WHERE v.n >= 3 ORDER BY v.store_id, v.secao, v.grupo, v.n DESC
  ), voto_g AS (
    SELECT b.store_id, b.secao, b.grupo, c.grupo AS grupo_alvo, count(*) AS n
    FROM base b JOIN alvo_cad c ON c.ean = b.ean WHERE c.grupo <> '' GROUP BY 1, 2, 3, 4
  ), depara_g AS (
    SELECT DISTINCT ON (v.store_id, v.secao, v.grupo) v.store_id, v.secao, v.grupo, v.grupo_alvo
    FROM voto_g v WHERE v.n >= 3 ORDER BY v.store_id, v.secao, v.grupo, v.n DESC
  ), cand AS (
    SELECT b.ean, (array_agg(b.descricao ORDER BY b.vendas DESC))[1] AS descricao,
           mode() WITHIN GROUP (ORDER BY d.secao_alvo) AS categoria_alvo,
           mode() WITHIN GROUP (ORDER BY g.grupo_alvo) AS grupo_alvo,
           mode() WITHIN GROUP (ORDER BY b.secao) AS secao_base,
           mode() WITHIN GROUP (ORDER BY b.grupo) AS grupo_base,
           count(*)::int AS lojas_vendem,
           (count(*) FILTER (WHERE b.ini_acum < 0.45))::int AS lojas_curva_a,
           (count(*) FILTER (WHERE b.ini_acum < 0.70))::int AS lojas_curva_ab,
           round(avg(b.vendas / b.dias * 30), 2) AS venda_mes_loja,
           round(avg(b.volume / b.dias * 30), 1) AS unid_mes_loja,
           round(sum(b.vendas) / nullif(sum(b.volume), 0), 2) AS preco_medio,
           round(sum(b.lucro) FILTER (WHERE b.lucro <> 0) / nullif(sum(b.vendas) FILTER (WHERE b.lucro <> 0), 0) * 100, 1) AS margem_pct,
           round(avg(b.vendas / nullif(b.venda_secao, 0)) * 100, 2) AS part_secao_pct
    FROM base b
    LEFT JOIN depara d ON d.store_id = b.store_id AND d.secao = b.secao AND d.grupo = b.grupo
    LEFT JOIN depara_g g ON g.store_id = b.store_id AND g.secao = b.secao AND g.grupo = b.grupo
    GROUP BY b.ean
  ), sug AS (
    SELECT coalesce(c.categoria_alvo, 'SEM DE-PARA: ' || c.secao_base) AS categoria,
           coalesce(c.grupo_alvo, c.grupo_base) AS grupo, c.ean, c.descricao,
           CASE WHEN k.cadastrado THEN 'Cadastrado, sem venda' ELSE 'Não cadastrado' END AS situacao,
           c.lojas_vendem, n.n AS lojas_base, round(c.lojas_vendem * 100.0 / n.n) AS presenca_pct,
           c.lojas_curva_a, c.lojas_curva_ab, c.venda_mes_loja, c.unid_mes_loja, c.preco_medio, c.margem_pct, c.part_secao_pct
    FROM cand c CROSS JOIN n_base n LEFT JOIN alvo_cad k ON k.ean = c.ean
    WHERE NOT EXISTS (SELECT 1 FROM alvo_venda v WHERE v.ean = c.ean)
      AND c.lojas_vendem >= greatest(3, ceil(n.n * p_presenca_min / 100.0))
      AND c.lojas_curva_ab >= least(3, n.n)
  ), ordenado AS (
    SELECT s.*, (row_number() OVER (PARTITION BY s.categoria ORDER BY s.lojas_curva_ab DESC, s.lojas_vendem DESC, s.venda_mes_loja DESC))::int AS prioridade FROM sug s
  )
  SELECT o.categoria, o.prioridade, o.grupo, o.ean, o.descricao, o.situacao,
         o.lojas_vendem, o.lojas_base, o.presenca_pct, o.lojas_curva_a, o.lojas_curva_ab,
         o.venda_mes_loja, o.unid_mes_loja, o.preco_medio, o.margem_pct, o.part_secao_pct
  FROM ordenado o WHERE o.prioridade <= p_top ORDER BY o.categoria, o.prioridade;
END;
$function$;
REVOKE ALL ON FUNCTION public.mix_sugestoes(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mix_sugestoes(uuid, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mix_base_resumo()
RETURNS TABLE (store_id uuid, loja text, dias integer, eans integer, vendas numeric, atualizado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Acesso restrito ao administrador'; END IF;
  RETURN QUERY
  SELECT b.store_id, s.name, max(b.dias)::int, count(*)::int, round(sum(b.vendas)), max(b.atualizado_em)
  FROM public.mix_base_12m b JOIN public.stores s ON s.id = b.store_id
  GROUP BY b.store_id, s.name ORDER BY s.name;
END;
$function$;
REVOKE ALL ON FUNCTION public.mix_base_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mix_base_resumo() TO authenticated, service_role;

SELECT cron.schedule('mix-atualizar-base-semanal', '30 13 * * 1', $cron$ SELECT public.mix_atualizar_base(); $cron$);