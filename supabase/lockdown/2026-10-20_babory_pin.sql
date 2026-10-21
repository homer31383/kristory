-- ════════════════════════════════════════════════════════════════════════════
-- Babory family PIN (2026-10-20)
--
-- WRITTEN, NOT APPLIED. Run it in the Supabase SQL Editor BEFORE deploying
-- the `babory-pin` build. Rollback: 2026-10-20_babory_pin_rollback.sql
--
-- Replaces the private family links with one server-checked PIN for
-- /family. Everything here is service_role only: the Vercel functions
-- (api/babory-*.ts) do all reads and writes with the service key. No policies,
-- no anon or authenticated access, so the PIN hash and the attempt counters
-- are invisible through the Data API.
--
--   babory_family_pin       one row (id = true): scrypt hash + salt of the PIN,
--                           `version` (bumped on every change; family session
--                           cookies carry it, so a change signs every family
--                           device out), updated_at, updated_by (Auth user id).
--   babory_family_attempts  wrong-PIN counters. The key column is named ip_hash
--                           but holds three kinds of keys, all opaque:
--                             'ip:<hmac>'   HMAC-SHA256 of the client IP
--                             'dev:<hmac>'  HMAC-SHA256 of the device-id cookie
--                             '*global*'    one reserved row for all devices
--                           A reserved row (rather than a separate table) keeps
--                           one set of atomic functions for every counter; the
--                           '*global*' key can never collide with an HMAC key
--                           because those always carry a prefix.
--   Functions (security definer, execute for service_role only):
--     babory_attempts_locked(keys)        true if any key is locked now
--     babory_attempt_failed(key, max, window, lock)
--                                         atomic +1 in the current window; locks
--                                         the key when failures reach `max`
--     babory_attempts_clear(keys)         delete counters (after a right PIN)
--     babory_set_pin(hash, salt, by)      atomic upsert; version + 1 on change
--
-- Also drops babory_family_links (the link feature is removed).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─── Guard ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regrole('service_role') is null then
    raise exception 'role service_role is missing; is this a Supabase project?';
  end if;
end $$;

-- ─── Tables ─────────────────────────────────────────────────────────────────
create table if not exists public.babory_family_pin (
  id boolean primary key default true check (id),
  pin_hash text not null,
  salt text not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.babory_family_attempts (
  ip_hash text primary key,
  failures int not null default 0,
  window_start timestamptz not null,
  locked_until timestamptz
);

alter table public.babory_family_pin enable row level security;
alter table public.babory_family_attempts enable row level security;
-- No policies on purpose: only service_role (which bypasses RLS) may touch them.

revoke all on public.babory_family_pin from anon, authenticated;
revoke all on public.babory_family_attempts from anon, authenticated;
grant select, insert, update, delete on public.babory_family_pin to service_role;
grant select, insert, update, delete on public.babory_family_attempts to service_role;

-- ─── Functions ──────────────────────────────────────────────────────────────
create or replace function public.babory_attempts_locked(p_keys text[])
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.babory_family_attempts
    where ip_hash = any (p_keys) and locked_until is not null and locked_until > now()
  );
$$;

create or replace function public.babory_attempt_failed(
  p_key text, p_max int, p_window interval, p_lock interval
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- One statement, so concurrent failures can't lose a count. A counter whose
  -- window has passed, or whose lock has run out, starts again at 1.
  insert into public.babory_family_attempts as a (ip_hash, failures, window_start, locked_until)
  values (p_key, 1, now(), case when p_max <= 1 then now() + p_lock end)
  on conflict (ip_hash) do update set
    failures = case
      when a.window_start < now() - p_window or (a.locked_until is not null and a.locked_until <= now()) then 1
      else a.failures + 1
    end,
    window_start = case
      when a.window_start < now() - p_window or (a.locked_until is not null and a.locked_until <= now()) then now()
      else a.window_start
    end,
    locked_until = case
      when a.locked_until is not null and a.locked_until > now() then a.locked_until
      when (case
              when a.window_start < now() - p_window or (a.locked_until is not null and a.locked_until <= now()) then 1
              else a.failures + 1
            end) >= p_max then now() + p_lock
      else null
    end;
end;
$$;

create or replace function public.babory_attempts_clear(p_keys text[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.babory_family_attempts where ip_hash = any (p_keys) and ip_hash <> '*global*';
$$;

create or replace function public.babory_set_pin(p_hash text, p_salt text, p_by uuid)
returns timestamptz
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.babory_family_pin as p (id, pin_hash, salt, version, updated_at, updated_by)
  values (true, p_hash, p_salt, 1, now(), p_by)
  on conflict (id) do update set
    pin_hash = excluded.pin_hash,
    salt = excluded.salt,
    version = p.version + 1,
    updated_at = now(),
    updated_by = excluded.updated_by
  returning updated_at;
$$;

revoke execute on function public.babory_attempts_locked(text[]) from public, anon, authenticated;
revoke execute on function public.babory_attempt_failed(text, int, interval, interval) from public, anon, authenticated;
revoke execute on function public.babory_attempts_clear(text[]) from public, anon, authenticated;
revoke execute on function public.babory_set_pin(text, text, uuid) from public, anon, authenticated;
grant execute on function public.babory_attempts_locked(text[]) to service_role;
grant execute on function public.babory_attempt_failed(text, int, interval, interval) to service_role;
grant execute on function public.babory_attempts_clear(text[]) to service_role;
grant execute on function public.babory_set_pin(text, text, uuid) to service_role;

-- ─── Retire the private links ───────────────────────────────────────────────
drop table if exists public.babory_family_links;

notify pgrst, 'reload schema';

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification (read-only)
-- ════════════════════════════════════════════════════════════════════════════
--
-- RLS on, no policies (expect true/true and 0 policies):
--   select relname, relrowsecurity from pg_class
--   where oid in ('public.babory_family_pin'::regclass, 'public.babory_family_attempts'::regclass);
--   select count(*) from pg_policies where schemaname = 'public'
--     and tablename in ('babory_family_pin', 'babory_family_attempts');
--
-- Only service_role has table grants (expect only service_role rows):
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name in ('babory_family_pin', 'babory_family_attempts')
--   order by 1, 2, 3;
--
-- Functions: only service_role (and the owner) may execute (expect anon/authenticated false):
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('service_role', p.oid, 'execute') as service_role,
--          p.prosecdef as security_definer
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname like 'babory\_%';
--
-- Links table gone (expect null):
--   select to_regclass('public.babory_family_links');
--
-- PIN status without revealing it (expect 0 rows until the household sets one):
--   select version, updated_at from public.babory_family_pin;
--
-- Current lockouts:
--   select ip_hash = '*global*' as is_global, failures, window_start, locked_until
--   from public.babory_family_attempts order by window_start desc;
