
-- Create stores table
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view stores"
  ON public.stores FOR SELECT
  TO authenticated
  USING (true);

-- Seed stores
INSERT INTO public.stores (name) VALUES
  ('Supermercado Duminduim'),
  ('Supermercado Maninho'),
  ('Supermercado Nascimento Osasco'),
  ('Supermercado Nascimento Embu'),
  ('Supermercado F.silva'),
  ('Supermercado Carvalho Matriz'),
  ('Supermercado Carvalho Filial'),
  ('Supermercado Sempre Bom'),
  ('Supermercado Mais Você'),
  ('Supermercado Santa Izabel');

-- Create user_store_access table
CREATE TABLE public.user_store_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);

ALTER TABLE public.user_store_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own store access"
  ON public.user_store_access FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own store access"
  ON public.user_store_access FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all store access"
  ON public.user_store_access FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update store access"
  ON public.user_store_access FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete store access"
  ON public.user_store_access FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Add store_id to checklist_submissions
ALTER TABLE public.checklist_submissions
  ADD COLUMN store_id uuid REFERENCES public.stores(id);
