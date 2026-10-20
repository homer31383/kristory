-- ════════════════════════════════════════════════════════════════════════════
-- Rollback for 2026-10-20_kristory.sql (household lockdown: Kristory)
--
-- WRITTEN, NOT APPLIED. Restores the pre-lockdown state as far as the repo's
-- migrations describe it: RLS disabled, no table policies, full CRUD for
-- anon, authenticated and service_role (the explicit table grant convention),
-- and the open storage policies on kristory-photos and kristory-media.
--
-- NOT restored: the app_settings 'app_pin' row. Its value was never in the
-- repo, so it can't be recreated here. If the old PIN gate is ever brought
-- back, set a new one with:
--   insert into public.app_settings (key, value) values ('app_pin', '<new pin>')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
-- (The current code no longer reads it.)
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─── Tables ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  owned text[] := array[
    'journal_entries', 'entry_sections', 'entry_photos', 'journal_media',
    'tagged_items', 'tagged_item_participants', 'recipe_tags', 'tagged_item_recipe_tags',
    'media_tags', 'tagged_item_media_tags',
    'trips', 'trip_entries',
    'baby_profile', 'baby_milestones', 'baby_name_suggestions',
    'family_posts', 'family_post_photos',
    'app_settings',
    'baby_shower_event', 'baby_shower_guests', 'baby_shower_tasks', 'baby_shower_schedule',
    'baby_shower_photos', 'baby_shower_helpers', 'baby_shower_menu',
    'babylist_item_states', 'babylist_catalog_tier_overrides', 'babylist_section_states'
  ];
begin
  foreach t in array owned loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists household_only on public.%I', t);
    execute format('alter table public.%I disable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- Sequences owned by those tables (none expected).
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
    execute format('grant usage, select on sequence public.%I to anon, authenticated, service_role', r.seq);
  end loop;
end $$;

-- Views: no views over these tables exist in the repo's migrations. If the
-- lockdown NOTICEs listed any, restore them by hand:
--   alter view public.<view> reset (security_invoker);
--   grant select on public.<view> to anon;

-- ─── Storage ────────────────────────────────────────────────────────────────
drop policy if exists "kristory household photos select" on storage.objects;
drop policy if exists "kristory household photos insert" on storage.objects;
drop policy if exists "kristory household photos update" on storage.objects;
drop policy if exists "kristory household photos delete" on storage.objects;
drop policy if exists "kristory household media select" on storage.objects;
drop policy if exists "kristory household media insert" on storage.objects;
drop policy if exists "kristory household media update" on storage.objects;
drop policy if exists "kristory household media delete" on storage.objects;

-- Preferred path: recreate exactly what the lockdown dropped (saved by it).
do $$
declare
  p record;
  stmt text;
begin
  if to_regclass('kristory_lockdown_backup.dropped_storage_policies') is null then
    raise notice 'no saved storage policies; falling back to the repo-documented ones';
    return;
  end if;
  for p in select * from kristory_lockdown_backup.dropped_storage_policies loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
    stmt := format('create policy %I on storage.objects as %s for %s to %s',
      p.policyname, lower(p.permissive), p.cmd,
      (select string_agg(quote_ident(r), ', ') from unnest(p.roles) as r));
    if p.qual is not null then stmt := stmt || format(' using (%s)', p.qual); end if;
    if p.with_check is not null then stmt := stmt || format(' with check (%s)', p.with_check); end if;
    raise notice 'restoring storage policy "%"', p.policyname;
    execute stmt;
  end loop;
end $$;

-- Fallback: make sure the open policies documented in the repo exist for any
-- operation still uncovered. kristory-media is exactly 031_journal_media.sql.
-- For kristory-photos the live names were never in a migration; these are the
-- REBUILD-GUIDE names (src/lib/backup.ts), plus an UPDATE policy because the
-- shower uploads use upsert. Each one is only created if no public/anon policy
-- for that bucket and command exists after the restore above.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('kristory-media',  'SELECT', 'kristory-media public read',  'for select using (bucket_id = ''kristory-media'')'),
      ('kristory-media',  'INSERT', 'kristory-media public insert', 'for insert with check (bucket_id = ''kristory-media'')'),
      ('kristory-media',  'DELETE', 'kristory-media public delete', 'for delete using (bucket_id = ''kristory-media'')'),
      ('kristory-photos', 'SELECT', 'Public read',                 'for select using (bucket_id = ''kristory-photos'')'),
      ('kristory-photos', 'INSERT', 'Public insert',               'for insert with check (bucket_id = ''kristory-photos'')'),
      ('kristory-photos', 'UPDATE', 'Allow public updates',        'for update using (bucket_id = ''kristory-photos'')'),
      ('kristory-photos', 'DELETE', 'Public delete',               'for delete using (bucket_id = ''kristory-photos'')')
    ) as v(bucket, cmd, name, body)
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and cmd in (spec.cmd, 'ALL')
        and roles && array['public', 'anon']::name[]
        and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%''' || spec.bucket || '''%'
    ) then
      if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = spec.name) then
        raise notice 'policy name "%" is taken by something else; create the % policy for % by hand', spec.name, spec.cmd, spec.bucket;
      else
        raise notice 'creating fallback storage policy "%"', spec.name;
        execute format('create policy %I on storage.objects %s', spec.name, spec.body);
      end if;
    end if;
  end loop;
end $$;

drop table if exists kristory_lockdown_backup.dropped_storage_policies;
drop schema if exists kristory_lockdown_backup;

notify pgrst, 'reload schema';

commit;

-- Verification (read-only):
--   select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname in ('journal_entries','app_settings','baby_profile','baby_shower_guests');
--   select policyname, cmd, roles from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'kristory-(photos|media)';
