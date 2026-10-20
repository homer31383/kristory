-- App-level settings (key-value)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
grant select, insert, update, delete on public.app_settings to anon, authenticated, service_role;

ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
