import JSZip from 'jszip'
import { supabase } from './supabase'
import { getStorageUrl } from './helpers'
import { format } from 'date-fns'

export type BackupProgress = {
  phase: string
  detail?: string
  current?: number
  total?: number
}

type ProgressCallback = (p: BackupProgress) => void

// ---- Data fetching ----

async function fetchAll(table: string, select = '*', order?: string): Promise<any[]> {
  const q = supabase.from(table).select(select)
  if (order) q.order(order)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as any[]
}

async function fetchData(onProgress: ProgressCallback) {
  onProgress({ phase: 'Exporting data...' })

  const [
    users,
    entries,
    sections,
    photos,
    categories,
    taggedItems,
    recipeTags,
    taggedItemRecipeTags,
    participants,
    mediaTags,
    taggedItemMediaTags,
    trips,
    tripEntries,
    babyProfile,
    milestones,
    familyPosts,
    familyPostPhotos,
    nameSuggestions,
    appSettings,
    showerEvent,
    showerGuests,
    showerTasks,
    showerSchedule,
    showerHelpers,
    showerPhotos,
    showerMenu,
  ] = await Promise.all([
    fetchAll('users', '*', 'name'),
    fetchAll('journal_entries', '*', 'entry_date'),
    fetchAll('entry_sections', '*, user:users!user_id(name)'),
    fetchAll('entry_photos', '*', 'display_order'),
    fetchAll('categories', '*', 'name'),
    fetchAll(
      'tagged_items',
      // Pulls both tag taxonomies inline so the structured per-item view
      // doesn't silently drop the Library book tags.
      '*, category:categories!category_id(name, emoji), user:users!user_id(name), recipe_tags:tagged_item_recipe_tags!tagged_item_id(tag:recipe_tags!recipe_tag_id(name)), media_tags:tagged_item_media_tags!tagged_item_id(tag:media_tags!media_tag_id(name))',
    ),
    fetchAll('recipe_tags', '*', 'name'),
    fetchAll('tagged_item_recipe_tags'),
    fetchAll('tagged_item_participants', '*, user:users!user_id(name)'),
    fetchAll('media_tags', '*', 'name'),
    fetchAll('tagged_item_media_tags'),
    fetchAll('trips', '*', 'start_date'),
    fetchAll('trip_entries'),
    supabase.from('baby_profile').select('*').maybeSingle().then(r => r.data),
    fetchAll('baby_milestones', '*', 'milestone_date'),
    fetchAll('family_posts', '*', 'published_at'),
    fetchAll('family_post_photos', '*', 'display_order'),
    fetchAll('baby_name_suggestions', '*', 'created_at'),
    fetchAll('app_settings'),
    fetchAll('baby_shower_event'),
    fetchAll('baby_shower_guests', '*', 'name'),
    fetchAll('baby_shower_tasks', '*', 'display_order'),
    fetchAll('baby_shower_schedule', '*', 'display_order'),
    fetchAll('baby_shower_helpers', '*', 'created_at'),
    fetchAll('baby_shower_photos', '*', 'created_at'),
    fetchAll('baby_shower_menu', '*', 'display_order'),
  ])

  return {
    users, entries, sections, photos, categories,
    taggedItems, recipeTags, taggedItemRecipeTags, participants,
    mediaTags, taggedItemMediaTags,
    trips, tripEntries, babyProfile, milestones,
    familyPosts, familyPostPhotos, nameSuggestions, appSettings,
    showerEvent, showerGuests, showerTasks, showerSchedule, showerHelpers, showerPhotos, showerMenu,
  }
}

// ---- Build structured JSON ----

