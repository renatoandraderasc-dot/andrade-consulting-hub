-- ============================================================
-- MODULO GERENCIAMENTO DE COMPRAS
-- Reproduz o modelo da planilha: historico -> meta de compra por
-- departamento -> acompanhamento semanal do realizado.
-- Seguro rodar mais de uma vez.
-- ============================================================

-- 1. Parametros do ciclo de compras (equivale a aba "Cadastro_")
CREATE TABLE IF NOT EXISTS public.compras_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  ano int NOT NULL,
  mes int NOT NULL,
  meta_venda_mes numeric NOT NULL DEFAULT 0,
  parcelas_excesso int NOT NULL DEFAULT 6,
  hist_inicio date NOT NULL,
  hist_fim date NOT NULL,
  UNIQUE (store_id, ano, mes)
);
ALTER TABLE public.compras_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage compras config" ON public.compras_config;
CREATE POLICY "Admins manage compras config" ON public.compras_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Store users view compras config" ON public.compras_config;
CREATE POLICY "Store users view compras config" ON public.compras_config
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_store_access usa
                 WHERE usa.store_id = compras_config.store_id
                   AND usa.user_id = auth.uid() AND usa.approved));

-- 2. Taxas por departamento (perdas e recuperacao do excesso)
CREATE TABLE IF NOT EXISTS public.compras_departamento (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  departamento text NOT NULL,
  tx_perdas numeric NOT NULL DEFAULT 0,
  tx_recuperacao numeric NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE (store_id, departamento)
);
ALTER TABLE public.compras_departamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage compras depto" ON public.compras_departamento;
CREATE POLICY "Admins manage compras depto" ON public.compras_departamento
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Store users view compras depto" ON public.compras_departamento;
CREATE POLICY "Store users view compras depto" ON public.compras_departamento
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_store_access usa
                 WHERE usa.store_id = compras_departamento.store_id
                   AND usa.user_id = auth.uid() AND usa.approved));

-- 3. Historico consolidado por departamento (importado do VR)
CREATE TABLE IF NOT EXISTS public.compras_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  departamento text NOT NULL,
  ano int NOT NULL,
  mes int NOT NULL,
  venda numeric NOT NULL DEFAULT 0,
  cmv numeric NOT NULL DEFAULT 0,
  compra numeric NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, departamento, ano, mes)
);
ALTER TABLE public.compras_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage compras historico" ON public.compras_historico;
CREATE POLICY "Admins manage compras historico" ON public.compras_historico
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Store users view compras historico" ON public.compras_historico;
CREATE POLICY "Store users view compras historico" ON public.compras_historico
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_store_access usa
                 WHERE usa.store_id = compras_historico.store_id
                   AND usa.user_id = auth.uid() AND usa.approved));

-- 4. Metas de compra calculadas
CREATE TABLE IF NOT EXISTS public.compras_meta (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  departamento text NOT NULL,
  ano int NOT NULL,
  mes int NOT NULL,
  participacao numeric NOT NULL DEFAULT 0,
  meta_venda numeric NOT NULL DEFAULT 0,
  meta_compra numeric NOT NULL DEFAULT 0,
  parcela_excesso numeric NOT NULL DEFAULT 0,
  compra_sobre_venda numeric NOT NULL DEFAULT 0,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, departamento, ano, mes)
);
ALTER TABLE public.compras_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage compras meta" ON public.compras_meta;
CREATE POLICY "Admins manage compras meta" ON public.compras_meta
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Store users view compras meta" ON public.compras_meta;
CREATE POLICY "Store users view compras meta" ON public.compras_meta
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_store_access usa
                 WHERE usa.store_id = compras_meta.store_id
                   AND usa.user_id = auth.uid() AND usa.approved));

-- 5. GERAR METAS DE COMPRA
CREATE OR REPLACE FUNCTION public.gerar_metas_compra(
  p_store_id uuid, p_ano int, p_mes int
) RETURNS TABLE (departamentos int, meta_venda_total numeric, meta_compra_total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.compras_config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.compras_config
   WHERE store_id = p_store_id AND ano = p_ano AND mes = p_mes;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuracao de compras nao encontrada para %/%', p_mes, p_ano;
  END IF;

  RETURN QUERY
  WITH hist AS (
    SELECT h.departamento,
           SUM(h.venda)  AS venda,
           SUM(h.cmv)    AS cmv,
           SUM(h.compra) AS compra
    FROM public.compras_historico h
    WHERE h.store_id = p_store_id
      AND make_date(h.ano, h.mes, 1) BETWEEN date_trunc('month', v_cfg.hist_inicio)::date
                                         AND date_trunc('month', v_cfg.hist_fim)::date
    GROUP BY h.departamento
  ), tot AS (
    SELECT SUM(venda) AS venda_total FROM hist
  ), calc AS (
    SELECT h.departamento,
           h.venda / NULLIF(t.venda_total, 0)                        AS participacao,
           (h.venda / NULLIF(t.venda_total, 0)) * v_cfg.meta_venda_mes AS meta_venda,
           h.cmv / NULLIF(h.venda, 0)                                AS cmv_pct,
           (h.cmv - h.compra) * COALESCE(d.tx_recuperacao, 1)
             / NULLIF(v_cfg.parcelas_excesso, 0)                     AS parcela,
           COALESCE(d.tx_perdas, 0)                                  AS tx_perdas
    FROM hist h
    CROSS JOIN tot t
    LEFT JOIN public.compras_departamento d
           ON d.store_id = p_store_id AND d.departamento = h.departamento
                                      AND d.ativo
  ), final AS (
    SELECT departamento, participacao, meta_venda, parcela,
           ROUND(COALESCE(cmv_pct,0) * meta_venda + COALESCE(parcela,0)
                 + tx_perdas * meta_venda, 2) AS meta_compra
    FROM calc
  ), gravado AS (
    INSERT INTO public.compras_meta
      (store_id, departamento, ano, mes, participacao, meta_venda, meta_compra,
       parcela_excesso, compra_sobre_venda, gerado_em)
    SELECT p_store_id, departamento, p_ano, p_mes,
           ROUND(COALESCE(participacao,0), 6),
           ROUND(COALESCE(meta_venda,0), 2),
           COALESCE(meta_compra,0),
           ROUND(COALESCE(parcela,0), 2),
           ROUND(COALESCE(meta_compra,0) / NULLIF(meta_venda, 0), 4),
           now()
    FROM final
    ON CONFLICT (store_id, departamento, ano, mes) DO UPDATE SET
      participacao       = EXCLUDED.participacao,
      meta_venda         = EXCLUDED.meta_venda,
      meta_compra        = EXCLUDED.meta_compra,
      parcela_excesso    = EXCLUDED.parcela_excesso,
      compra_sobre_venda = EXCLUDED.compra_sobre_venda,
      gerado_em          = now()
    RETURNING meta_venda, meta_compra
  )
  SELECT COUNT(*)::int, ROUND(COALESCE(SUM(meta_venda),0),2), ROUND(COALESCE(SUM(meta_compra),0),2)
  FROM gravado;
END; $$;

GRANT EXECUTE ON FUNCTION public.gerar_metas_compra(uuid, int, int) TO authenticated;