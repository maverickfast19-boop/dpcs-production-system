-- Manual Control Number and physical die-unit registration (admin only).
-- Existing imported order rows remain linked to their order lines.

alter table public.die_units
  alter column order_line_id drop not null;

create index if not exists die_units_manual_sequence_uidx
  on public.die_units (die_model_id, unit_sequence)
  where order_line_id is null;

create or replace function public.register_manual_die_model(
  p_control_number text,
  p_description text,
  p_material text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Akses ditolak: hanya admin yang dapat mendaftarkan Control Number.';
  end if;

  if nullif(trim(p_control_number), '') is null
     or nullif(trim(p_description), '') is null
     or nullif(trim(p_material), '') is null then
    raise exception 'Control Number, deskripsi, dan material wajib diisi.';
  end if;

  insert into public.die_models (control_number, description, material)
  values (trim(p_control_number), trim(p_description), trim(p_material))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Control Number tersebut sudah terdaftar.';
end;
$$;

create or replace function public.register_manual_die_units(
  p_die_model_id uuid,
  p_quantity integer,
  p_initial_status text default 'available',
  p_markings text[] default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next_sequence integer;
  v_i integer;
  v_marking text;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Akses ditolak: hanya admin yang dapat mendaftarkan unit dies.';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 500 then
    raise exception 'Jumlah unit harus antara 1 sampai 500.';
  end if;

  if p_initial_status not in ('ordered', 'in_production', 'manufactured', 'available', 'in_use', 'maintenance', 'repair', 'scrapped') then
    raise exception 'Status awal tidak valid.';
  end if;

  if p_markings is not null and cardinality(p_markings) <> p_quantity then
    raise exception 'Jumlah marking harus sama dengan jumlah unit, atau kosongkan seluruh marking.';
  end if;

  perform 1 from public.die_models where id = p_die_model_id and active = true for update;
  if not found then
    raise exception 'Control Number tidak ditemukan atau tidak aktif.';
  end if;

  select coalesce(max(unit_sequence), 0) + 1
    into v_next_sequence
  from public.die_units
  where die_model_id = p_die_model_id;

  for v_i in 0..p_quantity - 1 loop
    v_marking := case when p_markings is null then null else nullif(trim(p_markings[v_i + 1]), '') end;
    insert into public.die_units (
      die_model_id, order_line_id, unit_sequence, physical_unit_code, status
    ) values (
      p_die_model_id, null, v_next_sequence + v_i, v_marking, p_initial_status
    );
  end loop;

  return p_quantity;
end;
$$;

revoke all on function public.register_manual_die_model(text, text, text) from public;
revoke all on function public.register_manual_die_units(uuid, integer, text, text[]) from public;
grant execute on function public.register_manual_die_model(text, text, text) to authenticated;
grant execute on function public.register_manual_die_units(uuid, integer, text, text[]) to authenticated;