function buildDataJson(raw: Awaited<ReturnType<typeof fetchData>>) {
  const tripMap = new Map(raw.trips.map((t: any) => [t.id, t.title]))

  // Build entry -> trip lookup
  const entryTripMap = new Map<string, string>()
  for (const te of raw.tripEntries) {
    entryTripMap.set(te.entry_id, tripMap.get(te.trip_id) ?? '')
  }

  // Build entry -> sections
  const sectionsByEntry = new Map<string, any[]>()
  for (const s of raw.sections) {
    const arr = sectionsByEntry.get(s.entry_id) ?? []
    arr.push(s)
    sectionsByEntry.set(s.entry_id, arr)
  }

  // Build entry -> photos
  const photosByEntry = new Map<string, any[]>()
  for (const p of raw.photos) {
    const arr = photosByEntry.get(p.entry_id) ?? []
    arr.push(p)
    photosByEntry.set(p.entry_id, arr)
  }

  // Build item -> participants
  const participantsByItem = new Map<string, string[]>()
  for (const p of raw.participants) {
    const arr = participantsByItem.get(p.tagged_item_id) ?? []
    arr.push(p.user?.name ?? 'Unknown')
    participantsByItem.set(p.tagged_item_id, arr)
  }

  // Build entry -> tagged items.
  // The mapping includes every tagged_items column so a restore from this
  // JSON is lossless — Library / Books rich fields from migration 030
  // (status, themes, summary, etc.) used to silently drop here.
  const itemsByEntry = new Map<string, any[]>()
  const standaloneItems: any[] = []
  for (const item of raw.taggedItems) {
    const mapped = {
      name: item.name,
      category: item.category?.name ?? '',
      rating: item.rating,
      location_name: item.location_name,
      location_lat: item.location_lat ?? null,
      location_lng: item.location_lng ?? null,
      location_place_id: item.location_place_id ?? null,
      ingredients: item.ingredients,
      instructions: item.instructions,
      item_date: item.item_date,
      // Library / Books rich fields (migration 030).
      subtitle: item.subtitle ?? null,
      author: item.author ?? null,
      status: item.status ?? null,
      format: item.format ?? null,
      start_date: item.start_date ?? null,
      finish_date: item.finish_date ?? null,
      recommended_by: item.recommended_by ?? null,
      themes: item.themes ?? null,
      summary: item.summary ?? null,
      what_stuck: item.what_stuck ?? null,
      cover_url: item.cover_url ?? null,
      favorite: item.favorite ?? false,
      hall_of_fame: item.hall_of_fame ?? false,
      isbn: item.isbn ?? null,
      page_count: item.page_count ?? null,
      subcategory: item.subcategory ?? null,
      recipe_tags: (item.recipe_tags ?? []).map((rt: any) => rt.tag?.name).filter(Boolean),
      media_tags: (item.media_tags ?? []).map((mt: any) => mt.tag?.name).filter(Boolean),
      participants: participantsByItem.get(item.id) ?? [],
    }
    if (item.entry_id) {
      const arr = itemsByEntry.get(item.entry_id) ?? []
      arr.push(mapped)
      itemsByEntry.set(item.entry_id, arr)
    } else {
      standaloneItems.push(mapped)
    }
  }

  // Build entry -> family post
  const familyPostByEntry = new Map<string, any>()
  const fpPhotosByPost = new Map<string, string[]>()
  for (const fpp of raw.familyPostPhotos) {
    const photo = raw.photos.find((p: any) => p.id === fpp.entry_photo_id)
    if (photo) {
      const arr = fpPhotosByPost.get(fpp.family_post_id) ?? []
      arr.push(photo.storage_path)
      fpPhotosByPost.set(fpp.family_post_id, arr)
    }
  }
  for (const fp of raw.familyPosts) {
    familyPostByEntry.set(fp.entry_id, {
      caption: fp.caption,
      published_at: fp.published_at,
      shared_photos: fpPhotosByPost.get(fp.id) ?? [],
    })
  }

  // Build journal entries
  const journalEntries = raw.entries.map((entry: any) => {
    const entrySections = (sectionsByEntry.get(entry.id) ?? []).map((s: any) => ({
      author: s.user?.name ?? 'Unknown',
      content: s.content,
    }))
    const entryPhotos = (photosByEntry.get(entry.id) ?? [])
      .sort((a: any, b: any) => a.display_order - b.display_order)
      .map((p: any) => ({ storage_path: p.storage_path, display_order: p.display_order }))
    const entryItems = itemsByEntry.get(entry.id) ?? []
    const trip = entryTripMap.get(entry.id)
    const familyPost = familyPostByEntry.get(entry.id)

    return {
      entry_date: entry.entry_date,
      sections: entrySections,
      photos: entryPhotos,
      tagged_items: entryItems,
      ...(trip ? { trip } : {}),
      ...(familyPost ? { family_post: familyPost } : {}),
    }
  })

  // App settings as key-value
  const settingsObj: Record<string, string> = {}
  for (const s of raw.appSettings) {
    settingsObj[s.key] = s.value
  }
  // Include family PIN from baby profile
  if (raw.babyProfile?.family_pin) {
    settingsObj.family_pin = raw.babyProfile.family_pin
  }

  return {
    backup_date: new Date().toISOString(),
    app_version: '1.1.0',
    users: raw.users.map((u: any) => ({ name: u.name })),
    journal_entries: journalEntries,
    standalone_items: standaloneItems,
    trips: raw.trips.map((t: any) => ({
      title: t.title,
      start_date: t.start_date,
      end_date: t.end_date,
      summary: t.summary,
      cover_photo_path: t.cover_photo_path,
    })),
    categories: raw.categories.map((c: any) => ({
      name: c.name,
      emoji: c.emoji,
      is_default: c.is_default,
    })),
    recipe_tags: raw.recipeTags.map((t: any) => ({ name: t.name, emoji: t.emoji })),
    // The Library tag taxonomy (migration 030).
    media_tags: raw.mediaTags.map((t: any) => ({
      name: t.name,
      category_type: t.category_type,
    })),
    baby: {
      profile: raw.babyProfile ? {
        name: raw.babyProfile.name,
        due_date: raw.babyProfile.due_date,
        birth_date: raw.babyProfile.birth_date,
        birth_weight: raw.babyProfile.birth_weight,
        birth_length: raw.babyProfile.birth_length,
        notes: raw.babyProfile.notes,
      } : null,
      milestones: raw.milestones.map((m: any) => ({
        title: m.title,
        milestone_type: m.milestone_type,
        milestone_date: m.milestone_date,
        notes: m.notes,
        photo_path: m.photo_path,
      })),
      name_suggestions: raw.nameSuggestions.map((n: any) => ({
        name: n.name,
        suggested_by: n.suggested_by,
      })),
    },
    family_posts: raw.familyPosts.map((fp: any) => ({
      caption: fp.caption,
      published_at: fp.published_at,
      shared_photos: fpPhotosByPost.get(fp.id) ?? [],
    })),
    baby_shower: {
      event: raw.showerEvent,
      guests: raw.showerGuests,
      tasks: raw.showerTasks,
      schedule: raw.showerSchedule,
      helpers: raw.showerHelpers,
      photos: raw.showerPhotos,
      menu: raw.showerMenu,
    },
    app_settings: settingsObj,
  }
}

