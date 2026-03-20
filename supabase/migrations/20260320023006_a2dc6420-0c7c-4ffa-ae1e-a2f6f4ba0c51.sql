
CREATE TABLE public.lancamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  competencia_mes INTEGER NOT NULL,
  competencia_ano INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  subtipo TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC NOT NULL DEFAULT 0,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all lancamentos"
  ON public.lancamentos FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view lancamentos of their stores"
  ON public.lancamentos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_store_access usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = lancamentos.store_id
        AND usa.approved = true
    )
  );

CREATE POLICY "Users can insert lancamentos for their stores"
  ON public.lancamentos FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.user_store_access usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = lancamentos.store_id
        AND usa.approved = true
    )
  );

CREATE POLICY "Users can update own lancamentos"
  ON public.lancamentos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lancamentos"
  ON public.lancamentos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
