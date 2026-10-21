-- ════════════════════════════════════════════════════════════════════════════
-- Rollback for 2026-10-20_babory_pin.sql
--
-- WRITTEN, NOT APPLIED. Drops the PIN tables and functions and recreates
-- babory_family_links exactly as 2026-10-20_kristory_setup.sql made it (RLS,
-- household policy, grants). Old link rows are gone; new links would have to
-- be created. Only useful together with redeploying the link-based build.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regprocedure('public.is_household()') is null then
    raise exception 'public.is_household() is missing. Run the AnyoneCanParent household SQL first.';
  end if;
end $$;

drop function if exists public.babory_attempts_locked(text[]);
drop function if exists public.babory_attempt_failed(text, int, interval, interval);
drop function if exists public.babory_attempts_clear(text[]);
drop function if exists public.babory_set_pin(text, text, uuid);

drop table if exists public.babory_family_attempts;
drop table if exists public.babory_family_pin;

-- babory_family_links, as in 2026-10-20_kristory_setup.sql
create table if not exists public.babory_family_links (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.babory_family_links enable row level security;

drop policy if exists household_only on public.babory_family_links;
create policy household_only on public.babory_family_links for all to authenticated
  using (public.is_household()) with check (public.is_household());

revoke all on public.babory_family_links from anon;
grant select, insert, update, delete on public.babory_family_links to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- Verification (read-only):
--   select to_regclass('public.babory_family_pin'), to_regclass('public.babory_family_attempts');  -- null, null
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname like 'babory\_%';                                   -- 0
--   select relrowsecurity from pg_class where oid = 'public.babory_family_links'::regclass;      -- true
--   select policyname from pg_policies where schemaname = 'public' and tablename = 'babory_family_links';
