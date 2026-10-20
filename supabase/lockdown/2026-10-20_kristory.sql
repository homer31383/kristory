-- ════════════════════════════════════════════════════════════════════════════
-- Household lockdown: Kristory (2026-10-20)
--
-- WRITTEN, NOT APPLIED. Run it by hand in the Supabase SQL Editor, after the
-- Kristory sign-in build is deployed. Rollback: 2026-10-20_kristory_rollback.sql
--
-- What it does:
--   1. Every Kristory-owned table: RLS on, ONE policy for `authenticated`
--      (public.is_household() for using + with check), anon loses all access,
--      authenticated and service_role keep explicit grants (repo convention).
--      One exception: baby_profile keeps an anon SELECT policy for Order Up
--      (see below). babory_family_links (from the setup file) is re-asserted.
--   2. Deletes the old app_settings.app_pin row (the app now uses Supabase Auth).
--   3. Views over these tables (none are known; handled generically):
--      security_invoker = true and anon access revoked.
--   4. Storage buckets kristory-photos and kristory-media: the public/anon
--      SELECT, INSERT, UPDATE and DELETE policies are replaced with
--      authenticated + household-only ones. Both buckets STAY public
--      (storage.buckets rows are not touched), so public object URLs
--      (/storage/v1/object/public/...) keep working. Listing, authenticated
--      downloads, uploads, upserts and deletes need a household session.
--
-- Depends on public.is_household() (created by the AnyoneCanParent lockdown
-- SQL). The guard below aborts if it is missing.
--
-- Tables Kristory touches but does NOT own, so they are NOT locked here:
--   users                      shared with Axiom Tasks (007_user_system)
--   categories                 shared with Axiom Tasks (Axiom's user_id/sort_order shape)
--   babylist_registries, babylist_people, babylist_catalog_items,
--   babylist_catalog_tiers, babylist_custom_items, babylist_alternatives,
--   babylist_picks             BabyRegistry / BabyRegistryExtension repo
--   babylist_extension_tokens  also created by the extension repo (its 023),
--                              and the Chrome extension pairs through it
--   meals, meal_ingredients, grocery_categories   Axiom Tasks
--
-- Cross-app readers of tables locked here (they need a household session too):
--   baby_profile, baby_milestones, app_settings  AnyoneCanParent
--   baby_profile                                 Order Up (baby age)
--   tagged_items                                 Axiom Tasks (Kristory recipes)
--   kristory-photos objects under acp/           AnyoneCanParent uploads
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─── Guard ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.is_household()') is null then
    raise exception 'public.is_household() is missing. Run the AnyoneCanParent household SQL first.';
  end if;
end $$;

-- ─── 1. Tables ──────────────────────────────────────────────────────────────
do $$
declare
  t text;
  owned text[] := array[
    -- journal
    'journal_entries', 'entry_sections', 'entry_photos', 'journal_media',
    -- items, recipes, library
    'tagged_items', 'tagged_item_participants', 'recipe_tags', 'tagged_item_recipe_tags',
    'media_tags', 'tagged_item_media_tags',
    -- trips
    'trips', 'trip_entries',
    -- baby and the Babory
    'baby_profile', 'baby_milestones', 'baby_name_suggestions',
    'family_posts', 'family_post_photos',
    -- settings
    'app_settings',
    -- shower
    'baby_shower_event', 'baby_shower_guests', 'baby_shower_tasks', 'baby_shower_schedule',
    'baby_shower_photos', 'baby_shower_helpers', 'baby_shower_menu',
    -- registry overlay tables created by this repo (019, 020, 022)
    'babylist_item_states', 'babylist_catalog_tier_overrides', 'babylist_section_states'
  ];
begin
  foreach t in array owned loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip: public.% does not exist', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists household_only on public.%I', t);
    execute format(
      'create policy household_only on public.%I for all to authenticated '
      'using (public.is_household()) with check (public.is_household())', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

-- Order Up exception (TEMPORARY). Order Up reads baby_profile with the anon
-- key to show the baby's age, and it has no sign-in yet. So baby_profile keeps
-- ONE extra policy: anon may SELECT every row and column (insert/update/delete
-- stay household-only). The table is a single row: id, name, due_date,
-- birth_date, birth_weight, birth_length, notes, family_pin (unused, still
-- holds the old Babory PIN), created_at, updated_at.
-- TODO: Order Up must move to sign-in or a narrow function, then drop this
-- policy and the anon grant.
drop policy if exists baby_profile_anon_read on public.baby_profile;
create policy baby_profile_anon_read on public.baby_profile for select to anon using (true);
grant select on public.baby_profile to anon;

-- babory_family_links is created (already locked) by 2026-10-20_kristory_setup.sql.
-- Re-assert its lock here; this is a no-op when the setup file ran.
do $$
begin
  if to_regclass('public.babory_family_links') is null then
    raise notice 'skip: public.babory_family_links does not exist (run 2026-10-20_kristory_setup.sql)';
    return;
  end if;
  alter table public.babory_family_links enable row level security;
  drop policy if exists household_only on public.babory_family_links;
  create policy household_only on public.babory_family_links for all to authenticated
    using (public.is_household()) with check (public.is_household());
  revoke all on public.babory_family_links from anon;
  grant select, insert, update, delete on public.babory_family_links to authenticated, service_role;
end $$;

-- Sequences owned by those tables (none expected; all PKs are uuid or text).
do $$
declare
  r record;
begin
  for r in
    select s.relname as seq
    from pg_class s
    join pg_namespace n on n.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid
    where s.relkind = 'S' and n.nspname = 'public'
      and t.relname = any (array[
        'journal_entries', 'entry_sections', 'entry_photos', 'journal_media',
        'tagged_items', 'tagged_item_participants', 'recipe_tags', 'tagged_item_recipe_tags',
        'media_tags', 'tagged_item_media_tags', 'trips', 'trip_entries',
        'baby_profile', 'baby_milestones', 'baby_name_suggestions',
        'family_posts', 'family_post_photos', 'app_settings',
        'baby_shower_event', 'baby_shower_guests', 'baby_shower_tasks', 'baby_shower_schedule',
        'baby_shower_photos', 'baby_shower_helpers', 'baby_shower_menu',
        'babylist_item_states', 'babylist_catalog_tier_overrides', 'babylist_section_states'])
  loop
    execute format('revoke all on sequence public.%I from anon', r.seq);
    execute format('grant usage, select on sequence public.%I to authenticated, service_role', r.seq);
  end loop;
end $$;

-- ─── 2. Retire the app PIN ──────────────────────────────────────────────────
delete from public.app_settings where key = 'app_pin';

-- ─── 3. Views over the locked tables ────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select distinct v.relname as view_name
    from pg_class v
    join pg_namespace vn on vn.oid = v.relnamespace
    join pg_rewrite rw on rw.ev_class = v.oid
    join pg_depend d on d.objid = rw.oid and d.classid = 'pg_rewrite'::regclass
    join pg_class t on t.oid = d.refobjid
    join pg_namespace tn on tn.oid = t.relnamespace
    where v.relkind = 'v' and vn.nspname = 'public' and tn.nspname = 'public'
      and t.oid <> v.oid
      and t.relname = any (array[
        'journal_entries', 'entry_sections', 'entry_photos', 'journal_media',
        'tagged_items', 'tagged_item_participants', 'recipe_tags', 'tagged_item_recipe_tags',
        'media_tags', 'tagged_item_media_tags', 'trips', 'trip_entries',
        'baby_profile', 'baby_milestones', 'baby_name_suggestions',
        'family_posts', 'family_post_photos', 'app_settings',
        'baby_shower_event', 'baby_shower_guests', 'baby_shower_tasks', 'baby_shower_schedule',
        'baby_shower_photos', 'baby_shower_helpers', 'baby_shower_menu',
        'babylist_item_states', 'babylist_catalog_tier_overrides', 'babylist_section_states'])
  loop
    raise notice 'view public.%: security_invoker = true, anon revoked', r.view_name;
    execute format('alter view public.%I set (security_invoker = true)', r.view_name);
    execute format('revoke all on public.%I from anon', r.view_name);
  end loop;
end $$;

-- ─── 4. Storage: kristory-photos and kristory-media ─────────────────────────
-- Keep a copy of every policy we drop, so the rollback can recreate them
-- exactly. The schema is not exposed through the Data API.
create schema if not exists kristory_lockdown_backup;
revoke all on schema kristory_lockdown_backup from public, anon, authenticated;
create table if not exists kristory_lockdown_backup.dropped_storage_policies (
  policyname text primary key,
  permissive text not null,
  roles name[] not null,
  cmd text not null,
  qual text,
  with_check text,
  saved_at timestamptz not null default now()
);
revoke all on kristory_lockdown_backup.dropped_storage_policies from public, anon, authenticated;

-- Known names of the old open policies, from the repo:
--   kristory-media: "kristory-media public read|insert|delete"  (031_journal_media.sql, confirmed)
--   kristory-photos: not in any migration. Names documented in the repo:
--     "Public read", "Public insert", "Public delete"            (REBUILD-GUIDE in src/lib/backup.ts)
--     "Allow public uploads|reads|updates|deletes"              (Kristory_DisasterRecovery/THE-KRISTORY-REBUILD-PROMPT.txt)
--   Neither kristory-photos set is confirmed live, and "Public read" etc. are
--   generic names another app could own. So instead of dropping by name, this
--   drops every policy on storage.objects that (a) applies to public or anon
--   and (b) whose expressions mention ONLY one of our two buckets as a string
--   literal. Policies that also mention another literal (e.g. a 'acp' prefix
--   check, or a second bucket) are left alone and reported with a NOTICE.
do $$
declare
  p record;
  lits text[];
  bucket text;
begin
  for p in
    select policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname not like 'kristory household %'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '''kristory-(photos|media)'''
  loop
    select array_agg(distinct m[1]) into lits
    from regexp_matches(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''), '''([^'']*)''', 'g') as m;

    if array_length(lits, 1) = 1
       and lits[1] in ('kristory-photos', 'kristory-media')
       and (p.roles && array['public', 'anon']::name[]) then
      bucket := lits[1];
      insert into kristory_lockdown_backup.dropped_storage_policies
        (policyname, permissive, roles, cmd, qual, with_check)
      values (p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check)
      on conflict (policyname) do update set
        permissive = excluded.permissive, roles = excluded.roles, cmd = excluded.cmd,
        qual = excluded.qual, with_check = excluded.with_check, saved_at = now();
      raise notice 'dropping storage policy "%" (% on %, roles %)', p.policyname, p.cmd, bucket, p.roles;
      execute format('drop policy %I on storage.objects', p.policyname);
    else
      raise notice 'left in place, check by hand: storage policy "%" (% roles %) using (%) with check (%)',
        p.policyname, p.cmd, p.roles, p.qual, p.with_check;
    end if;
  end loop;
