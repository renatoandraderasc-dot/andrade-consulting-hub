CREATE TABLE public.tv_telas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tv_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tela_id uuid NOT NULL REFERENCES public.tv_telas(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  tipo text NOT NULL DEFAULT 'foto',
  titulo text,
  midia_path text,
  duracao_seg integer NOT NULL DEFAULT 15,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tv_itens_tela_idx ON public.tv_itens(tela_id, ordem);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tv_telas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tv_itens TO authenticated;
GRANT ALL ON public.tv_telas TO service_role;
GRANT ALL ON public.tv_itens TO service_role;
ALTER TABLE public.tv_telas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tv_telas ler" ON public.tv_telas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.tem_acesso_loja(store_id));
CREATE POLICY "tv_telas admin" ON public.tv_telas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "tv_itens ler" ON public.tv_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tv_telas t WHERE t.id = tela_id AND (public.has_role(auth.uid(),'admin') OR public.tem_acesso_loja(t.store_id))));
CREATE POLICY "tv_itens admin" ON public.tv_itens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "tv_midia ler" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'tv-midia');
CREATE POLICY "tv_midia admin ins" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tv-midia' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "tv_midia admin del" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'tv-midia' AND public.has_role(auth.uid(),'admin'));