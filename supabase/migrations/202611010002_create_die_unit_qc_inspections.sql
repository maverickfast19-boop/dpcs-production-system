create table if not exists public.die_unit_qc_inspections (
  id uuid primary key default gen_random_uuid(),
  die_unit_id uuid not null references public.die_units(id) on delete cascade,
  result text not null check (result in ('good', 'reject')),
  inspector_name text not null,
  findings text,
  notes text,
  head_decision text check (head_decision in ('repair', 'scrap')),
  decision_by text,
  decision_notes text,
  decision_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_die_unit_qc_inspections_unit_created
  on public.die_unit_qc_inspections(die_unit_id, created_at desc);

create index if not exists idx_die_unit_qc_inspections_reject
  on public.die_unit_qc_inspections(result, created_at desc);

alter table public.die_unit_qc_inspections enable row level security;

drop policy if exists "Authenticated users can read die QC inspections"
  on public.die_unit_qc_inspections;
create policy "Authenticated users can read die QC inspections"
  on public.die_unit_qc_inspections
  for select to authenticated using (true);

drop policy if exists "Authenticated users can insert die QC inspections"
  on public.die_unit_qc_inspections;
create policy "Authenticated users can insert die QC inspections"
  on public.die_unit_qc_inspections
  for insert to authenticated with check (true);

grant select, insert on public.die_unit_qc_inspections to authenticated;
