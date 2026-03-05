# The Kristory — Disaster Recovery & Full Rebuild Spec

This document contains everything needed to rebuild The Kristory from scratch if the codebase or database is lost.

---

## 1. Infrastructure

### Supabase Project
- **Provider**: Supabase (hosted PostgreSQL + Storage)
- **Region**: Choose closest to users
- **Required services**: Database, Storage (no Auth, no Edge Functions)
- **Storage bucket**: `kristory-photos` (public, no RLS)

### Hosting
- **Platform**: Vercel
- **Framework preset**: Vite (auto-detected)
- **Build command**: `npm run build` (runs `tsc -b && vite build`)
- **Output directory**: `dist`
- **Environment variables on Vercel**:
  - `VITE_SUPABASE_URL` — Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key

### Domain
- Production URL: `https://the-kristory.vercel.app`

---

## 2. Database Schema

Run these SQL statements in order in the Supabase SQL Editor.

### 2a. Users Table (manual — not in migrations)

```sql
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

INSERT INTO users (name) VALUES ('Chris'), ('Krista');
```

### 2b. Core Schema (Migration 001)

```sql
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

-- Full-text search
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

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  emoji text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Seed default categories
INSERT INTO categories (name, emoji, is_default) VALUES
  ('Movies', '🎬', true),
  ('TV Shows', '📺', true),
  ('Restaurants', '🍽', true),
  ('Home Cooking', '🍳', true),
  ('Activities', '🎭', true),
  ('Books', '📖', true),
  ('Trips', '✈️', true),
  ('Music/Concerts', '🎵', true),
  ('Shopping', '🛒', true),
  ('Baby', '👶', true)
ON CONFLICT (name) DO NOTHING;

-- Tagged Items
CREATE TABLE IF NOT EXISTS tagged_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES journal_entries(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  location_name text,
  location_lat decimal,
  location_lng decimal,
  location_place_id text,
  ingredients text,
  instructions text,
  item_date date,
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

-- Trip <-> Entry junction
CREATE TABLE IF NOT EXISTS trip_entries (
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (trip_id, entry_id)
);

-- Recipe tags
CREATE TABLE IF NOT EXISTS recipe_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  emoji text,
  created_at timestamptz DEFAULT now()
);

-- Recipe tag junction
CREATE TABLE IF NOT EXISTS tagged_item_recipe_tags (
  tagged_item_id uuid REFERENCES tagged_items(id) ON DELETE CASCADE,
  recipe_tag_id uuid REFERENCES recipe_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (tagged_item_id, recipe_tag_id)
);

-- Seed recipe tags
INSERT INTO recipe_tags (name, emoji) VALUES
  ('Pasta', '🍝'), ('Salad', '🥗'), ('Soup', '🍲'), ('Sauce', '🫙'),
  ('Sandwich', '🥪'), ('Protein', '🍗'), ('Baking', '🍞'), ('Sweets', '🍪'),
  ('Pancakes', '🥞'), ('Cookies', '🍪'), ('Sides', '🥦'), ('Breakfast', '🍳')
ON CONFLICT (name) DO NOTHING;

-- Item participants
CREATE TABLE IF NOT EXISTS tagged_item_participants (
  tagged_item_id uuid REFERENCES tagged_items(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (tagged_item_id, user_id)
);

-- Baby Profile
CREATE TABLE IF NOT EXISTS baby_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  due_date date,
  birth_date date,
  birth_weight text,
  birth_length text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert one default row
INSERT INTO baby_profile (name) VALUES (null);

-- Baby Milestones
CREATE TABLE IF NOT EXISTS baby_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  title text NOT NULL,
  milestone_type text NOT NULL DEFAULT 'custom',
  milestone_date date NOT NULL,
  notes text,
  photo_path text,
  created_at timestamptz DEFAULT now()
);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('kristory-photos', 'kristory-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Disable RLS on ALL tables
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE entry_sections DISABLE ROW LEVEL SECURITY;
ALTER TABLE entry_photos DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE tagged_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE trip_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE tagged_item_recipe_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE tagged_item_participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE baby_profile DISABLE ROW LEVEL SECURITY;
ALTER TABLE baby_milestones DISABLE ROW LEVEL SECURITY;
```

### 2c. Storage Policy

