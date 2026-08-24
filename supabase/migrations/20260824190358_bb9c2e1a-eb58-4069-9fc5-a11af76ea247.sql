CREATE TABLE public.sites_concorrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  host text NOT NULL,
  plataforma text NOT NULL DEFAULT 'vtex' CHECK (plataforma IN ('vtex','opencart','regex_solutions','outra')),
  cep_referencia text NOT NULL DEFAULT '',
  region_id text,
  praca_esperada text,
  loja_externa_id text,
  sc integer NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  ultima_coleta timestamptz,
  status_ultima_coleta text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (host, cep_referencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites_concorrentes TO authenticated;
GRANT ALL ON public.sites_concorrentes TO service_role;
ALTER TABLE public.sites_concorrentes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cliente_concorrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  site_concorrente_id uuid NOT NULL REFERENCES public.sites_concorrentes(id) ON DELETE CASCADE,
  apelido text,
  prioridade integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, site_concorrente_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_concorrentes TO authenticated;
GRANT ALL ON public.cliente_concorrentes TO service_role;
ALTER TABLE public.cliente_concorrentes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_sites_concorrentes_updated BEFORE UPDATE ON public.sites_concorrentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cliente_concorrentes_updated BEFORE UPDATE ON public.cliente_concorrentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- helper: loja acessível pelo usuário
CREATE OR REPLACE FUNCTION public.tem_acesso_loja(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.user_store_access a
                  WHERE a.user_id = auth.uid() AND a.store_id = _store_id AND a.approved);
$$;

CREATE POLICY "sites admin total" ON public.sites_concorrentes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sites vinculados visiveis" ON public.sites_concorrentes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cliente_concorrentes v
    WHERE v.site_concorrente_id = sites_concorrentes.id
      AND public.tem_acesso_loja(v.store_id)
  ));

CREATE POLICY "sites solicitacao inativa" ON public.sites_concorrentes FOR INSERT TO authenticated
  WITH CHECK (ativo = false);

CREATE POLICY "vinculos admin total" ON public.cliente_concorrentes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vinculos da propria loja" ON public.cliente_concorrentes FOR SELECT TO authenticated
  USING (public.tem_acesso_loja(store_id));
CREATE POLICY "vinculos insert propria loja" ON public.cliente_concorrentes FOR INSERT TO authenticated
  WITH CHECK (public.tem_acesso_loja(store_id));
CREATE POLICY "vinculos update propria loja" ON public.cliente_concorrentes FOR UPDATE TO authenticated
  USING (public.tem_acesso_loja(store_id)) WITH CHECK (public.tem_acesso_loja(store_id));
CREATE POLICY "vinculos delete propria loja" ON public.cliente_concorrentes FOR DELETE TO authenticated
  USING (public.tem_acesso_loja(store_id));

-- migra cadastros existentes preservando o id
INSERT INTO public.sites_concorrentes
  (id, nome, host, plataforma, cep_referencia, region_id, praca_esperada, loja_externa_id, sc, ativo)
SELECT c.id, c.nome, c.host,
       CASE WHEN lower(coalesce(c.plataforma,'')) IN ('vtex','opencart','regex_solutions','outra')
            THEN lower(c.plataforma) ELSE 'outra' END,
       coalesce(c.cep_referencia,''), c.region_id, c.praca_esperada, c.seller_id,
       coalesce(c.sales_channel,1), c.ativo
FROM public.concorrentes c
ON CONFLICT (host, cep_referencia) DO NOTHING;

ALTER TABLE public.precos_concorrente
  ADD COLUMN site_concorrente_id uuid REFERENCES public.sites_concorrentes(id) ON DELETE CASCADE;
UPDATE public.precos_concorrente p SET site_concorrente_id = p.concorrente_id
 WHERE EXISTS (SELECT 1 FROM public.sites_concorrentes s WHERE s.id = p.concorrente_id);
ALTER TABLE public.precos_concorrente ALTER COLUMN concorrente_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_precos_site ON public.precos_concorrente(site_concorrente_id);

ALTER TABLE public.scrape_jobs
  ADD COLUMN site_concorrente_id uuid REFERENCES public.sites_concorrentes(id) ON DELETE SET NULL;
UPDATE public.scrape_jobs j SET site_concorrente_id = j.concorrente_id
 WHERE EXISTS (SELECT 1 FROM public.sites_concorrentes s WHERE s.id = j.concorrente_id);

-- atualiza status da ultima coleta a partir dos precos ja coletados
UPDATE public.sites_concorrentes s
   SET ultima_coleta = x.m, status_ultima_coleta = 'concluida'
  FROM (SELECT site_concorrente_id id, max(coletado_em) m FROM public.precos_concorrente
         WHERE site_concorrente_id IS NOT NULL GROUP BY 1) x
 WHERE x.id = s.id;