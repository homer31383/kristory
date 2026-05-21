CREATE TABLE baby_name_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  suggested_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE baby_name_suggestions DISABLE ROW LEVEL SECURITY;
