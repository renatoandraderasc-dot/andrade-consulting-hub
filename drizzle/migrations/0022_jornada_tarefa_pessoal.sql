ALTER TABLE public.jornada_templates ADD COLUMN IF NOT EXISTS criado_por uuid;

DROP POLICY IF EXISTS jornada_tpl_sel ON public.jornada_templates;
CREATE POLICY jornada_tpl_sel ON public.jornada_templates FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (criado_por IS NULL OR criado_por = auth.uid())
    AND (
      EXISTS (SELECT 1 FROM jornada_perfis p WHERE p.id = jornada_templates.perfil_id
              AND ((p.store_id IS NULL AND usuario_ativo()) OR tem_acesso_loja(p.store_id)))
      OR EXISTS (SELECT 1 FROM jornada_template_loja tl WHERE tl.template_id = jornada_templates.id AND tem_acesso_loja(tl.store_id))
    )
  )
);

CREATE OR REPLACE FUNCTION public.jornada_criar_tarefa_pessoal(
  p_store uuid, p_perfil uuid, p_titulo text, p_descricao text,
  p_cadencia jornada_cadencia, p_checklist text[], p_periodo text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_tpl uuid; v_exec uuid; v_ck jsonb;
begin
  if auth.uid() is null or not jornada_tem_acesso_loja(p_store) then
    raise exception 'sem acesso a esta loja';
  end if;
  if coalesce(trim(p_titulo),'') = '' then raise exception 'titulo obrigatorio'; end if;
  if not exists (select 1 from jornada_perfis where id = p_perfil and ativo and (store_id is null or store_id = p_store)) then
    raise exception 'perfil invalido';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('texto', t, 'ordem', o)), '[]'::jsonb) into v_ck
    from unnest(coalesce(p_checklist, '{}')) with ordinality as x(t, o) where trim(t) <> '';
  insert into jornada_templates (perfil_id, cadencia, titulo, descricao, checklist_padrao, criado_por, ordem)
    values (p_perfil, p_cadencia, trim(p_titulo), nullif(trim(p_descricao),''), v_ck, auth.uid(), 999)
    returning id into v_tpl;
  insert into jornada_template_loja (template_id, store_id) values (v_tpl, p_store);
  insert into jornada_execucoes (template_id, store_id, periodo_ref, responsavel)
    values (v_tpl, p_store, p_periodo, auth.uid()) returning id into v_exec;
  return v_tpl;
end $$;
REVOKE ALL ON FUNCTION public.jornada_criar_tarefa_pessoal(uuid,uuid,text,text,jornada_cadencia,text[],text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.jornada_criar_tarefa_pessoal(uuid,uuid,text,text,jornada_cadencia,text[],text) TO authenticated;