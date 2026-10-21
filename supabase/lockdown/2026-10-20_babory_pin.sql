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
--   babory_family_lockouts  one row per NEW lockout ('device' or 'global'),
--                           kept 7 days, for the counts in Settings.
--   Functions (security definer):
--     babory_attempts_locked(keys)        true if any key is locked now
--     babory_register_failure(ip, dev)    one wrong PIN: +1 on the IP, device
--                                         and global counters, plus lockout
--                                         events (see below)
--     babory_attempts_clear(keys)         delete counters (after a right PIN)
--     babory_set_pin(hash, salt, by)      atomic upsert; version + 1 on change
--     babory_attempt_failed(...)          internal helper, NOT executable by
--                                         service_role (owner only)
--   Limits live in babory_register_failure: IP key and device key 5 wrong in
--   15 min -> 15 min lock; '*global*' 31 wrong (i.e. more than 30) in 1 hour
--   -> 1 hour lock.
--
--   One event per lockout: a wrong PIN counts against both the IP key and the
--   device key, and either (or both) may lock on the same try. The helper
--   returns true only when ITS key goes from unlocked to locked (each key is
--   serialized with an advisory lock), and babory_register_failure inserts a
--   single 'device' row if the IP key OR the device key newly locked, and one
--   'global' row if the global key newly locked. Requests made while already
--   locked never get here (the unlock route checks locks first), and an
--   existing lock is never "new" anyway.
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

create table if not exists public.babory_family_lockouts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('device', 'global')),
  created_at timestamptz not null default now()
);
create index if not exists babory_family_lockouts_created_at_idx on public.babory_family_lockouts (created_at);

alter table public.babory_family_pin enable row level security;
alter table public.babory_family_attempts enable row level security;
alter table public.babory_family_lockouts enable row level security;
-- No policies on purpose: only service_role (which bypasses RLS) may touch them.

revoke all on public.babory_family_pin from anon, authenticated;
revoke all on public.babory_family_attempts from anon, authenticated;
revoke all on public.babory_family_lockouts from anon, authenticated;
grant select, insert, update, delete on public.babory_family_pin to service_role;
grant select, insert, update, delete on public.babory_family_attempts to service_role;
grant select, insert, update, delete on public.babory_family_lockouts to service_role;
revoke all on sequence public.babory_family_lockouts_id_seq from anon, authenticated;
grant usage, select on sequence public.babory_family_lockouts_id_seq to service_role;

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
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev timestamptz;
  v_new timestamptz;
begin
  -- Serialize per key so "newly locked" is decided exactly once.
  perform pg_advisory_xact_lock(hashtext('babory_attempt:' || p_key));
  select locked_until into v_prev from public.babory_family_attempts where ip_hash = p_key;

  -- A counter whose window has passed, or whose lock has run out, starts again at 1.
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
    end
  returning locked_until into v_new;

  -- True only on the transition unlocked -> locked.
  return (v_prev is null or v_prev <= now()) and v_new is not null and v_new > now();
end;
$$;

create or replace function public.babory_register_failure(p_ip_key text, p_dev_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip boolean;
  v_dev boolean;
  v_global boolean;
begin
  v_ip := public.babory_attempt_failed(p_ip_key, 5, interval '15 minutes', interval '15 minutes');
  v_dev := public.babory_attempt_failed(p_dev_key, 5, interval '15 minutes', interval '15 minutes');
  v_global := public.babory_attempt_failed('*global*', 31, interval '1 hour', interval '1 hour');

  -- One person locking out = one 'device' event, even if both their IP key
  -- and their device key locked on this try.
  if v_ip or v_dev then
    insert into public.babory_family_lockouts (kind) values ('device');
  end if;
  if v_global then
    insert into public.babory_family_lockouts (kind) values ('global');
  end if;

  -- Keep 7 days of events.
  delete from public.babory_family_lockouts where created_at < now() - interval '7 days';
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
revoke execute on function public.babory_attempt_failed(text, int, interval, interval) from public, anon, authenticated, service_role;
revoke execute on function public.babory_register_failure(text, text) from public, anon, authenticated;
revoke execute on function public.babory_attempts_clear(text[]) from public, anon, authenticated;
revoke execute on function public.babory_set_pin(text, text, uuid) from public, anon, authenticated;
grant execute on function public.babory_attempts_locked(text[]) to service_role;
grant execute on function public.babory_register_failure(text, text) to service_role;
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
-- RLS on, no policies (expect three trues and 0 policies):
--   select relname, relrowsecurity from pg_class
--   where oid in ('public.babory_family_pin'::regclass, 'public.babory_family_attempts'::regclass,
--                 'public.babory_family_lockouts'::regclass);
--   select count(*) from pg_policies where schemaname = 'public'
--     and tablename in ('babory_family_pin', 'babory_family_attempts', 'babory_family_lockouts');
--
-- Only service_role has table grants (expect only service_role rows):
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name in ('babory_family_pin', 'babory_family_attempts', 'babory_family_lockouts')
--   order by 1, 2, 3;
--
-- Functions: only service_role (and the owner) may execute (expect anon/authenticated false;
-- babory_attempt_failed is false for service_role too, it is internal):
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
-- Lockouts in the last 7 days (what Settings shows):
--   select kind, count(*) from public.babory_family_lockouts
--   where created_at > now() - interval '7 days' group by kind;
--
-- Current lockouts:
--   select ip_hash = '*global*' as is_global, failures, window_start, locked_until
--   from public.babory_family_attempts order by window_start desc;