// ---- Build README ----

function buildReadme(raw: Awaited<ReturnType<typeof fetchData>>) {
  const now = format(new Date(), 'MMMM d, yyyy')
  const entryDates = raw.entries.map((e: any) => e.entry_date).sort()
  const earliest = entryDates[0] ?? 'N/A'
  const latest = entryDates[entryDates.length - 1] ?? 'N/A'
  const recipeCount = raw.taggedItems.filter((i: any) => i.ingredients || i.instructions).length
  const bookCount = raw.taggedItems.filter(
    (i: any) => (i.category?.name ?? '').toLowerCase() === 'books',
  ).length
  const showerGuestCount = raw.showerGuests.length

  return `The Kristory — Data Backup
Exported: ${now}

This backup contains:
- ${raw.entries.length} journal entries (earliest: ${earliest} — latest: ${latest})
- ${raw.photos.length} photos
- ${raw.taggedItems.length} tagged items across ${raw.categories.length} categories
- ${recipeCount} recipes
- ${bookCount} books in the Library
- ${raw.mediaTags.length} media tags (Library tag taxonomy)
- ${raw.trips.length} trips
- ${raw.milestones.length} baby milestones
- ${raw.familyPosts.length} family feed posts
- ${raw.nameSuggestions.length} baby name suggestions
- Baby shower data: ${showerGuestCount} guest${showerGuestCount === 1 ? '' : 's'}, ${raw.showerTasks.length} task${raw.showerTasks.length === 1 ? '' : 's'}, ${raw.showerMenu.length} menu item${raw.showerMenu.length === 1 ? '' : 's'}, ${raw.showerPhotos.length} photo${raw.showerPhotos.length === 1 ? '' : 's'}

To restore: Use the rebuild prompt (THE-KRISTORY-REBUILD-PROMPT.txt)
to recreate the app, then import this data.json file via Settings.
`
}

