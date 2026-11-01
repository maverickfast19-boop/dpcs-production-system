create table if not exists public.dpcs_machine_types (
  id uuid primary key default gen_random_uuid(),
  machine_type text not null unique,
  machine_count integer not null check (machine_count >= 0),
  process_group text not null default 'machining',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dpcs_machine_types enable row level security;

drop policy if exists "Authenticated users can read machine types"
  on public.dpcs_machine_types;
create policy "Authenticated users can read machine types"
  on public.dpcs_machine_types
  for select to authenticated using (true);

drop policy if exists "Authenticated users can insert machine types"
  on public.dpcs_machine_types;
create policy "Authenticated users can insert machine types"
  on public.dpcs_machine_types
  for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update machine types"
  on public.dpcs_machine_types;
create policy "Authenticated users can update machine types"
  on public.dpcs_machine_types
  for update to authenticated using (true) with check (true);

grant select, insert, update on public.dpcs_machine_types to authenticated;

insert into public.dpcs_machine_types (machine_type, machine_count, process_group)
values
  ('Cutting', 2, 'machining'),
  ('CNC Milling', 10, 'machining'),
  ('CNC Lathe', 4, 'machining'),
  ('Surface Grinding', 1, 'grinding'),
  ('Internal Grinding', 1, 'grinding'),
  ('External Grinding', 1, 'grinding'),
  ('Wirecut', 3, 'machining'),
  ('EDM', 2, 'machining'),
  ('Polishing', 3, 'finishing')
on conflict (machine_type) do update
set machine_count = excluded.machine_count,
    process_group = excluded.process_group,
    updated_at = now();
