-- The Kristory Schema
-- All new tables for the shared journal app
-- RLS is disabled on all tables
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT)

-- Journal Entries (one per day)
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Entry Sections (one per user per day)
CREATE TABLE IF NOT EXISTS entry_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  content text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (entry_id, user_id)
);

-- Full-text search on entry sections
ALTER TABLE entry_sections ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_entry_sections_fts ON entry_sections USING GIN (fts);

-- Entry Photos
CREATE TABLE IF NOT EXISTS entry_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  storage_path text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Categories (may already exist in your project)
-- Add missing columns if the table exists, or create it fresh
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categories') THEN
    CREATE TABLE categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      emoji text,
      is_default boolean DEFAULT false,
      created_at timestamptz DEFAULT now()
    );
  ELSE
    -- Ensure required columns exist on the existing table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'emoji') THEN
      ALTER TABLE categories ADD COLUMN emoji text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'is_default') THEN
      ALTER TABLE categories ADD COLUMN is_default boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'created_at') THEN
      ALTER TABLE categories ADD COLUMN created_at timestamptz DEFAULT now();
    END IF;
  END IF;
END $$;

-- Seed default categories (skip if they already exist)
INSERT INTO categories (name, emoji, is_default) VALUES
  ('Movies', '🎬', true),
  ('TV Shows', '📺', true),
  ('Restaurants', '🍽', true),
  ('Home Cooking', '🍳', true),
  ('Activities', '🎭', true),
  ('Books', '📖', true),
  ('Trips', '✈️', true),
  ('Music/Concerts', '🎵', true),
  ('Shopping', '🛒', true)
ON CONFLICT (name) DO NOTHING;

-- Tagged Items
CREATE TABLE IF NOT EXISTS tagged_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  location_name text,
  location_lat decimal,
  location_lng decimal,
  location_place_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tagged_items_name ON tagged_items USING GIN (to_tsvector('english', name));

-- Trips
CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  cover_photo_path text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Trip <-> Entry junction table
CREATE TABLE IF NOT EXISTS trip_entries (
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (trip_id, entry_id)
);

-- Create storage bucket for photos (skip if exists)
INSERT INTO storage.buckets (id, name, public) VALUES ('kristory-photos', 'kristory-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Disable RLS on all tables
ALTER TABLE journal_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE entry_sections DISABLE ROW LEVEL SECURITY;
ALTER TABLE entry_photos DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE tagged_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE trip_entries DISABLE ROW LEVEL SECURITY;