end $$;

-- New household-only policies. Uploads use upsert for the shower background,
-- tile and gift photos, so kristory-photos needs UPDATE; media.ts uploads with
-- x-upsert: false, but UPDATE is added there too for parity.
drop policy if exists "kristory household photos select" on storage.objects;
drop policy if exists "kristory household photos insert" on storage.objects;
drop policy if exists "kristory household photos update" on storage.objects;
drop policy if exists "kristory household photos delete" on storage.objects;
drop policy if exists "kristory household media select" on storage.objects;
drop policy if exists "kristory household media insert" on storage.objects;
drop policy if exists "kristory household media update" on storage.objects;
drop policy if exists "kristory household media delete" on storage.objects;

create policy "kristory household photos select" on storage.objects for select to authenticated
  using (bucket_id = 'kristory-photos' and public.is_household());
create policy "kristory household photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'kristory-photos' and public.is_household());
create policy "kristory household photos update" on storage.objects for update to authenticated
  using (bucket_id = 'kristory-photos' and public.is_household())
  with check (bucket_id = 'kristory-photos' and public.is_household());
create policy "kristory household photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'kristory-photos' and public.is_household());

create policy "kristory household media select" on storage.objects for select to authenticated
  using (bucket_id = 'kristory-media' and public.is_household());