// ---- Build REBUILD-GUIDE ----

function buildRebuildGuide(raw: Awaited<ReturnType<typeof fetchData>>) {
  const now = format(new Date(), 'MMMM d, yyyy')

  // Get user IDs and names
  const userLines = raw.users.map((u: any) => `  - ${u.name}: ${u.id}`).join('\n')

  // Get current seed categories
  const categoryValues = raw.categories
    .filter((c: any) => c.is_default)
    .map((c: any) => `  ('${c.name.replace(/'/g, "''")}', '${(c.emoji ?? '📌').replace(/'/g, "''")}', true)`)
    .join(',\n')

  // Get current recipe tag seeds
  const recipeTagValues = raw.recipeTags
    .map((t: any) => `  ('${t.name.replace(/'/g, "''")}', '${(t.emoji ?? '').replace(/'/g, "''")}')`)
    .join(',\n')

  return `================================================================================
THE KRISTORY — COMPLETE REBUILD GUIDE
================================================================================
Generated: ${now}

This guide contains everything needed to rebuild The Kristory from scratch
if the app, database, or hosting is lost. Keep this file safe.

================================================================================
1. PREREQUISITES
================================================================================

You will need:
  - Node.js 18+ and npm (https://nodejs.org)
  - A Supabase account (https://supabase.com) — free tier works
  - A Vercel account (https://vercel.com) — free tier works
  - A GitHub account (https://github.com) — to host the source code
  - The Kristory source code (rebuild from scratch with Claude Code,
    or restore from a code backup/repository)

================================================================================
2. CREATE SUPABASE PROJECT
================================================================================

a) Go to https://supabase.com and create a new project.
b) Note down your project URL and anon key from Settings > API:
   - Project URL: https://YOUR_PROJECT.supabase.co
   - Anon public key: eyJ...

================================================================================
3. RUN THE COMPLETE DATABASE MIGRATION
================================================================================

Open the Supabase SQL Editor and run this entire block:

------------ BEGIN SQL ------------

-- ============================================
-- USERS TABLE (must exist first)
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Insert the two users (Chris & Krista)
-- These specific UUIDs are referenced throughout the data
INSERT INTO users (id, name) VALUES
${raw.users.map((u: any) => `  ('${u.id}', '${u.name.replace(/'/g, "''")}')`).join(',\n')}
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- JOURNAL ENTRIES
-- ============================================

CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE journal_entries DISABLE ROW LEVEL SECURITY;

-- ============================================
-- ENTRY SECTIONS (one per user per day)
-- ============================================

CREATE TABLE IF NOT EXISTS entry_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  content text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (entry_id, user_id)
);

ALTER TABLE entry_sections ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_entry_sections_fts ON entry_sections USING GIN (fts);

ALTER TABLE entry_sections DISABLE ROW LEVEL SECURITY;

-- ============================================
-- ENTRY PHOTOS
-- ============================================

CREATE TABLE IF NOT EXISTS entry_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  storage_path text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE entry_photos DISABLE ROW LEVEL SECURITY;

-- ============================================
-- CATEGORIES
-- ============================================

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  emoji text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories DISABLE ROW LEVEL SECURITY;

-- Seed default categories
INSERT INTO categories (name, emoji, is_default) VALUES
${categoryValues}
ON CONFLICT (name) DO NOTHING;

