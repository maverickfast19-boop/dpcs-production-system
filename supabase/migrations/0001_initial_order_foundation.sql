-- DPCS initial database foundation
-- Apply in Supabase SQL Editor. No production data is inserted by this migration.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'operator'
    check (role in ('admin', 'marketing', 'head_of_production', 'operator', 'qc')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customers_name_lower_uidx
  on public.customers (lower(trim(customer_name)));

create table if not exists public.die_models (
  id uuid primary key default gen_random_uuid(),
  control_number text not null unique,
  description text not null,
  material text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  period date not null,
  status text not null default 'preview'
    check (status in ('preview', 'completed', 'rejected', 'failed')),
  row_count integer not null default 0 check (row_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  file_fingerprint text,
  created_at timestamptz not null default now()
);

create table if not exists public.die_orders (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid references public.order_import_batches(id) on delete restrict,
  source_row_number integer,
  po_date date not null,
  due_date date not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  source_reference text,
  created_at timestamptz not null default now(),
  constraint die_orders_due_after_po check (due_date >= po_date)
);

create table if not exists public.die_specification_revisions (
  id uuid primary key default gen_random_uuid(),
  die_model_id uuid not null references public.die_models(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  change_request_date date,
  change_reason text,
  previous_specification jsonb,
  revised_specification jsonb not null,
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected')),
  recorded_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  unique (die_model_id, revision_number)
);

create table if not exists public.die_order_lines (
  id uuid primary key default gen_random_uuid(),
  die_order_id uuid not null references public.die_orders(id) on delete cascade,
  die_model_id uuid not null references public.die_models(id) on delete restrict,
  specification_revision_id uuid references public.die_specification_revisions(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  total_price numeric(18,2) generated always as (quantity * unit_price) stored,
  description_snapshot text not null,
  material_snapshot text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.die_units (
  id uuid primary key default gen_random_uuid(),
  die_model_id uuid not null references public.die_models(id) on delete restrict,
  order_line_id uuid not null references public.die_order_lines(id) on delete restrict,
  unit_sequence integer not null check (unit_sequence > 0),
  physical_unit_code text unique,
  status text not null default 'ordered'
    check (status in ('ordered', 'in_production', 'manufactured', 'available', 'in_use', 'maintenance', 'repair', 'scrapped')),
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_line_id, unit_sequence)
);

create index if not exists die_orders_po_date_idx on public.die_orders (po_date desc);
create index if not exists die_orders_due_date_idx on public.die_orders (due_date);
create index if not exists die_order_lines_model_idx on public.die_order_lines (die_model_id);
create index if not exists die_units_model_idx on public.die_units (die_model_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();
drop trigger if exists die_models_set_updated_at on public.die_models;
create trigger die_models_set_updated_at before update on public.die_models
for each row execute function public.set_updated_at();
drop trigger if exists die_units_set_updated_at on public.die_units;
create trigger die_units_set_updated_at before update on public.die_units
for each row execute function public.set_updated_at();

-- Initial internal-factory access: authenticated staff can work with operational tables.
-- Role-specific permissions and approval enforcement will be tightened in the next security pass.
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.die_models enable row level security;
alter table public.order_import_batches enable row level security;
alter table public.die_orders enable row level security;
alter table public.die_order_lines enable row level security;
alter table public.die_specification_revisions enable row level security;
alter table public.die_units enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'die_models', 'order_import_batches', 'die_orders',
    'die_order_lines', 'die_specification_revisions', 'die_units'
  ]
  loop
    execute format('drop policy if exists "Authenticated staff full access" on public.%I', table_name);
    execute format(
      'create policy "Authenticated staff full access" on public.%I for all to authenticated using (true) with check (true)',
      table_name
    );
  end loop;
end $$;
