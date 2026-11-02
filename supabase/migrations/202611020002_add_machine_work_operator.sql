alter table public.dpcs_machine_assignments
  add column if not exists operator_name text;

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

  if exists (
    select 1 from public.dpcs_machine_assignments
    where machine_id = p_machine_id and released_at is null
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