-- Also insert the Baby category
INSERT INTO categories (name, emoji, is_default) VALUES ('Baby', '👶', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- TAGGED ITEMS
-- ============================================
-- Includes the Library / Books rich fields from migration 030.

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
  -- Library / Books rich fields
  subtitle text,
  author text,
  status text DEFAULT 'want' CHECK (status IN ('want', 'reading', 'read', 'abandoned', 'reference')),
  format text CHECK (format IN ('physical', 'ebook', 'audiobook')),
  start_date date,
  finish_date date,
  recommended_by text,
  themes text,
  summary text,
  what_stuck text,
  cover_url text,
  favorite boolean DEFAULT false,
  hall_of_fame boolean DEFAULT false,
  isbn text,
  page_count integer,
  subcategory text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tagged_items_name ON tagged_items USING GIN (to_tsvector('english', name));

ALTER TABLE tagged_items DISABLE ROW LEVEL SECURITY;

-- ============================================
-- RECIPE TAGS
-- ============================================

CREATE TABLE IF NOT EXISTS recipe_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  emoji text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recipe_tags DISABLE ROW LEVEL SECURITY;

-- Seed recipe tags
INSERT INTO recipe_tags (name, emoji) VALUES
${recipeTagValues}
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- RECIPE TAG JUNCTION
-- ============================================

CREATE TABLE IF NOT EXISTS tagged_item_recipe_tags (
  tagged_item_id uuid REFERENCES tagged_items(id) ON DELETE CASCADE,
  recipe_tag_id uuid REFERENCES recipe_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (tagged_item_id, recipe_tag_id)
);

ALTER TABLE tagged_item_recipe_tags DISABLE ROW LEVEL SECURITY;

-- ============================================
-- ITEM PARTICIPANTS
-- ============================================

CREATE TABLE IF NOT EXISTS tagged_item_participants (
  tagged_item_id uuid REFERENCES tagged_items(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (tagged_item_id, user_id)
);

ALTER TABLE tagged_item_participants DISABLE ROW LEVEL SECURITY;

-- ============================================
-- MEDIA TAGS (Library tag taxonomy — migration 030)
-- ============================================

CREATE TABLE IF NOT EXISTS media_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category_type text NOT NULL DEFAULT 'books',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE media_tags DISABLE ROW LEVEL SECURITY;

-- Seed the initial Books taxonomy.
INSERT INTO media_tags (name, category_type) VALUES
  ('Fiction', 'books'),
  ('Nonfiction', 'books'),
  ('Art', 'books'),
  ('Memoir', 'books'),
  ('Biography', 'books'),
  ('Poetry', 'books'),
  ('Graphic Novel', 'books'),
  ('Cookbook', 'books'),
  ('History', 'books'),
  ('Science', 'books'),
  ('Philosophy', 'books'),
  ('Self-Help', 'books'),
  ('Fantasy', 'books'),
  ('Sci-Fi', 'books'),
  ('Mystery', 'books'),
  ('Horror', 'books'),
  ('Romance', 'books'),
  ('Travel', 'books'),
  ('Business', 'books'),
  ('Design', 'books'),
  ('Photography', 'books'),
  ('Architecture', 'books'),
  ('Children', 'books')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- MEDIA TAG JUNCTION
-- ============================================

CREATE TABLE IF NOT EXISTS tagged_item_media_tags (
  tagged_item_id uuid REFERENCES tagged_items(id) ON DELETE CASCADE,
  media_tag_id uuid REFERENCES media_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (tagged_item_id, media_tag_id)
);

ALTER TABLE tagged_item_media_tags DISABLE ROW LEVEL SECURITY;

-- ============================================
-- TRIPS
-- ============================================

CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  cover_photo_path text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE trips DISABLE ROW LEVEL SECURITY;

-- ============================================
-- TRIP ENTRIES JUNCTION
-- ============================================

CREATE TABLE IF NOT EXISTS trip_entries (
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (trip_id, entry_id)
);

ALTER TABLE trip_entries DISABLE ROW LEVEL SECURITY;

-- ============================================
-- BABY PROFILE
-- ============================================

CREATE TABLE IF NOT EXISTS baby_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  due_date date,
  birth_date date,
  birth_weight text,
  birth_length text,
  notes text,
  family_pin text DEFAULT '2026',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE baby_profile DISABLE ROW LEVEL SECURITY;

-- Insert one default row
INSERT INTO baby_profile (name) VALUES (null);

-- ============================================
-- BABY MILESTONES
-- ============================================

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

ALTER TABLE baby_milestones DISABLE ROW LEVEL SECURITY;

-- ============================================
-- FAMILY FEED POSTS
-- ============================================

CREATE TABLE IF NOT EXISTS family_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES journal_entries(id) ON DELETE CASCADE,
  caption text,
  published_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE family_posts DISABLE ROW LEVEL SECURITY;

-- ============================================
-- FAMILY POST PHOTOS
-- ============================================

CREATE TABLE IF NOT EXISTS family_post_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_post_id uuid REFERENCES family_posts(id) ON DELETE CASCADE,
  entry_photo_id uuid REFERENCES entry_photos(id) ON DELETE CASCADE,
  display_order integer DEFAULT 0
);

ALTER TABLE family_post_photos DISABLE ROW LEVEL SECURITY;

-- ============================================
-- BABY NAME SUGGESTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS baby_name_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  suggested_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE baby_name_suggestions DISABLE ROW LEVEL SECURITY;

-- ============================================
-- APP SETTINGS (key-value store)
-- ============================================

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

-- ============================================
-- BABY SHOWER — EVENT
-- ============================================
-- All optional event-level config (date, location, hero image,
-- background styling, etc.). Migrations 007 + 013/014 + 023-027.

CREATE TABLE IF NOT EXISTS baby_shower_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date,
  event_time text,
  location_name text,
  location_address text,
  description text,
  registry_links jsonb DEFAULT '[]',
  hero_image_path text,
  hero_focal_point text DEFAULT '50% 50%',
  background_image_path text,
  background_opacity decimal DEFAULT 0.85,
  background_zoom decimal DEFAULT 1.0,
  bg_fill_color text DEFAULT '#EDE6DE',
  bg_tile_path text,
  bg_tile_count integer DEFAULT 5,
  bg_feather_edges boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE baby_shower_event DISABLE ROW LEVEL SECURITY;

-- Seed an empty event row so the editor has something to update.
INSERT INTO baby_shower_event (event_date)
SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM baby_shower_event);

