-- Atomic Excel order import for DPCS.
-- The function runs as the authenticated user and obeys table RLS policies.
create or replace function public.import_dpcs_orders(
  p_file_name text,
  p_period date,
  p_rows jsonb,
  p_row_count integer,
  p_rejected_count integer default 0
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_row jsonb;
  v_customer_id uuid;
  v_model_id uuid;
  v_order_id uuid;
  v_line_id uuid;
  v_po_date date;
  v_due_date date;
  v_qty integer;
  v_unit_price numeric(18,2);
  v_sequence integer;
begin
  if auth.uid() is null then
    raise exception 'Anda harus login untuk menyimpan impor.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Tidak ada baris valid untuk disimpan.';
  end if;

  if p_row_count < jsonb_array_length(p_rows) or p_rejected_count < 0 then
    raise exception 'Ringkasan jumlah baris impor tidak valid.';
  end if;

  insert into public.order_import_batches (
    file_name, imported_by, period, status, row_count, accepted_count, rejected_count
  )
  values (
    coalesce(nullif(trim(p_file_name), ''), 'order-import.xlsx'),
    auth.uid(), p_period, 'completed', p_row_count,
    jsonb_array_length(p_rows), p_rejected_count
  )
  returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_po_date := (v_row->>'poDate')::date;
    v_due_date := (v_row->>'dueDate')::date;
    v_qty := (v_row->>'quantity')::integer;
    v_unit_price := (v_row->>'unitPrice')::numeric(18,2);

    if v_due_date < v_po_date or v_qty <= 0 or v_unit_price < 0 then
      raise exception 'Ada baris dengan tanggal atau nilai order tidak valid.';
    end if;

    insert into public.customers (customer_name)
    values (trim(v_row->>'customer'))
    on conflict ((lower(trim(customer_name))))
    do update set customer_name = excluded.customer_name
    returning id into v_customer_id;

    insert into public.die_models (control_number, description, material)
    values (
      trim(v_row->>'controlNumber'),
      trim(v_row->>'description'),
      trim(v_row->>'material')
    )
    on conflict (control_number)
    do update set
      description = excluded.description,
      material = excluded.material,
      updated_at = now()
    returning id into v_model_id;

    insert into public.die_orders (
      import_batch_id, source_row_number, po_date, due_date, customer_id, source_reference
    )
    values (
      v_batch_id,
      (v_row->>'rowNumber')::integer,
      v_po_date,
      v_due_date,
      v_customer_id,
      trim(v_row->>'controlNumber')
    )
    returning id into v_order_id;

    insert into public.die_order_lines (
      die_order_id, die_model_id, quantity, unit_price,
      description_snapshot, material_snapshot
    )
    values (
      v_order_id, v_model_id, v_qty, v_unit_price,
      trim(v_row->>'description'), trim(v_row->>'material')
    )
    returning id into v_line_id;

    for v_sequence in 1..v_qty loop
      insert into public.die_units (die_model_id, order_line_id, unit_sequence)
      values (v_model_id, v_line_id, v_sequence);
    end loop;
  end loop;

  return v_batch_id;
end;
$$;

revoke all on function public.import_dpcs_orders(text, date, jsonb, integer, integer) from public;
revoke all on function public.import_dpcs_orders(text, date, jsonb, integer, integer) from anon;
grant execute on function public.import_dpcs_orders(text, date, jsonb, integer, integer) to authenticated;
