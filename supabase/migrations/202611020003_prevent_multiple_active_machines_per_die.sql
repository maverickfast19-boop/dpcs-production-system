-- Prevent one die unit from being active on more than one machine at a time.
-- Historical visits remain untouched; only rows with released_at IS NULL are constrained.

do $$
begin
  if exists (
    select 1
    from public.dpcs_machine_assignments
    where released_at is null
    group by die_unit_id
    having count(*) > 1
  ) then
    raise exception
      'Ada unit dies dengan lebih dari satu pekerjaan mesin aktif. Selesaikan/rapikan penugasan aktif ganda sebelum memasang aturan ini.';
  end if;
end;
$$;

create unique index if not exists uq_dpcs_die_unit_one_active_machine
  on public.dpcs_machine_assignments(die_unit_id)
  where released_at is null;

create or replace function public.dpcs_assign_machine_work(
  p_machine_id uuid,
  p_die_unit_id uuid,
  p_operator_name text,
  p_notes text default null
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
    raise exception 'Login diperlukan untuk memulai pekerjaan mesin.';
  end if;

  if nullif(trim(coalesce(p_operator_name, '')), '') is null then
    raise exception 'Nama operator wajib diisi.';
  end if;

  -- Lock the machine and die unit so concurrent requests cannot start
  -- conflicting work on either resource.
  select machine_status into v_status
  from public.dpcs_machines
  where id = p_machine_id
  for update;

  if not found then
    raise exception 'Mesin tidak ditemukan.';
  end if;

  if v_status <> 'available' then
    raise exception 'Mesin harus berstatus Tersedia sebelum digunakan.';
  end if;

  perform 1
  from public.die_units
  where id = p_die_unit_id
  for update;

  if not found then
    raise exception 'Unit dies tidak ditemukan.';
  end if;

  if exists (
    select 1
    from public.dpcs_machine_assignments
    where die_unit_id = p_die_unit_id
      and released_at is null
  ) then
    raise exception 'Unit dies masih memiliki pekerjaan aktif pada mesin lain. Selesaikan pekerjaan tersebut terlebih dahulu.';
  end if;

  if exists (
    select 1
    from public.dpcs_machine_assignments
    where machine_id = p_machine_id
      and released_at is null
  ) then
    raise exception 'Mesin masih memiliki pekerjaan aktif.';
  end if;

  insert into public.dpcs_machine_assignments
    (machine_id, die_unit_id, process_code, operator_name, notes, assigned_by)
  values
    (p_machine_id, p_die_unit_id, 'machining', trim(p_operator_name),
     nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_assignment_id;

  update public.dpcs_machines
  set machine_status = 'in_use', updated_at = now()
  where id = p_machine_id;

  return v_assignment_id;
end;
$$;

revoke all on function public.dpcs_assign_machine_work(uuid, uuid, text, text) from public;
grant execute on function public.dpcs_assign_machine_work(uuid, uuid, text, text) to authenticated;