-- ============================================
-- BABY SHOWER — HELPERS (created BEFORE tasks: tasks.helper_id FKs here)
-- ============================================

CREATE TABLE IF NOT EXISTS baby_shower_helpers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  color text DEFAULT '#6B5CA5',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE baby_shower_helpers DISABLE ROW LEVEL SECURITY;

-- ============================================
-- BABY SHOWER — GUESTS
-- ============================================
-- Migrations 007 + 008 + 011 (address became JSONB) + 015 (side).

CREATE TABLE IF NOT EXISTS baby_shower_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address jsonb,
  invitation_sent boolean DEFAULT false,
  invitation_sent_date date,
  rsvp_status text DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'yes', 'no', 'maybe')),
  rsvp_date date,
  plus_one boolean DEFAULT false,
  plus_one_name text,
  gift_description text,
  gift_photo_path text,
  thank_you_sent boolean DEFAULT false,
  dietary_needs text,
  notes text,
  side text CHECK (side IN ('L', 'B')),
  added_by text DEFAULT 'host',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE baby_shower_guests DISABLE ROW LEVEL SECURITY;

-- ============================================
-- BABY SHOWER — TASKS
-- ============================================

CREATE TABLE IF NOT EXISTS baby_shower_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  completed boolean DEFAULT false,
  display_order integer DEFAULT 0,
  helper_id uuid REFERENCES baby_shower_helpers(id) ON DELETE SET NULL,
  due_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE baby_shower_tasks DISABLE ROW LEVEL SECURITY;

-- ============================================
-- BABY SHOWER — SCHEDULE
-- ============================================

CREATE TABLE IF NOT EXISTS baby_shower_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_slot text NOT NULL,
  description text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE baby_shower_schedule DISABLE ROW LEVEL SECURITY;

-- ============================================
-- BABY SHOWER — PHOTOS
-- ============================================

CREATE TABLE IF NOT EXISTS baby_shower_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  uploaded_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE baby_shower_photos DISABLE ROW LEVEL SECURITY;

-- ============================================
-- BABY SHOWER — MENU
-- ============================================

CREATE TABLE IF NOT EXISTS baby_shower_menu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  quantity integer DEFAULT 1,
  unit_label text DEFAULT 'servings',
  notes text,
  prepared boolean DEFAULT false,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE baby_shower_menu DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STORAGE BUCKET
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('kristory-photos', 'kristory-photos', true)
ON CONFLICT (id) DO NOTHING;

