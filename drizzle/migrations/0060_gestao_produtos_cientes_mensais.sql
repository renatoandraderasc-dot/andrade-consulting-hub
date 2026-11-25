CREATE TABLE public.produtos_gestao_cientes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 mes date NOT NULL CHECK (extract(day FROM mes) = 1),
 produto_chave text NOT NULL CHECK (length(trim(produto_chave)) > 0),
 codigo text NOT NULL DEFAULT '',
 ean text NOT NULL DEFAULT '',
 descricao text NOT NULL,
 categoria text NOT NULL DEFAULT '',
 tipo text NOT NULL CHECK (tipo IN ('sem_giro', 'em_queda')),
 user_id uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (store_id, mes, produto_chave)
);
GRANT SELECT, INSERT, DELETE ON public.produtos_gestao_cientes TO authenticated;
GRANT ALL ON public.produtos_gestao_cientes TO service_role;
ALTER TABLE public.produtos_gestao_cientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cientes_leitura ON public.produtos_gestao_cientes FOR SELECT TO authenticated USING (public.usuario_ativo() AND public.tem_acesso_loja(store_id));
CREATE POLICY cientes_marcar ON public.produtos_gestao_cientes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.usuario_ativo() AND public.tem_acesso_loja(store_id));
CREATE POLICY cientes_desfazer ON public.produtos_gestao_cientes FOR DELETE TO authenticated USING (public.usuario_ativo() AND public.tem_acesso_loja(store_id));
CREATE POLICY demo_production_isolation ON public.produtos_gestao_cientes AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_demo_account()) WITH CHECK (NOT public.is_demo_account());