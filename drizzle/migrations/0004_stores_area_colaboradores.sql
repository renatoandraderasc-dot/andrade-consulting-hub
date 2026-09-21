alter table public.stores
  add column if not exists area_m2 numeric not null default 500,
  add column if not exists colaboradores integer not null default 25;
update public.stores set area_m2 = 500 where area_m2 is null;
update public.stores set colaboradores = 25 where colaboradores is null;