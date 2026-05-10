-- ════════════════════════════════════════════════════════════════════════════
-- Per-registry overlay state for items: 'muted' or 'saved' (for-later).
--
-- An item that has no row here is treated as 'active' by the UI. The 'active'
-- value is still allowed in the check constraint so a future writer can use
-- it explicitly, but the canonical "back to active" path is to delete the
-- row outright — keeps the data model clean.
--
-- One row per (registry_id, catalog_item_id) or (registry_id, custom_item_id),
-- enforced by partial unique constraints plus an XOR check.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists babylist_item_states (
  id               uuid primary key default gen_random_uuid(),
  registry_id      uuid not null,
  catalog_item_id  uuid,
  custom_item_id   uuid,
  state            text not null check (state in ('active', 'muted', 'saved')),
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  constraint fk_item_states_registry
    foreign key (registry_id) references babylist_registries(id) on delete cascade,
  constraint fk_item_states_catalog_item
    foreign key (catalog_item_id) references babylist_catalog_items(id) on delete cascade,
  constraint fk_item_states_custom_item
    foreign key (custom_item_id) references babylist_custom_items(id) on delete cascade,
  constraint fk_item_states_updated_by
    foreign key (updated_by) references babylist_people(id) on delete set null,
  constraint chk_item_states_target
    check (
      (catalog_item_id is not null and custom_item_id is null) or
      (catalog_item_id is null and custom_item_id is not null)
    )
);

create unique index if not exists uq_item_states_catalog
  on babylist_item_states (registry_id, catalog_item_id)
  where catalog_item_id is not null;

create unique index if not exists uq_item_states_custom
  on babylist_item_states (registry_id, custom_item_id)
  where custom_item_id is not null;

create index if not exists idx_item_states_registry
  on babylist_item_states (registry_id);

-- Realtime feed for the UI to react to remote mute/save toggles.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'babylist_item_states'
  ) then
    execute 'alter publication supabase_realtime add table babylist_item_states';
  end if;
end $$;

alter table babylist_item_states disable row level security;
