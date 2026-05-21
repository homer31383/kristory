-- ════════════════════════════════════════════════════════════════════════════
-- Bugfix migration. Two unrelated issues with the realtime path:
--
-- 1) Supabase Realtime DELETE events carry only the primary key in
--    `payload.old` when REPLICA IDENTITY is DEFAULT. Our React subscriptions
--    use filters like `registry_id=eq.<uuid>`, which Supabase evaluates
--    against `payload.old` for DELETE events — so deletes get silently
--    dropped because they don't include `registry_id`. Setting REPLICA
--    IDENTITY FULL on every subscribed table makes the entire old row
--    available on DELETE so the filter matches and the client sees the event.
--
-- 2) Migration 019 created PARTIAL unique indexes on babylist_item_states
--    (`WHERE catalog_item_id IS NOT NULL` etc.). Supabase's upsert generates
--    `ON CONFLICT (col1, col2)` without the `WHERE` predicate, and Postgres
--    can't infer a partial unique index from an unqualified conflict target,
--    so mute/save writes were erroring out silently. Replace the partials
--    with plain unique indexes — NULLs are distinct by default in Postgres,
--    so multiple rows with `catalog_item_id = NULL` (the custom side) still
--    coexist; the XOR check constraint + the *other* unique index keep the
--    custom side honest.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Fix 2: rebuild item-state unique indexes as non-partial ─────────────────
drop index if exists uq_item_states_catalog;
drop index if exists uq_item_states_custom;

create unique index if not exists uq_item_states_catalog
  on babylist_item_states (registry_id, catalog_item_id);

create unique index if not exists uq_item_states_custom
  on babylist_item_states (registry_id, custom_item_id);

-- ─── Fix 1: REPLICA IDENTITY FULL on every realtime-subscribed table ────────
alter table babylist_picks                    replica identity full;
alter table babylist_custom_items             replica identity full;
alter table babylist_alternatives             replica identity full;
alter table babylist_people                   replica identity full;
alter table babylist_item_states              replica identity full;
alter table babylist_catalog_tier_overrides   replica identity full;

-- ─── Belt-and-suspenders: make sure every table we subscribe to is in the
--     supabase_realtime publication. If 0001 was run against an older fork of
--     the schema that lacked the `alter publication ... add table` blocks,
--     these would be missing. Idempotent.
do $$
declare
  t text;
begin
  foreach t in array array[
    'babylist_picks',
    'babylist_custom_items',
    'babylist_alternatives',
    'babylist_people',
    'babylist_item_states',
    'babylist_catalog_tier_overrides'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
