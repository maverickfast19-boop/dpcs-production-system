create table if not exists public.dpcs_overtime_requests (
  id uuid primary key default gen_random_uuid(),
  overtime_start timestamptz not null,
  overtime_end timestamptz not null,
  scope text not null default 'factory' check (scope in ('factory','machine')),
  machine_id uuid references public.dpcs_machines(id) on delete restrict,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid not null default auth.uid(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  constraint dpcs_overtime_time_check check (overtime_end > overtime_start),
  constraint dpcs_overtime_scope_check check (
    (scope = 'factory' and machine_id is null) or
    (scope = 'machine' and machine_id is not null)
  )
);

create index if not exists idx_dpcs_overtime_status_start
  on public.dpcs_overtime_requests(status, overtime_start);

alter table public.dpcs_overtime_requests enable row level security;

drop policy if exists "Authenticated users can read overtime requests"
  on public.dpcs_overtime_requests;
create policy "Authenticated users can read overtime requests"
  on public.dpcs_overtime_requests
  for select to authenticated using (true);

drop policy if exists "Users can request own overtime"
  on public.dpcs_overtime_requests;
create policy "Users can request own overtime"
  on public.dpcs_overtime_requests
  for insert to authenticated with check (requested_by = auth.uid());

grant select, insert on public.dpcs_overtime_requests to authenticated;

create or replace function public.dpcs_review_overtime_request(
  p_request_id uuid,
  p_decision text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Login diperlukan untuk memproses persetujuan overtime.';
  end if;

  if not public.is_head_of_production() then
    raise exception 'Hanya Kepala Produksi yang dapat menyetujui atau menolak overtime.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Keputusan overtime tidak valid.';
  end if;

  update public.dpcs_overtime_requests
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = nullif(trim(coalesce(p_review_notes, '')), '')
  where id = p_request_id
    and status = 'pending';

  if not found then
    raise exception 'Pengajuan tidak ditemukan atau sudah diproses.';
  end if;
end;
$$;

revoke all on function public.dpcs_review_overtime_request(uuid, text, text) from public;
grant execute on function public.dpcs_review_overtime_request(uuid, text, text) to authenticated;
