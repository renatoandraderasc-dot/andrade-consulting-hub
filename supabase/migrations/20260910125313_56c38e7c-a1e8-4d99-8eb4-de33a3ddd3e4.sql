do $$ begin
  create type jornada_cadencia as enum ('diaria','semanal','mensal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type jornada_status as enum ('a_fazer','em_andamento','concluida');
exception when duplicate_object then null; end $$;

create table if not exists public.jornada_perfis (
  id          uuid primary key default gen_random_uuid(),
  chave       text not null unique,
  nome        text not null,
  descricao   text,
  cor         text not null default '#CA3155',
  icone       text not null default 'ClipboardList',
  ordem       int  not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.jornada_perfil_usuario (
  user_id    uuid not null references auth.users(id) on delete cascade,
  perfil_id  uuid not null references public.jornada_perfis(id) on delete cascade,
  primary key (user_id, perfil_id)
);

create table if not exists public.jornada_templates (
  id            uuid primary key default gen_random_uuid(),
  perfil_id     uuid not null references public.jornada_perfis(id) on delete cascade,
  cadencia      jornada_cadencia not null,
  titulo        text not null,
  descricao     text,
  ordem         int  not null default 0,
  rota_hub      text,
  checklist_padrao jsonb not null default '[]'::jsonb,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ix_jornada_templates_perfil on public.jornada_templates(perfil_id);
create index if not exists ix_jornada_templates_cadencia on public.jornada_templates(cadencia) where ativo;

create table if not exists public.jornada_execucoes (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.jornada_templates(id) on delete cascade,
  store_id      uuid not null references public.stores(id) on delete cascade,
  periodo_ref   text not null,
  avulsa        boolean not null default false,
  status        jornada_status not null default 'a_fazer',
  responsavel   uuid references auth.users(id),
  iniciada_em   timestamptz,
  concluida_em  timestamptz,
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (template_id, store_id, periodo_ref)
);

create index if not exists ix_jornada_execucoes_store  on public.jornada_execucoes(store_id);
create index if not exists ix_jornada_execucoes_status on public.jornada_execucoes(status);
create index if not exists ix_jornada_execucoes_periodo on public.jornada_execucoes(periodo_ref);

create table if not exists public.jornada_checklist_itens (
  id           uuid primary key default gen_random_uuid(),
  execucao_id  uuid not null references public.jornada_execucoes(id) on delete cascade,
  texto        text not null,
  ordem        int  not null default 0,
  feito        boolean not null default false,
  feito_em     timestamptz,
  feito_por    uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists ix_jornada_checklist_execucao on public.jornada_checklist_itens(execucao_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jornada_perfis TO authenticated;
GRANT ALL ON public.jornada_perfis TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jornada_perfil_usuario TO authenticated;
GRANT ALL ON public.jornada_perfil_usuario TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jornada_templates TO authenticated;
GRANT ALL ON public.jornada_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jornada_execucoes TO authenticated;
GRANT ALL ON public.jornada_execucoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jornada_checklist_itens TO authenticated;
GRANT ALL ON public.jornada_checklist_itens TO service_role;

create or replace function public.jornada_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_jornada_templates_upd on public.jornada_templates;
create trigger trg_jornada_templates_upd
before update on public.jornada_templates
for each row execute function public.jornada_touch_updated_at();

drop trigger if exists trg_jornada_execucoes_upd on public.jornada_execucoes;
create trigger trg_jornada_execucoes_upd
before update on public.jornada_execucoes
for each row execute function public.jornada_touch_updated_at();

create or replace function public.jornada_materializar_checklist()
returns trigger language plpgsql set search_path = public as $$
declare
  v_checklist jsonb;
  item jsonb;
begin
  select checklist_padrao into v_checklist
    from public.jornada_templates where id = new.template_id;

  if v_checklist is null or jsonb_typeof(v_checklist) <> 'array' then
    return new;
  end if;

  for item in select * from jsonb_array_elements(v_checklist) loop
    insert into public.jornada_checklist_itens (execucao_id, texto, ordem)
    values (
      new.id,
      coalesce(item->>'texto', ''),
      coalesce((item->>'ordem')::int, 0)
    );
  end loop;

  return new;
end $$;

drop trigger if exists trg_jornada_materializar on public.jornada_execucoes;
create trigger trg_jornada_materializar
after insert on public.jornada_execucoes
for each row execute function public.jornada_materializar_checklist();

create or replace function public.jornada_atualizar_status_execucao()
returns trigger language plpgsql set search_path = public as $$
declare
  v_exec uuid;
  v_total int;
  v_feitos int;
begin
  v_exec := coalesce(new.execucao_id, old.execucao_id);

  select count(*), count(*) filter (where feito)
    into v_total, v_feitos
    from public.jornada_checklist_itens where execucao_id = v_exec;

  update public.jornada_execucoes
     set status = case
                    when v_total > 0 and v_feitos = v_total then 'concluida'::jornada_status
                    when v_feitos > 0 then 'em_andamento'::jornada_status
                    else 'a_fazer'::jornada_status
                  end,
         concluida_em = case
                          when v_total > 0 and v_feitos = v_total then now()
                          else null
                        end,
         iniciada_em = case
                         when iniciada_em is null and v_feitos > 0 then now()
                         else iniciada_em
                       end
   where id = v_exec;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_jornada_status_checklist on public.jornada_checklist_itens;
create trigger trg_jornada_status_checklist
after insert or update or delete on public.jornada_checklist_itens
for each row execute function public.jornada_atualizar_status_execucao();

alter table public.jornada_perfis            enable row level security;
alter table public.jornada_perfil_usuario    enable row level security;
alter table public.jornada_templates         enable row level security;
alter table public.jornada_execucoes         enable row level security;
alter table public.jornada_checklist_itens   enable row level security;

create or replace function public.jornada_tem_acesso_loja(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_store_access
     where user_id = auth.uid()
       and store_id = p_store
       and approved
  ) or public.has_role(auth.uid(), 'admin');
$$;

revoke all on function public.jornada_tem_acesso_loja(uuid) from public, anon;
grant execute on function public.jornada_tem_acesso_loja(uuid) to authenticated, service_role;

drop policy if exists jornada_perfis_sel on public.jornada_perfis;
create policy jornada_perfis_sel on public.jornada_perfis
for select to authenticated using (auth.uid() is not null);

drop policy if exists jornada_perfis_admin on public.jornada_perfis;
create policy jornada_perfis_admin on public.jornada_perfis
for all to authenticated using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists jornada_pu_self on public.jornada_perfil_usuario;
create policy jornada_pu_self on public.jornada_perfil_usuario
for all to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'))
with check (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

drop policy if exists jornada_tpl_sel on public.jornada_templates;
create policy jornada_tpl_sel on public.jornada_templates
for select to authenticated using (auth.uid() is not null);

drop policy if exists jornada_tpl_admin on public.jornada_templates;
create policy jornada_tpl_admin on public.jornada_templates
for all to authenticated using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists jornada_exec_sel on public.jornada_execucoes;
create policy jornada_exec_sel on public.jornada_execucoes
for select to authenticated using (public.jornada_tem_acesso_loja(store_id));

drop policy if exists jornada_exec_ins on public.jornada_execucoes;
create policy jornada_exec_ins on public.jornada_execucoes
for insert to authenticated with check (public.jornada_tem_acesso_loja(store_id));

drop policy if exists jornada_exec_upd on public.jornada_execucoes;
create policy jornada_exec_upd on public.jornada_execucoes
for update to authenticated using (public.jornada_tem_acesso_loja(store_id))
with check (public.jornada_tem_acesso_loja(store_id));

drop policy if exists jornada_exec_del on public.jornada_execucoes;
create policy jornada_exec_del on public.jornada_execucoes
for delete to authenticated using (public.has_role(auth.uid(),'admin'));

drop policy if exists jornada_ck_sel on public.jornada_checklist_itens;
create policy jornada_ck_sel on public.jornada_checklist_itens
for select to authenticated using (
  exists (select 1 from public.jornada_execucoes e
           where e.id = execucao_id
             and public.jornada_tem_acesso_loja(e.store_id))
);

drop policy if exists jornada_ck_ins on public.jornada_checklist_itens;
create policy jornada_ck_ins on public.jornada_checklist_itens
for insert to authenticated with check (
  exists (select 1 from public.jornada_execucoes e
           where e.id = execucao_id
             and public.jornada_tem_acesso_loja(e.store_id))
);

drop policy if exists jornada_ck_upd on public.jornada_checklist_itens;
create policy jornada_ck_upd on public.jornada_checklist_itens
for update to authenticated using (
  exists (select 1 from public.jornada_execucoes e
           where e.id = execucao_id
             and public.jornada_tem_acesso_loja(e.store_id))
)
with check (
  exists (select 1 from public.jornada_execucoes e
           where e.id = execucao_id
             and public.jornada_tem_acesso_loja(e.store_id))
);

drop policy if exists jornada_ck_del on public.jornada_checklist_itens;
create policy jornada_ck_del on public.jornada_checklist_itens
for delete to authenticated using (public.has_role(auth.uid(),'admin'));

insert into public.jornada_perfis (chave, nome, descricao, cor, icone, ordem) values
  ('comprador',    'Comprador (PIC)',        'Rotina do comprador: metas, compras, pricing e mix',    '#CA3155', 'ShoppingCart', 1),
  ('controller',   'Controller/Financeiro',  'Fechamento, DRE, evolução de resultado e conciliação',  '#0F766E', 'Calculator',   2),
  ('perc',         'Encarregado Perecíveis', 'Padaria, Açougue e Hortifruti: PIC do setor e produção','#EA580C', 'ChefHat',      3),
  ('gerente',      'Gerente de Loja',        'Visão da loja: vendas, cupons, ticket, PIC geral',      '#2563EB', 'Store',        4),
  ('proprietario', 'Proprietário',           'Visão da rede: diagnóstico, evolução e resultado',      '#7C3AED', 'Crown',        5)
on conflict (chave) do nothing;

with p as (select id from public.jornada_perfis where chave = 'comprador')
insert into public.jornada_templates (perfil_id, cadencia, titulo, descricao, ordem, rota_hub, checklist_padrao) values
((select id from p), 'diaria',  'Conferir PIC do dia', 'Bater realizado × meta por departamento e sinalizar risco', 1, '/pic',
  '[{"texto":"PADARIA — realizado × meta","ordem":1},
    {"texto":"AÇOUGUE — realizado × meta","ordem":2},
    {"texto":"HORTIFRUTI — realizado × meta","ordem":3},
    {"texto":"MERCEARIA — realizado × meta","ordem":4},
    {"texto":"Sinalizar setores abaixo de 80% no grupo","ordem":5}]'::jsonb),
((select id from p), 'diaria',  'Rupturas de curva A', 'Rodar Estoque Dinâmico e listar curva A com estoque baixo', 2, '/estoque-dinamico',
  '[{"texto":"Filtrar curva A + progresso ≥ 70%","ordem":1},
    {"texto":"Listar SKUs com estoque dinâmico ≤ 0","ordem":2},
    {"texto":"Abrir pedido de compra dos itens críticos","ordem":3}]'::jsonb),
((select id from p), 'semanal', 'Comparativo de preços entre lojas', 'Rodar módulo Comparar Preços e ajustar divergências', 1, '/repricing',
  '[{"texto":"Rodar comparativo do grupo","ordem":1},
    {"texto":"Exportar TOP 100 divergências","ordem":2},
    {"texto":"Aprovar/ajustar preços","ordem":3}]'::jsonb),
((select id from p), 'semanal', 'Pesquisa de concorrentes', 'Analisar coleta VTEX/concorrentes da semana', 2, '/produtos',
  '[{"texto":"Rever fila de coletas da semana","ordem":1},
    {"texto":"Identificar itens fora do mercado","ordem":2},
    {"texto":"Definir ajuste de encarte da semana","ordem":3}]'::jsonb),
((select id from p), 'mensal',  'Fechar PIC do mês e definir metas do próximo', 'Fechamento e planejamento', 1, '/admin-metas',
  '[{"texto":"Fechar PIC do mês (todos departamentos)","ordem":1},
    {"texto":"Gerar meta analítica do próximo mês","ordem":2},
    {"texto":"Distribuir meta diária respeitando dia da semana","ordem":3},
    {"texto":"Publicar metas para as lojas","ordem":4}]'::jsonb);

with p as (select id from public.jornada_perfis where chave = 'controller')
insert into public.jornada_templates (perfil_id, cadencia, titulo, descricao, ordem, rota_hub, checklist_padrao) values
((select id from p), 'diaria',  'Conferir sync VR das lojas', 'Todas as lojas atualizadas nas últimas 2 horas', 1, '/admin/conexoes-vr',
  '[{"texto":"Abrir indicador vr_sync_status","ordem":1},
    {"texto":"Marcar lojas atrasadas > 2h","ordem":2},
    {"texto":"Acionar responsável da loja atrasada","ordem":3}]'::jsonb),
((select id from p), 'diaria',  'Arrecadação do dia', 'Vendas − custo com imposto por loja', 2, '/dashboard',
  '[{"texto":"Conferir arrecadação vs. meta do dia","ordem":1},
    {"texto":"Sinalizar loja abaixo da meta","ordem":2}]'::jsonb),
((select id from p), 'semanal', 'Classificar lançamentos VR pendentes', 'Zerar a fila da aba Classificação VR', 1, '/controladoria',
  '[{"texto":"Abrir Classificação VR","ordem":1},
    {"texto":"Classificar tipos novos → conta do plano","ordem":2},
    {"texto":"Atualizar de-para vr_lancamento_map","ordem":3}]'::jsonb),
((select id from p), 'mensal',  'Fechar Controladoria / DRE', 'Fechamento mensal por regime de caixa', 1, '/controladoria',
  '[{"texto":"Reimportar período (edge importar-lancamentos-vr)","ordem":1},
    {"texto":"Zerar pendentes de Classificação VR","ordem":2},
    {"texto":"Bater DRE Cont Rede × extratos","ordem":3},
    {"texto":"Fechar mês (bloquear edição)","ordem":4}]'::jsonb),
((select id from p), 'mensal',  'Rodar Evolução de Resultado', 'Publicar 12 meses × benchmarks', 2, '/controladoria/evolucao',
  '[{"texto":"Revisar tipo→categoria (evolucao_tipo_map)","ordem":1},
    {"texto":"Preencher inputs manuais (impostos comp., margem %, receitas comerciais)","ordem":2},
    {"texto":"Publicar Resultados","ordem":3}]'::jsonb);

with p as (select id from public.jornada_perfis where chave = 'perc')
insert into public.jornada_templates (perfil_id, cadencia, titulo, descricao, ordem, rota_hub, checklist_padrao) values
((select id from p), 'diaria',  'PIC do meu setor', 'Realizado × meta do setor no dia', 1, '/pic',
  '[{"texto":"Meta do dia vs. realizado","ordem":1},
    {"texto":"Produção do dia lançada","ordem":2},
    {"texto":"Quebras registradas","ordem":3}]'::jsonb),
((select id from p), 'diaria',  'Rupturas do setor', 'Itens A do setor sem estoque', 2, '/estoque-dinamico',
  '[{"texto":"Listar A/B do setor com estoque ≤ 0","ordem":1},
    {"texto":"Solicitar reposição ao comprador","ordem":2}]'::jsonb),
((select id from p), 'semanal', 'Revisão de mix e ofertas', 'Alinhar ofertas da semana + mix do setor', 1, '/produtos',
  '[{"texto":"Rever ofertas ativas do setor","ordem":1},
    {"texto":"Sugerir itens novos / retirar itens sem giro","ordem":2}]'::jsonb),
((select id from p), 'semanal', 'Inventário rotativo do setor', 'Top 20 negativos do setor', 2, '/inventario-rotativo',
  '[{"texto":"Filtrar negativos por departamento","ordem":1},
    {"texto":"Imprimir folha de contagem","ordem":2},
    {"texto":"Lançar ajustes no ERP","ordem":3}]'::jsonb),
((select id from p), 'mensal',  'Fechamento do setor', 'PIC final, quebras e margem do mês', 1, '/pic',
  '[{"texto":"PIC final do setor","ordem":1},
    {"texto":"Total de quebras","ordem":2},
    {"texto":"Margem do setor","ordem":3},
    {"texto":"Plano de ação para o próximo mês","ordem":4}]'::jsonb);

with p as (select id from public.jornada_perfis where chave = 'gerente')
insert into public.jornada_templates (perfil_id, cadencia, titulo, descricao, ordem, rota_hub, checklist_padrao) values
((select id from p), 'diaria',  'Passar Dashboard da loja', 'Vendas, cupons, ticket médio, PIC geral', 1, '/dashboard',
  '[{"texto":"Vendas do dia × meta","ordem":1},
    {"texto":"Cupons e ticket médio","ordem":2},
    {"texto":"PIC geral por departamento","ordem":3},
    {"texto":"Alertar encarregado do pior setor","ordem":4}]'::jsonb),
((select id from p), 'diaria',  'Checklist operacional', 'Rotina de piso', 2, '/checklist',
  '[{"texto":"Limpeza áreas comuns","ordem":1},
    {"texto":"Uniforme e crachá","ordem":2},
    {"texto":"Precificação amostral","ordem":3},
    {"texto":"Frente de caixa / filas","ordem":4}]'::jsonb),
((select id from p), 'semanal', 'Reunião com encarregados', 'PIC de cada setor + ações da semana', 1, '/pic',
  '[{"texto":"PIC por setor","ordem":1},
    {"texto":"Ações da semana definidas","ordem":2},
    {"texto":"Responsáveis nomeados","ordem":3}]'::jsonb),
((select id from p), 'mensal',  'Fechar mês da loja', 'Todos setores fechados + meta próximo mês', 1, '/dashboard',
  '[{"texto":"Todos os setores com PIC fechado","ordem":1},
    {"texto":"Fechamento da controladoria confirmado","ordem":2},
    {"texto":"Meta do próximo mês publicada","ordem":3}]'::jsonb);

with p as (select id from public.jornada_perfis where chave = 'proprietario')
insert into public.jornada_templates (perfil_id, cadencia, titulo, descricao, ordem, rota_hub, checklist_padrao) values
((select id from p), 'semanal', 'Visão da Rede', 'Comparativo entre lojas da semana', 1, '/admin/rede',
  '[{"texto":"Faturamento e arrecadação por loja","ordem":1},
    {"texto":"Margem e ticket médio","ordem":2},
    {"texto":"Lojas fora da meta acumulada","ordem":3}]'::jsonb),
((select id from p), 'semanal', 'Aprovar despesas/pagamentos', 'Fila de aprovações da semana', 2, '/controladoria',
  '[{"texto":"Revisar lançamentos > R$ X","ordem":1},
    {"texto":"Aprovar / recusar","ordem":2}]'::jsonb),
((select id from p), 'mensal',  'Diagnóstico Mind7', 'Indicadores × benchmarks C/M/A', 1, '/diagnostico',
  '[{"texto":"Venda por m² e por colaborador","ordem":1},
    {"texto":"Participação promocional","ordem":2},
    {"texto":"Margem × benchmark","ordem":3}]'::jsonb),
((select id from p), 'mensal',  'Evolução de Resultado da rede', 'Lucro, margem, ponto de equilíbrio', 2, '/controladoria/evolucao',
  '[{"texto":"Bloco Gerando Lucro","ordem":1},
    {"texto":"Bloco Comprando Certo","ordem":2},
    {"texto":"Bloco Gerando Caixa","ordem":3},
    {"texto":"Ponto de equilíbrio (Faturamento e Margem)","ordem":4}]'::jsonb),
((select id from p), 'mensal',  'Reunião de resultados com a consultoria', 'Consolidar e planejar o mês seguinte', 3, null,
  '[{"texto":"Rede consolidada apresentada","ordem":1},
    {"texto":"Loja destaque e loja crítica","ordem":2},
    {"texto":"Plano de ação do mês seguinte","ordem":3}]'::jsonb);