In the Supabase dashboard, ensure the `kristory-photos` bucket has a public access policy:
- Allow `SELECT` for all (public read)
- Allow `INSERT` for all (public write — no auth)
- Allow `DELETE` for all

---

## 3. Environment Variables

Create `.env` in project root:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
```

---

## 4. Frontend Application Spec

### Package Dependencies

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.98.0",
    "@tanstack/react-query": "^5.90.21",
    "@tiptap/extension-placeholder": "^2.27.2",
    "@tiptap/react": "^2.27.2",
    "@tiptap/starter-kit": "^2.27.2",
    "date-fns": "^3.6.0",
    "dompurify": "^3.3.1",
    "dotenv": "^17.3.1",
    "jspdf": "^2.5.2",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^6.30.3"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@tailwindcss/vite": "^4.2.1",
    "@types/dompurify": "^3.0.5",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "tailwindcss": "^4.2.1",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.48.0",
    "vite": "^7.3.1",
    "vite-plugin-pwa": "^1.2.0"
  }
}
```

### Vite Config

Manual chunks: `vendor` (react, react-dom, react-router-dom), `supabase`, `editor` (tiptap), `pdf` (jspdf).

PWA manifest: name "The Kristory", theme color `#6B5CA5`, background `#EDE6DE`, standalone display. Workbox with `skipWaiting` + `clientsClaim`, Google Fonts caching.

### Fonts

Loaded from Google Fonts in `index.html`:
- **Playfair Display** (weight 700) — headings, branding
- **Inter** (weights 400, 500, 600) — body text

### Color Palette

| Variable | Light | Dark |
|----------|-------|------|
| `--bg-page` | `#EDE6DE` (warm cream) | `#141414` |
| `--bg-card` | `#F7F3EF` | `#1E1E1E` |
| `--border-card` | `#DDD5CB` | `#2A2A2A` |
| `--text-primary` | `#2C2522` | `#E8E0D8` |
| `--text-secondary` | `#8C8078` | `#9A938B` |
| `--text-muted` | `#B5ADA5` | `#6B645C` |
| `--accent` | `#6B5CA5` (purple) | `#8B7EC8` |
| `--chris-color` | `#6B5CA5` (purple) | `#8B7EC8` |
| `--krista-color` | `#D4708F` (pink) | `#E88BA8` |

Baby-specific: warm yellow `#FFF8E7` bg, `#F0C987` border, soft mint `#F0FAF0`.

---

## 5. Route Map

| Path | View | Description |
|------|------|-------------|
| `/` | `UserPicker` | Select Chris or Krista |
| `/journal` | `Journal` | Timeline with baby widget, infinite scroll |
| `/journal/:date` | `EntryDetail` | Full entry editor |
| `/explore` | `Explore` | Full-text search |
| `/lists` | `Lists` | Trips card, Baby card, category grid |
| `/lists/:categoryId` | `CategoryDetail` | Items in a category |
| `/book-of-food` | `BookOfFood` | Recipe browser |
| `/recipes/:recipeId` | `RecipeDetail` | Single recipe |
| `/items/:itemId` | `ItemDetail` | Single tagged item |
| `/on-this-day` | `OnThisDay` | Same-date entries from past years |
| `/trips/new` | `CreateTrip` | Trip creation form |
| `/trips/:tripId` | `TripDetail` | Trip detail + edit mode |
| `/baby` | `Baby` | Baby timeline/milestones/firsts |
| `/settings` | `Settings` | All settings |

All routes except `/` are wrapped in `RequireUser` which redirects to `/` if no user is selected.

Navigation: 4-tab bottom bar (mobile) / sidebar (desktop) — Journal, Explore, Lists, On This Day. Settings accessible from header gear icon (mobile) or sidebar bottom (desktop).

---

## 6. Data Model Summary

### Core Entities

- **journal_entries**: One row per date. `entry_date` is unique.
- **entry_sections**: One per user per entry. Content is HTML (sanitized with DOMPurify, allowed tags: `p, br, strong, em, b, i`). Has `fts` generated column for full-text search.
- **entry_photos**: Linked to entries. `storage_path` is relative to the `kristory-photos` bucket.
- **categories**: 10 defaults (Movies, TV Shows, Restaurants, Home Cooking, Activities, Books, Trips, Music/Concerts, Shopping, Baby). Users can add custom categories.
- **tagged_items**: Items tagged to entries or standalone. Has optional `ingredients`, `instructions` (for recipes), `item_date` (for standalone items), `rating` (1-5), `location_name`.
- **tagged_item_recipe_tags**: Junction between tagged_items and recipe_tags.
- **tagged_item_participants**: Junction between tagged_items and users.
- **trips**: Date range + title + optional summary/cover photo.
- **trip_entries**: Junction linking trips to journal entries.
- **baby_profile**: Single row with name, due date, birth date, weight, length.
- **baby_milestones**: Title, type (pregnancy/first_year/custom), date, optional notes/photo/entry link.