------------ END SQL ------------

================================================================================
4. CONFIGURE STORAGE BUCKET ACCESS
================================================================================

In the Supabase dashboard:
  a) Go to Storage > kristory-photos bucket
  b) Click "Policies" and add these policies:
     - Allow SELECT (read) for all users (public read)
     - Allow INSERT (upload) for all users (public write)
     - Allow DELETE for all users

  Or run this SQL:

  CREATE POLICY "Public read" ON storage.objects FOR SELECT
    USING (bucket_id = 'kristory-photos');
  CREATE POLICY "Public insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'kristory-photos');
  CREATE POLICY "Public delete" ON storage.objects FOR DELETE
    USING (bucket_id = 'kristory-photos');

================================================================================
5. SET UP THE APP
================================================================================

a) Clone or recreate the repository:
   git clone https://github.com/homer31383/kristory.git
   cd kristory

b) Install dependencies:
   npm install

c) Create .env file with your Supabase credentials:
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE

d) Test locally:
   npm run dev

e) Build for production:
   npm run build

================================================================================
6. DEPLOY TO VERCEL
================================================================================

a) Push to GitHub:
   git remote add origin https://github.com/YOUR_USERNAME/kristory.git
   git push -u origin main

b) Go to https://vercel.com and import the GitHub repository.

c) Set environment variables in Vercel project settings:
   - VITE_SUPABASE_URL = https://YOUR_PROJECT.supabase.co
   - VITE_SUPABASE_ANON_KEY = YOUR_ANON_KEY_HERE

d) Deploy:
   npx vercel --prod

   Or connect to GitHub for automatic deploys on push.

================================================================================
7. RESTORE DATA FROM BACKUP
================================================================================

The data.json file in this backup contains all journal entries, tagged items,
recipes, trips, milestones, family posts, and app settings.

To restore data:

a) MANUAL SQL APPROACH:
   - Open data.json and use the structured data to write INSERT statements
   - Insert in dependency order:
     1. categories (if custom categories exist beyond seeds)
     2. journal_entries
     3. entry_sections
     4. entry_photos (after uploading photos — see step 8)
     5. tagged_items (includes the Library rich-book columns —
        author/status/format/summary/themes/what_stuck/cover_url/etc.)
     6. tagged_item_recipe_tags
     7. tagged_item_participants
     8. media_tags (seeded by step 3 SQL; insert any user-added rows)
     9. tagged_item_media_tags
    10. trips
    11. trip_entries
    12. baby_profile (UPDATE the existing row)
    13. baby_milestones
    14. family_posts
    15. family_post_photos
    16. baby_name_suggestions
    17. app_settings
    18. baby_shower_event (UPDATE the existing row)
    19. baby_shower_helpers (before tasks — tasks.helper_id FKs here)
    20. baby_shower_guests
    21. baby_shower_tasks
    22. baby_shower_schedule
    23. baby_shower_photos
    24. baby_shower_menu

b) FUTURE RESTORE TOOL:
   - A "Restore from Backup" feature in Settings is planned
   - Upload data.json and it will handle the import automatically

================================================================================
8. RE-UPLOAD PHOTOS
================================================================================

Photos are in the photos/ folder of this backup, organized as:
  photos/{entry_date}/{uuid}.jpg

To re-upload:

a) SUPABASE DASHBOARD:
   - Go to Storage > kristory-photos
   - For each date folder, create the folder and upload the JPG files

b) SUPABASE CLI:
   npx supabase storage cp ./photos/ storage://kristory-photos/ --recursive

c) PROGRAMMATIC:
   Use the Supabase JS client to upload each file:

   const { data, error } = await supabase.storage
     .from('kristory-photos')
     .upload(storagePath, fileBlob, { contentType: 'image/jpeg' })

   The storage_path in data.json matches the path in the photos/ folder.

================================================================================
9. REBUILDING THE APP FROM SCRATCH
================================================================================

If you've lost the source code entirely, the full app can be rebuilt by giving
Claude Code (or any AI coding assistant) the rebuild prompt file:

  THE-KRISTORY-REBUILD-PROMPT.txt

