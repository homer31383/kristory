-- ════════════════════════════════════════════════════════════════════════════
-- Per-registry overrides for prepopulated catalog tier cards.
--
-- The seed catalog is shared by every registry and treated as immutable. When
-- Chris or Krista edits a Budget/Mid/Premium card (changing a price, swapping
-- a product, fixing a stale link), the edit lands here as a per-registry
-- override row instead of mutating the global catalog. The UI merges these
-- on top of the catalog defaults; null columns fall back to the original.
--
-- "Reset to default" deletes the override row — the canonical "no override"
-- state is the absence of a row, matching the babylist_item_states pattern.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists babylist_catalog_tier_overrides (
  id                uuid primary key default gen_random_uuid(),
  registry_id       uuid not null,
  catalog_tier_id   uuid not null,
  product           text,
  price_str         text,
  unit_cost         numeric,
  note              text,
  url               text,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  constraint fk_tier_override_registry
    foreign key (registry_id) references babylist_registries(id) on delete cascade,
  constraint fk_tier_override_tier
    foreign key (catalog_tier_id) references babylist_catalog_tiers(id) on delete cascade,
  constraint fk_tier_override_updated_by
    foreign key (updated_by) references babylist_people(id) on delete set null,
  constraint uq_tier_override_per_registry
    unique (registry_id, catalog_tier_id)
);

create index if not exists idx_tier_override_registry
  on babylist_catalog_tier_overrides (registry_id);

-- Realtime: Chris's edits become visible on Krista's device live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'babylist_catalog_tier_overrides'
  ) then
    execute 'alter publication supabase_realtime add table babylist_catalog_tier_overrides';
  end if;
end $$;

alter table babylist_catalog_tier_overrides disable row level security;
