CREATE TABLE baby_name_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  suggested_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
grant select, insert, update, delete on public.baby_name_suggestions to anon, authenticated, service_role;

ALTER TABLE baby_name_suggestions DISABLE ROW LEVEL SECURITY;
