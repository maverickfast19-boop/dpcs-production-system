create table if not exists public.dpcs_machines (
  id uuid primary key default gen_random_uuid(),
  machine_type_id uuid not null references public.dpcs_machine_types(id) on delete restrict,
  machine_code text not null unique,
  machine_status text not null default 'unverified'
    check (machine_status in ('unverified', 'available', 'in_use', 'maintenance', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dpcs_machines_type
  on public.dpcs_machines(machine_type_id);
create index if not exists idx_dpcs_machines_status
  on public.dpcs_machines(machine_status);

alter table public.dpcs_machines enable row level security;

drop policy if exists "Authenticated users can read individual machines"
  on public.dpcs_machines;
create policy "Authenticated users can read individual machines"
  on public.dpcs_machines
  for select to authenticated using (true);

drop policy if exists "Authenticated users can update individual machines"
  on public.dpcs_machines;
create policy "Authenticated users can update individual machines"
  on public.dpcs_machines
  for update to authenticated using (true) with check (true);

grant select, update on public.dpcs_machines to authenticated;

with machine_seed(machine_type, code_prefix, quantity) as (
  values
    ('Cutting', 'CUT', 2),
    ('CNC Milling', 'CNC-MILL', 10),
    ('CNC Lathe', 'CNC-LATHE', 4),
    ('Surface Grinding', 'SURF-GRIND', 1),
    ('Internal Grinding', 'INT-GRIND', 1),
    ('External Grinding', 'EXT-GRIND', 1),
    ('Wirecut', 'WIRECUT', 3),
    ('EDM', 'EDM', 2),
    ('Polishing', 'POLISH', 3)
)
insert into public.dpcs_machines (machine_type_id, machine_code)
select
  mt.id,
  seed.code_prefix || '-' || lpad(series.unit_number::text, 2, '0')
from machine_seed seed
join public.dpcs_machine_types mt on mt.machine_type = seed.machine_type
cross join lateral generate_series(1, seed.quantity) as series(unit_number)
on conflict (machine_code) do nothing;
