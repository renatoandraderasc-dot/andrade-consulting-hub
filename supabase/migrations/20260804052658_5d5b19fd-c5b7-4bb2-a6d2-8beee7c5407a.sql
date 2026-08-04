CREATE TABLE public.meta_mix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  department text NOT NULL,
  ano int NOT NULL,
  mes int NOT NULL,
  base_trimestre int NOT NULL DEFAULT 0,
  pct_reducao numeric NOT NULL DEFAULT 0.15,
  meta_mix int NOT NULL DEFAULT 0,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, department, ano, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_mix TO authenticated;
GRANT ALL ON public.meta_mix TO service_role;

ALTER TABLE public.meta_mix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam meta_mix"
ON public.meta_mix FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuarios com acesso a loja leem meta_mix"
ON public.meta_mix FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_store_access a
  WHERE a.user_id = auth.uid() AND a.store_id = meta_mix.store_id AND a.approved
));

CREATE OR REPLACE FUNCTION public.gerar_meta_mix(
  p_store_id uuid,
  p_ano int,
  p_mes int,
  p_bases jsonb,
  p_pct numeric DEFAULT 0.15
)
RETURNS TABLE(departamentos int, total_meta int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  RETURN QUERY
  WITH entrada AS (
    SELECT
      upper(trim(e->>'department')) AS department,
      COALESCE((e->>'base_trimestre')::int, 0) AS base_trimestre,
      COALESCE((e->>'pct_reducao')::numeric, p_pct) AS pct_reducao
    FROM jsonb_array_elements(p_bases) e
    WHERE COALESCE(trim(e->>'department'), '') <> ''
  ), gravado AS (
    INSERT INTO public.meta_mix
      (store_id, department, ano, mes, base_trimestre, pct_reducao, meta_mix, gerado_em)
    SELECT p_store_id, department, p_ano, p_mes, base_trimestre, pct_reducao,
           GREATEST(ROUND(base_trimestre * (1 - pct_reducao))::int, 0)
         , now()
    FROM entrada
    ON CONFLICT (store_id, department, ano, mes) DO UPDATE SET
      base_trimestre = EXCLUDED.base_trimestre,
      pct_reducao    = EXCLUDED.pct_reducao,
      meta_mix       = EXCLUDED.meta_mix,
      gerado_em      = now()
    RETURNING meta_mix
  )
  SELECT COUNT(*)::int, COALESCE(SUM(meta_mix), 0)::int FROM gravado;
END; $$;