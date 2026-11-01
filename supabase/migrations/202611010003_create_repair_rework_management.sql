create table if not exists public.die_unit_repair_work_orders (
  id uuid primary key default gen_random_uuid(),
  qc_inspection_id uuid not null unique
    references public.die_unit_qc_inspections(id) on delete restrict,
  die_unit_id uuid not null
    references public.die_units(id) on delete restrict,
  repair_scope text not null,
  assigned_technician text,
  target_completion_date date,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'hold')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_repair_work_orders_status_created
  on public.die_unit_repair_work_orders(status, created_at desc);

create index if not exists idx_repair_work_orders_unit
  on public.die_unit_repair_work_orders(die_unit_id, created_at desc);

create table if not exists public.die_unit_repair_actions (
  id uuid primary key default gen_random_uuid(),
  repair_work_order_id uuid not null
    references public.die_unit_repair_work_orders(id) on delete cascade,
  action_description text not null,
  parts_used text,
  performed_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_repair_actions_work_order
  on public.die_unit_repair_actions(repair_work_order_id, created_at desc);

alter table public.die_unit_repair_work_orders enable row level security;
alter table public.die_unit_repair_actions enable row level security;

drop policy if exists "Authenticated users can read repair work orders"
  on public.die_unit_repair_work_orders;
create policy "Authenticated users can read repair work orders"
  on public.die_unit_repair_work_orders
  for select to authenticated using (true);

drop policy if exists "Authenticated users can update repair work orders"
  on public.die_unit_repair_work_orders;
create policy "Authenticated users can update repair work orders"
  on public.die_unit_repair_work_orders
  for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can read repair actions"
  on public.die_unit_repair_actions;
create policy "Authenticated users can read repair actions"
  on public.die_unit_repair_actions
  for select to authenticated using (true);

drop policy if exists "Authenticated users can insert repair actions"
  on public.die_unit_repair_actions;
create policy "Authenticated users can insert repair actions"
  on public.die_unit_repair_actions
  for insert to authenticated with check (true);

grant select, update on public.die_unit_repair_work_orders to authenticated;
grant select, insert on public.die_unit_repair_actions to authenticated;

create or replace function public.create_repair_work_order_for_qc_repair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.head_decision = 'repair'
     and old.head_decision is distinct from 'repair' then
    insert into public.die_unit_repair_work_orders (
      qc_inspection_id,
      die_unit_id,
      repair_scope
    )
    values (
      new.id,
      new.die_unit_id,
      coalesce(nullif(trim(new.findings), ''), 'Perbaikan sesuai hasil pemeriksaan QC')
    )
    on conflict (qc_inspection_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_create_repair_work_order_after_qc_decision
  on public.die_unit_qc_inspections;

create trigger trg_create_repair_work_order_after_qc_decision
after update of head_decision on public.die_unit_qc_inspections
for each row
execute function public.create_repair_work_order_for_qc_repair();

-- Backfill only genuine QC REJECT inspections already decided as REPAIR.
insert into public.die_unit_repair_work_orders (
  qc_inspection_id,
  die_unit_id,
  repair_scope
)
select
  q.id,
  q.die_unit_id,
  coalesce(nullif(trim(q.findings), ''), 'Perbaikan sesuai hasil pemeriksaan QC')
from public.die_unit_qc_inspections q
where q.result = 'reject'
  and q.head_decision = 'repair'
on conflict (qc_inspection_id) do nothing;
