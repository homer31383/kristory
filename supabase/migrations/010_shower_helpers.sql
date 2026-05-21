CREATE TABLE baby_shower_helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE baby_shower_helpers DISABLE ROW LEVEL SECURITY;
