CREATE OR REPLACE FUNCTION public.usuario_ativo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR EXISTS (SELECT 1 FROM public.user_store_access a WHERE a.user_id = auth.uid() AND a.approved)
  );
$$;

-- Store-scoped tables
DROP POLICY IF EXISTS "Authenticated can view stores" ON public.stores;
CREATE POLICY "Users view accessible stores" ON public.stores FOR SELECT TO authenticated
  USING (public.tem_acesso_loja(id) OR public.is_supervisor(auth.uid()));

DROP POLICY IF EXISTS "auth read group members" ON public.store_group_members;
CREATE POLICY "Users read accessible group members" ON public.store_group_members FOR SELECT TO authenticated
  USING (public.tem_acesso_loja(group_store_id) OR public.tem_acesso_loja(member_store_id));

DROP POLICY IF EXISTS "Mapa legivel por autenticados" ON public.encarte_categoria_map;
CREATE POLICY "Mapa legivel por loja" ON public.encarte_categoria_map FOR SELECT TO authenticated
  USING (store_id IS NULL AND public.usuario_ativo() OR public.tem_acesso_loja(store_id));

DROP POLICY IF EXISTS "auth pode ver mapeamentos" ON public.vr_lancamento_map;
CREATE POLICY "Mapeamentos por loja" ON public.vr_lancamento_map FOR SELECT TO authenticated
  USING (store_id IS NULL AND public.usuario_ativo() OR public.tem_acesso_loja(store_id));

DROP POLICY IF EXISTS "Modelos legiveis por autenticados" ON public.encarte_modelo;
CREATE POLICY "Modelos legiveis por loja" ON public.encarte_modelo FOR SELECT TO authenticated
  USING (store_id IS NULL AND public.usuario_ativo() OR public.tem_acesso_loja(store_id));

DROP POLICY IF EXISTS "ler lojas do template" ON public.jornada_template_loja;
CREATE POLICY "ler lojas do template" ON public.jornada_template_loja FOR SELECT TO authenticated
  USING (public.tem_acesso_loja(store_id));

DROP POLICY IF EXISTS "jornada_perfis_sel" ON public.jornada_perfis;
CREATE POLICY "jornada_perfis_sel" ON public.jornada_perfis FOR SELECT TO authenticated
  USING (store_id IS NULL AND public.usuario_ativo() OR public.tem_acesso_loja(store_id));

DROP POLICY IF EXISTS "jornada_tpl_sel" ON public.jornada_templates;
CREATE POLICY "jornada_tpl_sel" ON public.jornada_templates FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.jornada_perfis p WHERE p.id = perfil_id
               AND (p.store_id IS NULL AND public.usuario_ativo() OR public.tem_acesso_loja(p.store_id)))
    OR EXISTS (SELECT 1 FROM public.jornada_template_loja tl WHERE tl.template_id = id AND public.tem_acesso_loja(tl.store_id))
  );

-- Shared reference data: only approved/active users
DROP POLICY IF EXISTS "Calendario legivel por autenticados" ON public.encarte_calendario;
CREATE POLICY "Calendario legivel por usuarios ativos" ON public.encarte_calendario FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "concorrentes_select" ON public.concorrentes;
CREATE POLICY "concorrentes_select" ON public.concorrentes FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "produtos read auth" ON public.produtos;
CREATE POLICY "produtos read ativos" ON public.produtos FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "Regras legiveis por autenticados" ON public.encarte_regra_faixa;
CREATE POLICY "Regras legiveis por usuarios ativos" ON public.encarte_regra_faixa FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "precos_concorrente_select" ON public.precos_concorrente;
CREATE POLICY "precos_concorrente_select" ON public.precos_concorrente FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "Authenticated can view questions" ON public.checklist_questions;
CREATE POLICY "Active users view questions" ON public.checklist_questions FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "Slots legiveis por autenticados" ON public.encarte_modelo_slot;
CREATE POLICY "Slots legiveis por usuarios ativos" ON public.encarte_modelo_slot FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "Categorias legiveis por autenticados" ON public.encarte_categoria;
CREATE POLICY "Categorias legiveis por usuarios ativos" ON public.encarte_categoria FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "Authenticated can view departments" ON public.departments;
CREATE POLICY "Active users view departments" ON public.departments FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "autenticado le deteccoes" ON public.plataformas_detectadas;
CREATE POLICY "usuario ativo le deteccoes" ON public.plataformas_detectadas FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "encartes read auth" ON public.encartes;
CREATE POLICY "encartes read ativos" ON public.encartes FOR SELECT TO authenticated USING (public.usuario_ativo());
DROP POLICY IF EXISTS "encarte_itens read auth" ON public.encarte_itens;
CREATE POLICY "encarte_itens read ativos" ON public.encarte_itens FOR SELECT TO authenticated USING (public.usuario_ativo());

DROP POLICY IF EXISTS "Authenticated can read imagens" ON storage.objects;
CREATE POLICY "Active users can read imagens" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'imagens' AND public.usuario_ativo());