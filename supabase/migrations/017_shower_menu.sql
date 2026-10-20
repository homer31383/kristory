CREATE TABLE baby_shower_menu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_label TEXT DEFAULT 'servings',
  notes TEXT,
  prepared BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
grant select, insert, update, delete on public.baby_shower_menu to anon, authenticated, service_role;
ALTER TABLE baby_shower_menu DISABLE ROW LEVEL SECURITY;
