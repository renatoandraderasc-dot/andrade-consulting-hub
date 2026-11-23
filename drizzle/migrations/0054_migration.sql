CREATE TABLE public.whatsapp_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text NOT NULL,
  grupo text,
  store_id uuid,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  mensagem text NOT NULL DEFAULT '',
  imagens text[] NOT NULL DEFAULT '{}',
  contato_ids uuid[] NOT NULL DEFAULT '{}',
  agendado_para timestamptz,
  status text NOT NULL DEFAULT 'rascunho',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.whatsapp_campanhas(id) ON DELETE CASCADE,
  contato_id uuid,
  telefone text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_contatos, public.whatsapp_campanhas, public.whatsapp_envios TO authenticated;
GRANT ALL ON public.whatsapp_contatos, public.whatsapp_campanhas, public.whatsapp_envios TO service_role;
ALTER TABLE public.whatsapp_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON public.whatsapp_contatos FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admin_all" ON public.whatsapp_campanhas FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admin_all" ON public.whatsapp_envios FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "demo_production_isolation" ON public.whatsapp_contatos AS RESTRICTIVE FOR ALL TO authenticated USING (NOT is_demo_account()) WITH CHECK (NOT is_demo_account());
CREATE POLICY "demo_production_isolation" ON public.whatsapp_campanhas AS RESTRICTIVE FOR ALL TO authenticated USING (NOT is_demo_account()) WITH CHECK (NOT is_demo_account());
CREATE POLICY "demo_production_isolation" ON public.whatsapp_envios AS RESTRICTIVE FOR ALL TO authenticated USING (NOT is_demo_account()) WITH CHECK (NOT is_demo_account());