create policy "kristory household media insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'kristory-media' and public.is_household());
create policy "kristory household media update" on storage.objects for update to authenticated
  using (bucket_id = 'kristory-media' and public.is_household())
  with check (bucket_id = 'kristory-media' and public.is_household());
create policy "kristory household media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'kristory-media' and public.is_household());

notify pgrst, 'reload schema';

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification (read-only; run after the script)
-- ════════════════════════════════════════════════════════════════════════════
--
-- RLS on, one policy per owned table:
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r'
--     and c.relname in ('journal_entries','entry_sections','entry_photos','journal_media','tagged_items',
--       'tagged_item_participants','recipe_tags','tagged_item_recipe_tags','media_tags','tagged_item_media_tags',
--       'trips','trip_entries','baby_profile','baby_milestones','baby_name_suggestions','family_posts',
--       'family_post_photos','app_settings','baby_shower_event','baby_shower_guests','baby_shower_tasks',
--       'baby_shower_schedule','baby_shower_photos','baby_shower_helpers','baby_shower_menu',
--       'babylist_item_states','babylist_catalog_tier_overrides','babylist_section_states')
--   order by 1;
--
-- anon has no table privileges left on them (expect exactly 1 row: baby_profile SELECT, the Order Up exception):
--   select table_name, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and grantee = 'anon'
--     and table_name in ('journal_entries','entry_sections','entry_photos','journal_media','tagged_items',
--       'tagged_item_participants','recipe_tags','tagged_item_recipe_tags','media_tags','tagged_item_media_tags',
--       'trips','trip_entries','baby_profile','baby_milestones','baby_name_suggestions','family_posts',
--       'family_post_photos','app_settings','baby_shower_event','baby_shower_guests','baby_shower_tasks',
--       'baby_shower_schedule','baby_shower_photos','baby_shower_helpers','baby_shower_menu',
--       'babylist_item_states','babylist_catalog_tier_overrides','babylist_section_states');
--
-- app_pin is gone (expect 0):
--   select count(*) from public.app_settings where key = 'app_pin';
--
-- Storage policies on the two buckets (expect only the 8 "kristory household ..." ones,
-- plus anything the NOTICEs said was left in place):
--   select policyname, cmd, roles, qual, with_check from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'kristory-(photos|media)'
--   order by policyname;
--
-- What was dropped (the rollback recreates these):
--   select * from kristory_lockdown_backup.dropped_storage_policies;
--
-- Buckets still public (expect both true):
--   select id, public from storage.buckets where id in ('kristory-photos', 'kristory-media');
