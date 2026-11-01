create table if not exists public.die_unit_process_steps (
  id uuid primary key default gen_random_uuid(),
  die_unit_id uuid not null references public.die_units(id) on delete cascade,
  process_code text not null check (process_code in ('machining','assembly','fitting','trial')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','hold')),
  operator_name text,
  machine_name text,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (die_unit_id, process_code)
);

create index if not exists idx_die_unit_process_steps_unit
  on public.die_unit_process_steps(die_unit_id);

alter table public.die_unit_process_steps enable row level security;

drop policy if exists "Authenticated users can read die process steps" on public.die_unit_process_steps;
create policy "Authenticated users can read die process steps"
  on public.die_unit_process_steps for select to authenticated using (true);

drop policy if exists "Authenticated users can insert die process steps" on public.die_unit_process_steps;
create policy "Authenticated users can insert die process steps"
  on public.die_unit_process_steps for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update die process steps" on public.die_unit_process_steps;
create policy "Authenticated users can update die process steps"
  on public.die_unit_process_steps for update to authenticated using (true) with check (true);

grant select, insert, update on public.die_unit_process_steps to authenticated;
