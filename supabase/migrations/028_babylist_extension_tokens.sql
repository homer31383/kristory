-- ════════════════════════════════════════════════════════════════════════════
-- Chrome extension pairing tokens.
--
-- The Baby Registry Chrome extension (separate repo) captures products from
-- the web and writes them into this registry. To connect a browser to a
-- person, /registry mints a short token and stores it here; the extension
-- consumes the token and stamps `used_at`.
--
-- Multiple unused tokens per person are expected — each device pairs with its
-- own token. There is no expiry in v1.
--
-- NOTE: the original task brief referred to this as "migration 023", but 023
-- was already taken by 023_shower_background_opacity.sql. Numbered 028 here to
-- follow the existing sequence; the table name and shape are unchanged.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists babylist_extension_tokens (
  token       text primary key,
  person_id   uuid references babylist_people(id) on delete cascade,
  registry_id uuid references babylist_registries(id) on delete cascade,
  created_at  timestamptz default now(),
  used_at     timestamptz
);

-- All babylist_* tables run with RLS disabled — the app has no Supabase Auth
-- and trusts the client. A plain `create table` already leaves RLS off, but
-- this line is explicit for the historical record (matching 019/020) and
-- guards against the table having been created via the Supabase Table Editor
-- UI, which auto-enables RLS and would silently break anon inserts.
alter table babylist_extension_tokens disable row level security;
