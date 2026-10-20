-- ════════════════════════════════════════════════════════════════════════════
-- Household lockdown, setup step: Kristory (2026-10-20)
--
-- WRITTEN, NOT APPLIED. Run it in the Supabase SQL Editor BEFORE deploying the
-- household-lockdown build. It is additive: it creates one new table and
-- touches nothing that exists. The main lockdown file
-- (2026-10-20_kristory.sql) runs later and only re-asserts this table's policy.
-- Rollback: 2026-10-20_kristory_setup_rollback.sql
--
-- babory_family_links: private links that let extended family read the
-- Babory without an account. Only the SHA-256 (hex) of each link token is
-- stored; the token itself exists only in the link. The household creates,
-- replaces and revokes links from the app (signed in, through RLS). The
-- read-only feed route (api/babory-feed.ts) checks tokens with the service
-- key. Anon has no access.
--
-- Depends on public.is_household() (AnyoneCanParent household SQL).
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regprocedure('public.is_household()') is null then
    raise exception 'public.is_household() is missing. Run the AnyoneCanParent household SQL first.';
  end if;
end $$;

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
--   select relrowsecurity from pg_class where oid = 'public.babory_family_links'::regclass;   -- true
--   select policyname, roles, cmd from pg_policies where schemaname = 'public' and tablename = 'babory_family_links';
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'babory_family_links' order by 1, 2;     -- no anon rows
--   select count(*) filter (where revoked_at is null) as active, count(*) as total from public.babory_family_links;
