-- Modul 09 foundation: structured Workcard identity and exact die dimensions.
-- Existing units remain valid; their specification fields are intentionally nullable
-- until an admin records the Workcard specification.

alter table public.die_units
  add column if not exists product_model text,
  add column if not exists die_shape text
    check (die_shape in ('box', 'cylinder')),
  add column if not exists length_mm numeric(12,2),
  add column if not exists width_mm numeric(12,2),
  add column if not exists height_mm numeric(12,2),
  add column if not exists diameter_mm numeric(12,2);

alter table public.die_units
  drop constraint if exists die_units_workcard_dimensions_check;

alter table public.die_units
  add constraint die_units_workcard_dimensions_check
  check (
    (
      die_shape is null
      and length_mm is null
      and width_mm is null
      and height_mm is null
      and diameter_mm is null
    )
    or
    (
      die_shape = 'box'
      and length_mm > 0
      and width_mm > 0
      and height_mm > 0
      and diameter_mm is null
    )
    or
    (
      die_shape = 'cylinder'
      and diameter_mm > 0
      and length_mm > 0
      and width_mm is null
      and height_mm is null
    )
  );

create index if not exists idx_die_units_workcard_repeat_lookup
  on public.die_units (
    lower(trim(product_model)),
    die_shape,
    length_mm,
    width_mm,
    height_mm,
    diameter_mm
  )
  where product_model is not null and die_shape is not null;

comment on column public.die_units.product_model is
  'Nama produk/model pada Workcard; terpisah dari deskripsi dan Control Number.';
comment on column public.die_units.die_shape is
  'Bentuk dies pada Workcard: box atau cylinder.';
comment on column public.die_units.length_mm is
  'Panjang dies kotak atau panjang/tinggi dies tabung, dalam mm.';
comment on column public.die_units.width_mm is
  'Lebar dies kotak, dalam mm.';
comment on column public.die_units.height_mm is
  'Tinggi dies kotak, dalam mm.';
comment on column public.die_units.diameter_mm is
  'Diameter besar dies tabung, dalam mm.';