This file (kept separately from this backup) contains the complete
specification for recreating every component, hook, view, and feature.
Combined with this REBUILD-GUIDE.txt and the data.json backup, you can
fully reconstruct The Kristory.

================================================================================
10. USER IDS (IMPORTANT — REFERENCED IN DATA)
================================================================================

These UUIDs are used throughout the database. When rebuilding, create the
users table with these exact IDs so that data.json references remain valid:

${userLines}

================================================================================
END OF REBUILD GUIDE
================================================================================
`
}

// ---- Photo download ----

async function downloadPhotos(
  photos: any[],
  zip: JSZip,
  onProgress: ProgressCallback,
) {
  const photosFolder = zip.folder('photos')!
  const total = photos.length
  const BATCH = 10

  for (let i = 0; i < total; i += BATCH) {
    const batch = photos.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (photo: any) => {
        const url = getStorageUrl(photo.storage_path)
        const resp = await fetch(url)
        if (!resp.ok) return null
        const blob = await resp.blob()
        return { path: photo.storage_path, blob }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        photosFolder.file(result.value.path, result.value.blob)
      }
    }

    onProgress({
      phase: 'Downloading photos',
      detail: `${Math.min(i + BATCH, total)} of ${total}`,
      current: Math.min(i + BATCH, total),
      total,
    })
  }
}

// ---- Estimate size ----

export async function estimateBackupSize(): Promise<{ photoCount: number; estimatedMB: number }> {
  const { count, error } = await supabase
    .from('entry_photos')
    .select('*', { count: 'exact', head: true })
  if (error) throw error
  const photoCount = count ?? 0
  // Rough estimate: ~200KB per resized photo + ~1MB for JSON data
  const estimatedMB = Math.round((photoCount * 200) / 1024 + 1)
  return { photoCount, estimatedMB }
}

// ---- Main export ----

export async function createFullBackup(onProgress: ProgressCallback) {
  // 1. Fetch all data
  const raw = await fetchData(onProgress)

  // 2. Build JSON
  onProgress({ phase: 'Building backup package...' })
  const dataJson = buildDataJson(raw)
  const readme = buildReadme(raw)
  const rebuildGuide = buildRebuildGuide(raw)

  // 3. Create ZIP
  const zip = new JSZip()
  const dateStr = format(new Date(), 'yyyy-MM-dd')
  const folder = zip.folder(`kristory-backup-${dateStr}`)!

  folder.file('data.json', JSON.stringify(dataJson, null, 2))
  folder.file('README.txt', readme)
  folder.file('REBUILD-GUIDE.txt', rebuildGuide)

  // 4. Download photos
  if (raw.photos.length > 0) {
    await downloadPhotos(raw.photos, folder, onProgress)
  }

  // 5. Generate ZIP
  onProgress({ phase: 'Compressing backup...' })
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })

  // 6. Record last backup date
  await supabase
    .from('app_settings')
    .upsert({ key: 'last_backup_date', value: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'key' })

  // 7. Trigger download
  onProgress({ phase: 'Done! Downloading...' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kristory-backup-${dateStr}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

// ---- Backup reminder helpers ----

export async function getBackupSettings(): Promise<{
  lastBackupDate: string | null
  reminderEnabled: boolean
  reminderFrequency: 'weekly' | 'monthly'
}> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['last_backup_date', 'backup_reminder', 'backup_frequency'])

  if (error) throw error

  const map = new Map((data ?? []).map((r: any) => [r.key, r.value]))
  return {
    lastBackupDate: map.get('last_backup_date') ?? null,
    reminderEnabled: map.get('backup_reminder') === 'true',
    reminderFrequency: (map.get('backup_frequency') as 'weekly' | 'monthly') ?? 'monthly',
  }
}

export async function setBackupReminder(enabled: boolean, frequency: 'weekly' | 'monthly') {
  const now = new Date().toISOString()
  await supabase.from('app_settings').upsert([
    { key: 'backup_reminder', value: String(enabled), updated_at: now },
    { key: 'backup_frequency', value: frequency, updated_at: now },
  ], { onConflict: 'key' })
}