### Relationships

```
journal_entries 1──* entry_sections (entry_id)
journal_entries 1──* entry_photos (entry_id)
journal_entries 1──* tagged_items (entry_id, nullable)
journal_entries *──* trips (via trip_entries)
tagged_items *──1 categories (category_id)
tagged_items *──* recipe_tags (via tagged_item_recipe_tags)
tagged_items *──* users (via tagged_item_participants)
baby_milestones *──1 journal_entries (entry_id, nullable)
```

---

## 7. Key Algorithms

### Trip Suggestion (`useTrips.ts`)
1. Fetch all entries not already in a trip
2. For each entry, check: tagged items with `location_name`, text content matching `TRIP_KEYWORDS` regex (30+ terms: hotel, airbnb, flight, beach, cabin, etc.), batch-imported entries (3+ consecutive days created within 1 hour)
3. Group consecutive matching days (allowing 1-day gaps) into clusters of 2+ entries
4. Generate title from most common location or "Trip — {dates}"
5. Return suggestions with entry previews and location pills

### Journal Import (`import-parser.ts`)
1. Try both "paragraph mode" and "line mode" parsing
2. Use whichever finds more entries
3. Support date formats: "July 21:", "1/18/2021:", "2021-01-18:"
4. Auto-infer year from sequential month order when not specified
5. Convert plain text to HTML paragraphs

### Recipe Import (`recipe-parser.ts`)
1. Split file by blank lines into recipe blocks
2. First line = name, rest = body
3. Detect divider line (5+ dashes) — above = full recipes, below = ingredient-only
4. Heuristic split of body into ingredients vs instructions
5. Auto-tag based on regex rules (30+ patterns for 12 tag categories)

---

## 8. Preset Data

### Milestone Presets (in `useBaby.ts`)

**Pregnancy**: First ultrasound, Gender reveal / found out gender, First kick felt, Baby shower, Nursery ready, Hospital bag packed, Due date

**First Year**: Born!, First smile, First laugh, Slept through the night, First solid food, First word, First crawl, First steps, First tooth, First birthday

### Default Categories
Movies, TV Shows, Restaurants, Home Cooking, Activities, Books, Trips, Music/Concerts, Shopping, Baby

### Default Recipe Tags
Pasta, Salad, Soup, Sauce, Sandwich, Protein, Baking, Sweets, Pancakes, Cookies, Sides, Breakfast

---

## 9. Rebuild Steps

1. **Create Supabase project** — note URL and anon key
2. **Run SQL** from Section 2 in the SQL Editor (users first, then core schema)
3. **Configure storage** — ensure `kristory-photos` bucket is public with read/write policies
4. **Clone/recreate the codebase** — all source files as documented
5. **Install dependencies**: `npm install`
6. **Create `.env`** with Supabase credentials
7. **Test locally**: `npm run dev`
8. **Deploy**: `npx vercel --prod` — set env vars in Vercel dashboard
9. **Verify**: Open app, select a user, create an entry, upload a photo, tag an item

---

## 10. Data Backup Strategy

### Export from App
Use Settings > Export Data to download JSON or PDF backups containing all entries, tags, categories, and trips.

### Direct Database Backup
```sql
-- Export all data as SQL from Supabase dashboard
-- Or use pg_dump via the connection string from Supabase settings
```

### Photo Backup
Photos are in Supabase Storage bucket `kristory-photos`. Download via:
- Supabase dashboard > Storage > kristory-photos > Download all
- Or use the Supabase CLI: `supabase storage ls kristory-photos --recursive`

### Restore
1. Create new Supabase project
2. Run schema SQL from Section 2
3. Import data via SQL inserts or CSV
4. Upload photos to `kristory-photos` bucket preserving path structure (`{date}/{uuid}.jpg`)
5. Update `.env` with new credentials
6. Redeploy
