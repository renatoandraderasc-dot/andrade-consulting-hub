alter table public.compras_meta
  add column if not exists venda_hist   numeric default 0,
  add column if not exists cmv_hist     numeric default 0,
  add column if not exists compra_hist  numeric default 0,
  add column if not exists cmv_pct      numeric default 0,
  add column if not exists excesso_hist numeric default 0;

create or replace function public.meta_venda_mes_dashboard(p_store_id uuid, p_ano int, p_mes int)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(meta_vendas), 0)
  from public.store_daily_metrics
  where store_id = p_store_id
    and department = 'LOJA'
    and date >= make_date(p_ano, p_mes, 1)
    and date <  (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
$$;

create or replace function public.gerar_metas_compra(p_store_id uuid, p_ano integer, p_mes integer)
 returns table(departamentos integer, meta_venda_total numeric, meta_compra_total numeric)
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_cfg  public.compras_config%rowtype;
  v_meta numeric;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'acesso negado';
  end if;

  select * into v_cfg from public.compras_config
   where store_id = p_store_id and ano = p_ano and mes = p_mes;
  if not found then
    raise exception 'Configuracao de compras nao encontrada para %/%', p_mes, p_ano;
  end if;

  v_meta := public.meta_venda_mes_dashboard(p_store_id, p_ano, p_mes);
  if v_meta <= 0 then v_meta := coalesce(v_cfg.meta_venda_mes, 0); end if;
  if v_meta <= 0 then
    raise exception 'Meta de venda do mês %/% não encontrada no Dashboard de Vendas', p_mes, p_ano;
  end if;

  update public.compras_config set meta_venda_mes = v_meta
   where store_id = p_store_id and ano = p_ano and mes = p_mes;

  return query
  with hist as (
    select h.departamento,
           sum(h.venda)  as venda,
           sum(h.cmv)    as cmv,
           sum(h.compra) as compra
    from public.compras_historico h
    where h.store_id = p_store_id
      and make_date(h.ano, h.mes, 1) between date_trunc('month', v_cfg.hist_inicio)::date
                                         and date_trunc('month', v_cfg.hist_fim)::date
    group by h.departamento
  ), tot as (
    select sum(venda) as venda_total from hist
  ), calc as (
    select h.departamento,
           h.venda, h.cmv, h.compra,
           h.venda / nullif(t.venda_total, 0)                          as participacao,
           (h.venda / nullif(t.venda_total, 0)) * v_meta               as meta_venda,
           h.cmv / nullif(h.venda, 0)                                  as cmv_pct,
           greatest(h.compra - h.cmv, 0)                               as excesso,
           - greatest(h.compra - h.cmv, 0) * coalesce(d.tx_recuperacao, 1)
             / nullif(v_cfg.parcelas_excesso, 0)                       as parcela,
           coalesce(d.tx_perdas, 0)                                    as tx_perdas
    from hist h
    cross join tot t
    left join public.compras_departamento d
           on d.store_id = p_store_id and d.departamento = h.departamento and d.ativo
  ), final as (
    select *,
           round(coalesce(cmv_pct,0) * coalesce(meta_venda,0)
                 + coalesce(parcela,0)
                 + tx_perdas * coalesce(meta_venda,0), 2) as meta_compra
    from calc
  ), gravado as (
    insert into public.compras_meta
      (store_id, departamento, ano, mes, participacao, meta_venda, meta_compra,
       parcela_excesso, compra_sobre_venda,
       venda_hist, cmv_hist, compra_hist, cmv_pct, excesso_hist, gerado_em)
    select p_store_id, departamento, p_ano, p_mes,
           round(coalesce(participacao,0), 6),
           round(coalesce(meta_venda,0), 2),
           coalesce(meta_compra,0),
           round(coalesce(parcela,0), 2),
           coalesce(round(coalesce(meta_compra,0) / nullif(meta_venda, 0), 4), 0),
           round(venda,2), round(cmv,2), round(compra,2),
           round(coalesce(cmv_pct,0), 6), round(excesso,2), now()
    from final
    on conflict (store_id, departamento, ano, mes) do update set
      participacao       = excluded.participacao,
      meta_venda         = excluded.meta_venda,
      meta_compra        = excluded.meta_compra,
      parcela_excesso    = excluded.parcela_excesso,
      compra_sobre_venda = excluded.compra_sobre_venda,
      venda_hist         = excluded.venda_hist,
      cmv_hist           = excluded.cmv_hist,
      compra_hist        = excluded.compra_hist,
      cmv_pct            = excluded.cmv_pct,
      excesso_hist       = excluded.excesso_hist,
      gerado_em          = now()
    returning meta_venda, meta_compra
  )
  select count(*)::int, round(coalesce(sum(meta_venda),0),2), round(coalesce(sum(meta_compra),0),2)
  from gravado;
end; $function$;