create or replace function public.fn_diagnostico_sistema()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_conn jsonb;
  v_lentas jsonb := '[]'::jsonb;
  v_ativas jsonb := '[]'::jsonb;
  v_tabelas jsonb := '[]'::jsonb;
  v_geral jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'acesso negado';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'ativas', count(*) filter (where state = 'active'),
    'ociosas', count(*) filter (where state = 'idle'),
    'presas', count(*) filter (where state = 'idle in transaction'),
    'maximo', (select setting::int from pg_settings where name = 'max_connections')
  ) into v_conn
  from pg_stat_activity where datname = current_database();

  begin
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_lentas
    from (
      select jsonb_build_object(
        'consulta', left(query, 300),
        'chamadas', calls,
        'media_ms', round(mean_exec_time::numeric, 1),
        'total_ms', round(total_exec_time::numeric, 1),
        'max_ms', round(max_exec_time::numeric, 1)
      ) as x
      from pg_stat_statements
      where query !~* '^(set|show|begin|commit|rollback)'
      order by total_exec_time desc
      limit 15
    ) s;
  exception when others then
    v_lentas := '[]'::jsonb;
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'consulta', left(query, 300),
    'segundos', round(extract(epoch from (now() - query_start))::numeric, 1),
    'estado', state
  ) order by query_start), '[]'::jsonb) into v_ativas
  from pg_stat_activity
  where datname = current_database()
    and state <> 'idle'
    and pid <> pg_backend_pid()
    and query_start < now() - interval '2 seconds';

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_tabelas
  from (
    select jsonb_build_object(
      'tabela', relname,
      'tamanho_mb', round((pg_total_relation_size(relid) / 1048576.0)::numeric, 1),
      'linhas', n_live_tup,
      'leituras_sequenciais', seq_scan,
      'leituras_indice', idx_scan
    ) as t
    from pg_stat_user_tables
    where schemaname = 'public'
    order by pg_total_relation_size(relid) desc
    limit 20
  ) s2;

  select jsonb_build_object(
    'banco_mb', round((pg_database_size(current_database()) / 1048576.0)::numeric, 1),
    'cache_hit_pct', (
      select round((100 * sum(blks_hit)::numeric / nullif(sum(blks_hit) + sum(blks_read), 0)), 1)
      from pg_stat_database where datname = current_database()
    ),
    'deadlocks', (select deadlocks from pg_stat_database where datname = current_database()),
    'rollbacks', (select xact_rollback from pg_stat_database where datname = current_database())
  ) into v_geral;

  return jsonb_build_object(
    'em', now(),
    'conexoes', v_conn,
    'geral', v_geral,
    'consultas_lentas', v_lentas,
    'consultas_em_execucao', v_ativas,
    'tabelas', v_tabelas
  );
end;
$$;

revoke all on function public.fn_diagnostico_sistema() from public;
grant execute on function public.fn_diagnostico_sistema() to authenticated;
grant execute on function public.fn_diagnostico_sistema() to service_role;