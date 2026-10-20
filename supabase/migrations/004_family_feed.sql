-- Family feed posts (shared baby updates for family)
CREATE TABLE family_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  caption TEXT,
  published_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
grant select, insert, update, delete on public.family_posts to anon, authenticated, service_role;

ALTER TABLE family_posts DISABLE ROW LEVEL SECURITY;

-- Which photos from the entry are shared to the family feed
CREATE TABLE family_post_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_post_id UUID REFERENCES family_posts(id) ON DELETE CASCADE,
  entry_photo_id UUID REFERENCES entry_photos(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0
);
grant select, insert, update, delete on public.family_post_photos to anon, authenticated, service_role;

ALTER TABLE family_post_photos DISABLE ROW LEVEL SECURITY;

-- Store the family feed PIN in baby_profile
ALTER TABLE baby_profile ADD COLUMN family_pin TEXT DEFAULT '2026';
