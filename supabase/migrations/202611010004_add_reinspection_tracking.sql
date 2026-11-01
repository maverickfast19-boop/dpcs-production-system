alter table public.die_unit_repair_work_orders
  add column if not exists reinspection_qc_inspection_id uuid
  references public.die_unit_qc_inspections(id) on delete set null;

create index if not exists idx_repair_work_orders_reinspection_queue
  on public.die_unit_repair_work_orders(status, reinspection_qc_inspection_id)
  where status = 'completed';
