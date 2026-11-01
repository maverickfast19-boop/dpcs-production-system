create table if not exists public.dpcs_machine_assignments (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.dpcs_machines(id) on delete restrict,
  die_unit_id uuid not null references public.die_units(id) on delete restrict,
  process_code text not null check (process_code in ('machining', 'assembly', 'fitting', 'trial')),
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  assigned_by uuid default auth.uid(),
  released_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  constraint dpcs_machine_assignment_release_check
    check (released_at is null or released_at >= assigned_at)
);

create unique index if not exists uq_dpcs_machine_one_active_assignment
  on public.dpcs_machine_assignments(machine_id)
  where released_at is null;

create index if not exists idx_dpcs_machine_assignments_die_unit
  on public.dpcs_machine_assignments(die_unit_id, assigned_at desc);

alter table public.dpcs_machine_assignments enable row level security;

drop policy if exists "Authenticated users can read machine assignments"
  on public.dpcs_machine_assignments;
create policy "Authenticated users can read machine assignments"
  on public.dpcs_machine_assignments
  for select to authenticated using (true);

grant select on public.dpcs_machine_assignments to authenticated;

create or replace function public.dpcs_assign_machine(
  p_machine_id uuid,
  p_die_unit_id uuid,
  p_process_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_assignment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Login diperlukan untuk menugaskan mesin.';
  end if;

  if p_process_code not in ('machining', 'assembly', 'fitting', 'trial') then
    raise exception 'Proses tidak valid.';
  end if;

  select machine_status into v_status
  from public.dpcs_machines
  where id = p_machine_id
  for update;

  if not found then
    raise exception 'Mesin tidak ditemukan.';
  end if;

  if v_status <> 'available' then
    raise exception 'Mesin harus berstatus Tersedia sebelum ditugaskan.';
  end if;

  if exists (
    select 1 from public.dpcs_machine_assignments
    where machine_id = p_machine_id and released_at is null
  ) then
    raise exception 'Mesin masih memiliki penugasan aktif.';
  end if;

  insert into public.dpcs_machine_assignments
    (machine_id, die_unit_id, process_code, assigned_by)
  values
    (p_machine_id, p_die_unit_id, p_process_code, auth.uid())
  returning id into v_assignment_id;

  update public.dpcs_machines
  set machine_status = 'in_use', updated_at = now()
  where id = p_machine_id;

  return v_assignment_id;
end;
$$;

create or replace function public.dpcs_release_machine(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_machine_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Login diperlukan untuk melepas mesin.';
  end if;

  select machine_id into v_machine_id
  from public.dpcs_machine_assignments
  where id = p_assignment_id and released_at is null
  for update;

  if not found then
    raise exception 'Penugasan aktif tidak ditemukan.';
  end if;

  perform 1 from public.dpcs_machines
  where id = v_machine_id
  for update;

  update public.dpcs_machine_assignments
  set released_at = now(), released_by = auth.uid()
  where id = p_assignment_id;

  update public.dpcs_machines
  set machine_status = 'available', updated_at = now()
  where id = v_machine_id;
end;
$$;

revoke all on function public.dpcs_assign_machine(uuid, uuid, text) from public;
revoke all on function public.dpcs_release_machine(uuid) from public;
grant execute on function public.dpcs_assign_machine(uuid, uuid, text) to authenticated;
grant execute on function public.dpcs_release_machine(uuid) to authenticated;
