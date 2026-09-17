create or replace function public.jornada_ressincronizar_checklist(p_template_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checklist jsonb;
  v_exec record;
  v_afetadas integer := 0;
begin
  select checklist_padrao into v_checklist
    from public.jornada_templates where id = p_template_id;

  if v_checklist is null or jsonb_typeof(v_checklist) <> 'array' then
    return 0;
  end if;

  for v_exec in
    select id from public.jornada_execucoes
     where template_id = p_template_id
       and status <> 'concluida'
  loop
    -- remove itens que sairam do padrao e ainda nao foram feitos
    delete from public.jornada_checklist_itens i
     where i.execucao_id = v_exec.id
       and i.feito = false
       and not exists (
         select 1 from jsonb_array_elements(v_checklist) e
          where coalesce(e->>'texto','') = i.texto
       );

    -- insere os novos itens do padrao
    insert into public.jornada_checklist_itens (execucao_id, texto, ordem)
    select v_exec.id, coalesce(e->>'texto',''), coalesce((e->>'ordem')::int, 0)
      from jsonb_array_elements(v_checklist) e
     where coalesce(e->>'texto','') <> ''
       and not exists (
         select 1 from public.jornada_checklist_itens i
          where i.execucao_id = v_exec.id
            and i.texto = coalesce(e->>'texto','')
       );

    -- mantem a ordem alinhada ao padrao
    update public.jornada_checklist_itens i
       set ordem = coalesce((e->>'ordem')::int, i.ordem)
      from jsonb_array_elements(v_checklist) e
     where i.execucao_id = v_exec.id
       and i.texto = coalesce(e->>'texto','');

    v_afetadas := v_afetadas + 1;
  end loop;

  return v_afetadas;
end;
$$;

grant execute on function public.jornada_ressincronizar_checklist(uuid) to authenticated;
grant execute on function public.jornada_ressincronizar_checklist(uuid) to service_role;