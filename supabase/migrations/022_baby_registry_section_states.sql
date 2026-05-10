-- ════════════════════════════════════════════════════════════════════════════
-- Per-registry collapse state for catalog sections (categories).
--
-- Rows here only exist for collapsed sections; expanded is the default and is
-- represented by the absence of a row (matches the babylist_item_states
-- pattern). Toggling back to expanded deletes the row.
--
-- Section identity is the text label that lives in babylist_catalog_items.section
-- and the custom-items table — same string both sides — so the column is just
-- text (not a FK).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists babylist_section_states (
  id           uuid primary key default gen_random_uuid(),
  registry_id  uuid not null,
  section      text not null,
  collapsed    boolean not null default true,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  constraint fk_section_states_registry
    foreign key (registry_id) references babylist_registries(id) on delete cascade,
  constraint fk_section_states_updated_by
    foreign key (updated_by) references babylist_people(id) on delete set null,
  constraint uq_section_states_per_registry
    unique (registry_id, section)
);

create index if not exists idx_section_states_registry
  on babylist_section_states (registry_id);

-- Full row replication so realtime DELETE events can be filtered by registry_id
-- on the client (same lesson as migration 021).
alter table babylist_section_states replica identity full;

-- Realtime publication membership (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'babylist_section_states'
  ) then
    execute 'alter publication supabase_realtime add table babylist_section_states';
  end if;
end $$;

alter table babylist_section_states disable row level security;
