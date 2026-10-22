# The Kristory — State Snapshot

**Snapshot date:** 2026-10-17
**HEAD:** `28206af` (2026-10-08), plus uncommitted work listed in §8.
**Source of truth:** this file was written from the code in the repo, not from older docs. Live-database facts marked **(probed)** were checked on 2026-10-17 with read-only PostgREST GETs using the anon key: HTTP 200 means the column exists, 400 means it doesn't.

No secrets, keys or PIN values appear in this file.

> **Household lockdown, 2026-10-20 (branch `household-lockdown`).** Sections below are updated for it.
> - Sign-in is Supabase Auth email + password (Chris and Krista; sign-ups disabled). `UserPicker`, `AppPinLock`, `useAppPin` and the Babory / shower-manager PIN gates are removed. `src/hooks/useUser.tsx` resolves the Kristory `users` row by matching the Auth account's `user_metadata.name`.
> - `supabase/lockdown/2026-10-20_kristory.sql` (written, **not applied** at the time of writing) enables RLS with one `household_only` policy (`public.is_household()`) on 28 Kristory-owned tables, revokes anon, deletes `app_settings.app_pin`, and replaces the open storage policies on `kristory-photos` and `kristory-media` with household-only ones. Buckets stay public. Rollback: `2026-10-20_kristory_rollback.sql`.
> - Every household `api/` function verifies the caller (`api/_lib/household.ts`). The Babory family PIN routes (`babory-unlock`, `babory-feed`, `babory-signout`; `babory-pin` is household-only) are described in §3. The private-link feature and `babory_family_links` were replaced by the family PIN (`supabase/lockdown/2026-10-20_babory_pin.sql`, run before deploying; needs `BABORY_SESSION_SECRET`).
> - `/registry` is closed: `ClosedPage` shows a static message with no Supabase calls. `/shower` (2026-10-21) shows `BabyShower.tsx` to a signed-in household member (`ShowerRoute` in `App.tsx` checks `is_household()`, reads through the session) and `ClosedPage` to everyone else, with no shower queries for them. The registry code (`Registry.tsx`, `src/registry/`) was removed on 2026-10-21; its nav entries, realtime channels and `registry.css` import were already gone. No `babylist_*` table is touched at runtime.
> - Order Up exception: the lockdown gives anon a column-level `select (name, birth_date)` on `baby_profile` plus the `baby_profile_anon_read` policy, until Order Up moves to sign-in or a narrow function. Order Up's current `select *` fails under that until it requests `name,birth_date`. The lockdown also sets `family_pin` to null.

---

## 1. Routes (`src/App.tsx`)

### 1a. Custom domain

`AppRoutes` checks `window.location.hostname.endsWith('leahybernierbabyshower.com')`. On that domain the app serves **only** the shower:

| Path | View |
|---|---|
| `/shower` | `ShowerRoute`: `BabyShower` for a signed-in household member, else `ClosedPage` |
| `/shower/m` | `ShowerManage` (household sign-in) |
| `*` | `<Navigate to="/shower" replace>` |

So on the shower domain the journal, `/family`, `/registry` and everything else redirect to `/shower`. The "Visit The Babory →" link on `/shower` is therefore dead on that domain.

Every other hostname gets the full route table below. `vercel.json` has no domain logic. It has one rewrite, `/((?!api/).*) → /index.html`, plus `maxDuration` for each API function.

### 1b. Main route table

| Route | View | Sign-in (`RequireAuth`) | Layout (nav chrome) |
|---|---|---|---|
| `/` | redirect to `/journal` | ✅ | — |
| `/photos` | `PhotoMemories` | ✅ | — |
| `/library/river` | `LibraryRiver` | ✅ | — |
| `/library/:categoryId/river` | `LibraryRiver` | ✅ | — |
| `/family` | `FamilyFeed` ("The Babory") | ✅, or family PIN → read-only feed when signed out | — |
| `/family/photos` | `FamilyPhotos` | ✅, or family PIN → read-only when signed out | — |
| `/shower` | `ShowerRoute` | household member sees `BabyShower`; anyone else the static closed page (no sign-in prompt) | — |
| `/shower/m` | `ShowerManage` | ✅ | — |
| `/journal` | `Journal` | ✅ | ✅ |
| `/journal/:date` | `EntryDetail` | ✅ | ✅ |
| `/explore` | `Explore` (titled "The Library") | ✅ | ✅ |
| `/library` | → `/explore` redirect | ✅ | ✅ |
| `/library/books` | `Books` | ✅ | ✅ |
| `/library/books/:bookId` | `BookDetail` | ✅ | ✅ |
| `/lists` | `Lists` | ✅ | ✅ |
| `/lists/:categoryId` | `CategoryDetail` | ✅ | ✅ |
| `/book-of-food` | `BookOfFood` | ✅ | ✅ |
| `/recipes/:recipeId` | `RecipeDetail` | ✅ | ✅ |
| `/items/:itemId` | `ItemDetail` | ✅ | ✅ |
| `/on-this-day` | `OnThisDay` | ✅ | ✅ |
| `/trips/new` | `CreateTrip` | ✅ | ✅ |
| `/trips/:tripId` | `TripDetail` | ✅ | ✅ |
| `/baby` | `Baby` | ✅ | ✅ |
| `/registry` | `ClosedPage` (retired) | ❌ public, static | — |
| `/settings` | `Settings` | ✅ | ✅ |

`RequireAuth` shows the sign-in screen until a household member is signed in and matched to a `users` row (it also calls `rpc('is_household')`). The session persists in localStorage (`kristory-auth`). Sign out is in Settings > Account; it calls `supabase.removeAllChannels()` and the React Query cache is cleared.

**Removed:** the app PIN (`app_settings.app_pin`, sessionStorage `kristory-pin-unlocked`) and the family PIN gate (`baby_profile.family_pin`, localStorage `kristory-family-pin-ok`). The `family_pin` column still exists but nothing reads it.

**URL quick action:** `?action=new-entry` on any URL is removed from the address bar by `takeQuickAction()`. It is held in sessionStorage `kristory-quick-action` through the sign-in screen, then opens today's entry in the editor.

---

## 2. Database

All app tables run with **RLS disabled** (no Supabase Auth; the client is trusted).

**Shared database.** This Supabase project is shared with:
- **The BabyRegistryExtension repo,** which created the core `babylist_*` tables and has its own, colliding migration numbering.
- **Axiom Tasks,** which owns `meals`, `meal_ingredients` and `grocery_categories`.

### 2a. Tables NOT created by any migration in this repo ⚠️

| Table | Where its schema lives | Notes |
|---|---|---|
| `users` | Dashboard, manually. Rebuild DDL in `033_hand_made_tables.sql` and REBUILD-GUIDE (`backup.ts`). Axiom Tasks' `007_user_system` also creates `users` (adds `avatar_emoji`) in this shared project | `id uuid PK`, `name text NOT NULL`. Chris `9df51388-65e8-44bf-bfad-65729744190b`, Krista `cab9d09c-0083-4ce1-aaf5-9a045d8a4315`. |
| `baby_profile` | Dashboard, manually. Rebuild DDL in `033_hand_made_tables.sql` and REBUILD-GUIDE | `id`, `name`, `due_date date`, `birth_date date`, `birth_weight text`, `birth_length text`, `notes text`, `family_pin text DEFAULT '2026'` (added by 004), `created_at`, `updated_at`. Single row. |
| `baby_milestones` | Dashboard, manually. Rebuild DDL in `033_hand_made_tables.sql` and REBUILD-GUIDE | `id`, `entry_id → journal_entries ON DELETE SET NULL`, `title NOT NULL`, `milestone_type NOT NULL DEFAULT 'custom'`, `milestone_date date NOT NULL`, `notes`, `photo_path`, `created_at`. |
| `babylist_registries`, `babylist_people`, `babylist_catalog_items`, `babylist_catalog_tiers`, `babylist_custom_items`, `babylist_alternatives`, `babylist_picks` | Standalone Babylist / extension repo | This repo's migrations only ALTER or reference them. No DDL here or in the backup. |
| `meals`, `meal_ingredients`, `grocery_categories` | Axiom Tasks app | Written by "Save as Axiom Meal". |

**Column not in any migration ⚠️**
- `categories.user_id` exists live **(probed)** and the app always inserts it (`useCategories.ts:71`; CLAUDE.md says it is NOT NULL).
- It is not in migration 001, not in the REBUILD-GUIDE SQL, and not in the `Category` TypeScript type.

### 2b. Migrations, in order

**`001_kristory_schema.sql`**
- **`journal_entries`:** `id uuid PK DEFAULT gen_random_uuid()`, `entry_date date UNIQUE NOT NULL`, `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`.
- **`entry_sections`:**
  - Columns: `id PK`, `entry_id NOT NULL → journal_entries ON DELETE CASCADE`, `user_id NOT NULL → users`, `content text`, `created_at`, `updated_at`.
  - `UNIQUE(entry_id, user_id)`.
  - `fts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED`, with index `idx_entry_sections_fts` (GIN).
- **`entry_photos`:** `id PK`, `entry_id NOT NULL → journal_entries CASCADE`, `user_id NOT NULL → users`, `storage_path text NOT NULL`, `display_order int DEFAULT 0`, `created_at`.
- **`categories`:**
  - Created only if missing, as `id PK`, `name text NOT NULL UNIQUE`, `emoji`, `is_default boolean DEFAULT false`, `created_at`.
  - If the table already exists, it adds any missing `emoji` / `is_default` / `created_at`. (The live table predates this migration.)
- **Seed `categories`:** Movies 🎬, TV Shows 📺, Restaurants 🍽, Home Cooking 🍳, Activities 🎭, Books 📖, Trips ✈️, Music/Concerts 🎵, Shopping 🛒 (all `is_default=true`, `ON CONFLICT (name) DO NOTHING`).
- **`tagged_items`:**
  - Columns: `id PK`, `entry_id NOT NULL → journal_entries CASCADE` (made nullable in 002), `category_id NOT NULL → categories`, `user_id NOT NULL → users`, `name text NOT NULL`, `rating int CHECK 1–5`, `location_name`, `location_lat decimal`, `location_lng decimal`, `location_place_id`, `created_at`.
  - Index `idx_tagged_items_name`: GIN on `to_tsvector('english', name)`.
- **`trips`:** `id PK`, `title NOT NULL`, `summary`, `cover_photo_path`, `start_date date NOT NULL`, `end_date date NOT NULL`, `created_at`.
- **`trip_entries`:** `trip_id → trips CASCADE`, `entry_id → journal_entries CASCADE`, `PK(trip_id, entry_id)`.
- **Storage bucket** `kristory-photos` (public).
- RLS disabled on all of the above.

**`002_recipes.sql`**
- `tagged_items` gains `ingredients text` and `instructions text`. `entry_id` becomes **nullable**.
- **`recipe_tags`:** `id PK`, `name text NOT NULL UNIQUE`, `emoji`, `created_at`.
- **`tagged_item_recipe_tags`:** `tagged_item_id → tagged_items CASCADE`, `recipe_tag_id → recipe_tags CASCADE`, `PK(both)`.
- **Seed `recipe_tags`:** Pasta, Salad, Soup, Sauce, Sandwich, Protein, Baking, Sweets, Pancakes, Cookies, Sides, Breakfast.

**`003_item_date.sql`**
- `tagged_items.item_date date`.
- **`tagged_item_participants`:** `tagged_item_id → tagged_items CASCADE`, `user_id → users CASCADE`, `PK(both)`.
- Backfills `item_date` from the linked entry, and participants from `tagged_items.user_id`.

**`004_family_feed.sql`**
- **`family_posts`:** `id PK`, `entry_id → journal_entries CASCADE`, `caption`, `published_at timestamptz DEFAULT now()`, `user_id → users`, `created_at`, `updated_at`.
- **`family_post_photos`:** `id PK`, `family_post_id → family_posts CASCADE`, `entry_photo_id → entry_photos CASCADE`, `display_order int DEFAULT 0`.
- `baby_profile` gains `family_pin text DEFAULT '2026'`.

**`005_app_pin.sql`**
- **`app_settings`:** `key text PK`, `value text NOT NULL`, `updated_at`.
- Keys used in code: `app_pin`, `last_backup_date`, `backup_reminder`, `backup_frequency`, `shower_guest_count`.

**`006_baby_names.sql`**
- **`baby_name_suggestions`:** `id PK`, `name text NOT NULL`, `suggested_by text`, `created_at`.

**`007_baby_shower.sql`**
- **`baby_shower_event`:** `id PK`, `event_date date`, `event_time text`, `location_name`, `location_address`, `description`, `registry_links jsonb DEFAULT '[]'`, `created_at`, `updated_at`. **Seed:** one row with `event_date = NULL`.
- **`baby_shower_guests`:**
  - Contact and RSVP: `id PK`, `name NOT NULL`, `email`, `phone`, `address text` (→ jsonb in 011), `rsvp_status text DEFAULT 'pending' CHECK IN ('pending','yes','no','maybe')`, `rsvp_date date`, `plus_one bool DEFAULT false`, `plus_one_name`.
  - Invitations and gifts: `invitation_sent bool DEFAULT false`, `invitation_sent_date date`, `gift_description`, `thank_you_sent bool DEFAULT false`.
  - Other: `notes`, `added_by text DEFAULT 'host'`, `created_at`, `updated_at`.

**`008_shower_dietary_gift_photo.sql`**
- `baby_shower_guests` gains `dietary_needs text` and `gift_photo_path text`.

**`009_shower_tasks_schedule_photos.sql`**
- **`baby_shower_tasks`:** `id PK`, `title NOT NULL`, `completed bool DEFAULT false`, `display_order int DEFAULT 0`, `created_at`.
- **`baby_shower_schedule`:** `id PK`, `time_slot NOT NULL`, `description NOT NULL`, `display_order int DEFAULT 0`, `created_at`.
- **`baby_shower_photos`:** `id PK`, `storage_path NOT NULL`, `uploaded_by`, `created_at`.

**`010_shower_helpers.sql`**
- **`baby_shower_helpers`:** `id PK`, `name NOT NULL`, `role NOT NULL`, `created_at`.

**`011_shower_address_jsonb.sql`**
- `baby_shower_guests.address` becomes `jsonb`. Existing text is moved into `{street: …}`.

**`012_task_helper_colors.sql`**
- `baby_shower_tasks.helper_id → baby_shower_helpers ON DELETE SET NULL`.
- `baby_shower_helpers.color text DEFAULT '#6B5CA5'`.

**`013_shower_images.sql`**
- `baby_shower_event` gains `hero_image_path` and `background_image_path`.

**`014_shower_hero_focal_point.sql`**
- `baby_shower_event.hero_focal_point text DEFAULT '50% 50%'`.

**`015_shower_guest_side.sql`**
- `baby_shower_guests.side text CHECK IN ('L','B')`.

**`016_shower_task_due_date.sql`**
- `baby_shower_tasks.due_date date`.

**`017_shower_menu.sql`**
- **`baby_shower_menu`:** `id PK`, `item_name NOT NULL`, `quantity int DEFAULT 1`, `unit_label text DEFAULT 'servings'`, `notes`, `prepared bool DEFAULT false`, `display_order int DEFAULT 0`, `created_at`.

**`018_baby_registry_kristory_link.sql`**
- `babylist_people.kristory_user_id uuid`.
- Unique index `babylist_people_kristory_user_id_idx` on `(registry_id, kristory_user_id) WHERE kristory_user_id IS NOT NULL`.

**`019_baby_registry_item_states.sql`**
- **`babylist_item_states`:**
  - Columns: `id PK`, `registry_id NOT NULL`, `catalog_item_id`, `custom_item_id`, `state text NOT NULL CHECK IN ('active','muted','saved')`, `updated_at NOT NULL DEFAULT now()`, `updated_by`.
  - FKs: `registry_id → babylist_registries CASCADE`, `catalog_item_id → babylist_catalog_items CASCADE`, `custom_item_id → babylist_custom_items CASCADE`, `updated_by → babylist_people SET NULL`.
  - XOR check `chk_item_states_target`: exactly one of `catalog_item_id` / `custom_item_id` is set.
  - Indexes: partial unique indexes (replaced in 021) and `idx_item_states_registry`.
  - Added to the `supabase_realtime` publication.

**`020_baby_registry_tier_overrides.sql`**
- **`babylist_catalog_tier_overrides`:**
  - Columns: `id PK`, `registry_id NOT NULL`, `catalog_tier_id NOT NULL`, `product`, `price_str`, `unit_cost numeric`, `note`, `url`, `updated_at NOT NULL DEFAULT now()`, `updated_by`.
  - FKs: `registry_id → babylist_registries CASCADE`, `catalog_tier_id → babylist_catalog_tiers CASCADE`, `updated_by → babylist_people SET NULL`.
  - `UNIQUE(registry_id, catalog_tier_id)`; index `idx_tier_override_registry`.
  - Added to realtime.

**`021_baby_registry_realtime_fixes.sql`**
- Rebuilds `uq_item_states_catalog` and `uq_item_states_custom` as non-partial unique indexes, because upsert can't target a partial index.
- `REPLICA IDENTITY FULL` on `babylist_picks`, `babylist_custom_items`, `babylist_alternatives`, `babylist_people`, `babylist_item_states`, `babylist_catalog_tier_overrides`.
- Makes sure all six are in the `supabase_realtime` publication.

**`022_baby_registry_section_states.sql`**
- **`babylist_section_states`:**
  - Columns: `id PK`, `registry_id NOT NULL → babylist_registries CASCADE`, `section text NOT NULL`, `collapsed bool NOT NULL DEFAULT true`, `updated_at`, `updated_by → babylist_people SET NULL`.
  - `UNIQUE(registry_id, section)`; index `idx_section_states_registry`.
  - REPLICA IDENTITY FULL; added to realtime.

**`023`–`027` (shower background)**
- `baby_shower_event` gains:
  - `background_opacity decimal DEFAULT 0.85`
  - `background_zoom decimal DEFAULT 1.0`
  - `bg_fill_color text DEFAULT '#EDE6DE'`
  - `bg_tile_path text`
  - `bg_feather_edges bool DEFAULT true`
  - `bg_tile_count int DEFAULT 5`

**`028_babylist_extension_tokens.sql`**
- **`babylist_extension_tokens`:** `token text PK`, `person_id → babylist_people CASCADE`, `registry_id → babylist_registries CASCADE`, `created_at`, `used_at`.
- Number collision: the extension repo's `023_extension_tokens.sql` creates the same table.

**`029_pick_transferred.sql`**
- `babylist_picks.transferred_at timestamptz`, `transferred_by → babylist_people`.
- Applied to production 2026-10-17 (probed: 200). Picks already marked before then were never saved, so they all start as not transferred.

**`030_library_rich_books.sql`**
- `tagged_items` gains:
  - Text: `subtitle`, `author`, `recommended_by`, `themes`, `summary`, `what_stuck`, `cover_url`, `isbn`, `subcategory`.
  - Status and format: `status text DEFAULT 'want' CHECK IN ('want','reading','read','abandoned','reference')`, `format text CHECK IN ('physical','ebook','audiobook')`.
  - Dates and numbers: `start_date date`, `finish_date date`, `page_count int`.
  - Flags: `favorite bool DEFAULT false`, `hall_of_fame bool DEFAULT false`.
- **`media_tags`:** `id PK`, `name NOT NULL UNIQUE`, `category_type text NOT NULL DEFAULT 'books'`, `created_at`.
- **`tagged_item_media_tags`:** `tagged_item_id → tagged_items CASCADE`, `media_tag_id → media_tags CASCADE`, `PK(both)`.
- **Seed `media_tags`** (all `books`): Fiction, Nonfiction, Art, Memoir, Biography, Poetry, Graphic Novel, Cookbook, History, Science, Philosophy, Self-Help, Fantasy, Sci-Fi, Mystery, Horror, Romance, Travel, Business, Design, Photography, Architecture, Children.

**`031_journal_media.sql`**
- **`journal_media`:**
  - Columns: `id PK`, `entry_id NOT NULL → journal_entries CASCADE`, `user_id NOT NULL → users`, `file_path NOT NULL`, `file_url NOT NULL`, `file_type text NOT NULL CHECK IN ('video','audio')`, `mime_type NOT NULL`, `file_size_bytes bigint`, `duration_seconds numeric`, `thumbnail_path`, `caption`, `share_to_family bool NOT NULL DEFAULT true`, `sort_order int DEFAULT 0`, `created_at`.
  - Index `journal_media_entry_id_idx`.
- **Bucket `kristory-media`** and its storage policies (§6).

**`032_journal_media_file_name.sql`** *(uncommitted)*
- `journal_media.file_name text`.
- Applied to production 2026-10-17 (probed: 200).

---

## 3. Serverless functions (`api/`)

All four are Vercel functions using the Web fetch signature (a named `export async function POST`, not `export default`). All use `@anthropic-ai/sdk` with model **`claude-sonnet-5`** (switched from Sonnet 4.6 in `df4c6c1`). None of them touch Kristory tables or Storage.

**Babory family PIN (`api/babory-*.ts`, shared code `api/_lib/babory.ts`):**
- `babory-unlock` (POST `{pin}`): lock check first (IP key and device-cookie key: 5 wrong in 15 min → 15 min lock; `*global*`: >30 wrong in an hour → 1 h lock), then scrypt + `timingSafeEqual`. Every failure is `401 {"error":"Wrong PIN"}`. Success clears the IP/device counters and sets `babory_session` (httpOnly, Secure, SameSite=Lax, Path=/, 30 days, HMAC-signed `{v, exp}`).
- `babory-feed` (GET): 401 unless the cookie is authentic, unexpired and `v` equals `babory_family_pin.version`; then returns `{ profile: {name, due_date, birth_date}, posts: [...] }` (shared photos with public URLs, `share_to_family` clips, milestone titles). `Cache-Control: no-store`.
- `babory-signout` (POST): clears the cookie. `babory-pin` (household-only): GET `{set, updated_at, lockouts: {device, global}}` (last 7 days, from `babory_family_lockouts`), POST `{pin}` (exactly 4 digits; weak PINs rejected: repeated digit, runs by 1 incl. 7890/0987, baby's birthday MMDD/DDMM or due date if unborn) → `babory_set_pin` (version + 1). Wrong PINs go through `babory_register_failure` (one lockout event per new lockout).
- Env: `BABORY_SESSION_SECRET` (missing → 500, only the name is logged).

**Caller check (lockdown):** the other four each start with `verifyHousehold(req)` from `api/_lib/household.ts`: `Authorization: Bearer <access token>` is validated at `/auth/v1/user`, then the user id is looked up in `household_members` with the service key. Plain fetch, not supabase-js, so an `sb_secret_...` key goes only in `apikey`. 401 without a valid session, 403 for non-members. Server env: `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`. The browser adds the token through `apiHeaders()` in `src/lib/supabase.ts`.

| File | What it does | `max_tokens` | `maxDuration` (file and `vercel.json`) | Env vars |
|---|---|---|---|---|
| `api/parse-ingredients.ts` | Parses free-text recipe ingredients into `{name, quantity, unit, category, notes}[]` for Save as Axiom Meal. The client sends live grocery category names; the function has a fallback list. | 2048 | 60 | `ANTHROPIC_API_KEY` |
| `api/scan-recipe.ts` | Claude vision extracts one structured recipe from 1–5 base64 page photos (jpeg/png/gif/webp). Returns a structured error `code` plus a `debug` payload on failure (codes include `not_configured`, `bad_request`, …). | 4000 | 60 | `ANTHROPIC_API_KEY` |
| `api/scan-bookshelf.ts` | Claude vision reads a bookshelf photo and returns `[{title, author}]`. The client then enriches each book via Open Library / Google Books. | 4000 | 60 | `ANTHROPIC_API_KEY` |
| `api/book-ai.ts` | Actions `summary` (2–3 sentences), `themes` (5–8, comma-separated) and `classify` (picks 2–4 tags from the supplied media-tag list). | 600 | 30 | `ANTHROPIC_API_KEY` |

**Client env vars (Vite):**
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Names are listed in `.env.example`.
- The local scripts in `scripts/` read the same two from `process.env`.

---

## 4. Features

Every commit since 2026-04-01 is dated 2026-05-10 or later; there were no April commits.

Commit `49aab0b` (2026-05-21) first committed a lot of code that had been written earlier but never committed: Babory, shower, App PIN, backup and baby names. "Since April" for those means "landed in git by 05-21".

**★** marks features added or substantially changed since 2026-04-01, with commit and date.

### Journal
- **Timeline** (`Journal.tsx`):
  - Today card / "Write Today's Entry", floating +, "Write a past entry…" date picker.
  - Year → month collapsible groups and infinite scroll.
  - Entry cards with preview, first photo, tag pills and trip badge. Consecutive trip entries collapse into one trip card.
- **Baby countdown/age widget** on the Journal home. Dismissable.
- ★ **Backup-overdue reminder card** with a 7-day snooze (`49aab0b`, 05-21).
- ★ **Inline journal search:** full-text search on `entry_sections.fts` plus item-name ilike, with highlighted excerpts and photo thumbnails (`fe40dfb`, 09-27).
- ★ **Photo Memories (`/photos`):** shuffled infinite gallery of every entry photo (`fe40dfb`, 09-27).
- ★ **URL quick action `?action=new-entry`** (`035c577`, 09-28).
- **Entry detail** (`EntryDetail.tsx`):
  - Two-author sections; your own section uses the TipTap editor (bold/italic only) with 1.5 s debounced autosave. The entry is created lazily.
  - ★ Cursor-jump fix and **"Change Entry Date"** sheet. Moving an entry carries its sections, photos and items, blocks dates that are taken, and moves the linked family post date (`18720ab`, 08-05).
  - ★ Previous/next entry arrows and swipe (`4e9228e`, 09-27).
  - Photos: multi-upload with resize to 1600 px / JPEG 0.85, edit/delete.
  - ★ Clipboard paste of photos (`19d76f3`, 05-21).
  - ★ **Swipeable lightbox:** videos then photos, pinch/double-tap zoom, keys, dots (`28206af`, 10-08).
  - ★ **Audio and video attachments:**
    - 50 MB cap, XHR upload progress, video poster thumbnails (`b866962`, 10-08).
    - Reorder, caption, per-clip "share to family", delete.
    - *(Uncommitted)* editable **clip names** shown above the audio player.
  - Tagged items: add via AddItemSheet (category, name, rating, place; recipe fields for Home Cooking), delete.
  - Trip link: add to a matching or any trip, create a new one, remove.
  - Baby milestone link: presets or custom. ★ "Mark as incomplete" (`68ea4ff`, 05-26).
  - ★ **Share to Family:** caption, photo picker, update/remove (`49aab0b`, 05-21). Per-clip media sharing (`b866962`, 10-08).
- **On This Day** (`/on-this-day`): the same date in other years.
- **Import Journal** (in Settings): `.txt` with dated paragraphs or lines, preview, imports into the current user's section, skips existing ones.

### Library
- ★ **The Library** (`/explore`), renamed from Explore with categories split from Lists (`6de391f`, 05-26):
  - Search box; Hall of Fame row (cap 20); Currently Reading row.
  - Always-on category cards: Books, Movies, TV Shows, Restaurants, Music/Concerts, Activities. Tapping a missing category creates it (`26daee2` / `731dc0c`, 05-26).
  - ★ River button (`fe40dfb`, 09-27).
- ★ **Books** (`/library/books`): status pills (Want / Reading / Read / Art / Favorites, `?status=`), tag filter, sort, search, add (`199d83a`, 05-26).
- ★ **Book detail:** cover, title, author, rating, favorite, Hall of Fame, status, format, dates, tags, recommended-by, summary, themes, what stuck, ISBN, pages, delete (`199d83a`, 05-26).
- ★ **AI ✨ Generate** for summary and themes (`709bb7b`, 05-26).
- ★ **Add Book sheet:** Open Library and Google Books lookup (`199d83a`, 05-26).
- ★ **Scan bookshelf:** Claude vision, review list, lookup, saved as "read" (`709bb7b`, 05-26).
- ★ **Generate All** batch summaries, themes and tags (`30ad97e`, 05-26).
- ★ **Classify All:** auto-assigns media tags (`63cf3b4`, 05-26).
- ★ **Library River** (`/library/river`, `/library/:categoryId/river`): shuffled cover collage (`fe40dfb`, 09-27).

### Lists
- **Trips:** list, Create Trip (`/trips/new`: range, entries, cover, summary), Trip detail (stats, mini-timeline, photo grid, items by category; edit/delete).
- **Suggested trips:**
  - Detected from travel keywords, locations and batch-import runs.
  - Create or dismiss; dismissals are stored in localStorage.
- **Baby card** on Lists.
- ★ **Category grid:** default list categories (Home Cooking, Shopping) always shown; collapsed by default with state saved in localStorage (`26daee2` / `731dc0c`, 05-26).
- **Category detail:** sort, add standalone item (participants, rating, location, optional date or entry link), item detail and edit/delete.
- **Book of Food:**
  - Recipe browser with tag filter and sort; SuggestionModal (Tonight / Plan the week / by ingredient / Surprise, weighted by rating).
  - ★ Recipe search over name, ingredients and instructions (`fe40dfb`, 09-27).
- **Recipe detail and Add/Edit Recipe sheet.** There is no recipe delete on the detail page.
- ★ **Scan Recipe:** Claude vision, up to 5 pages, prefills AddRecipeSheet (`2a8122f`, `2b04b56`, 05-21). Diagnostics and a copyable error panel (`9ae4fce`, `695b18b`, 09-27).
- ★ **Save as Axiom Meal:** Claude parses ingredients, which you edit and then write to Axiom's `meals` / `meal_ingredients` (`144a0c2`, 05-21).
- **Import Recipes** (in Settings): Book of Food `.txt` into Home Cooking.

### Baby (`/baby`)
- **Header:** pregnancy week countdown or age. Edit profile inline: name, due/birth date, weight, length.
- **Tabs:** Timeline (milestones plus Baby-tagged entries, "Shared" badge) / Milestones / Firsts ("Book of Firsts") / ★ Names.
- **Milestones:** preset Pregnancy (7) and First Year (10) checklists with progress bars; tap to complete with today's date. Edit date/notes, remove, custom milestones.
- ★ **"Mark as incomplete"** on preset milestones (`cfd7370`, 05-26).
- ★ **Family Feed share card:** native share, SMS, email or copy of the link (`49aab0b`, 05-21). The PIN was dropped in the lockdown; viewers must sign in.
- ★ **Baby Shower manager link** (`49aab0b`).
- ★ **"Share with family?" prompt** after completing a milestone (`49aab0b`). **Broken, see §7.**
- ★ **Names tab:** view and delete family suggestions (`49aab0b`).

### Babory (`/family`, `/family/photos`)
All ★ `49aab0b` (05-21) unless noted.
- **Separate layout:** household sign-in (was a PIN gate before the lockdown); "not set up" screen when there is no `baby_profile`; light theme forced.
- **Header:** "The Babory" with the baby's age or due countdown. ★ Gallery icon (`fe40dfb`, 09-27).
- **Updates tab:** year → month timeline keyed by entry date. Post cards show a milestone badge, caption preview and thumbnail. ★ "▶ N videos · ♪ N audio" label (`b866962`, 10-08).
- **Post detail:**
  - Milestone banner and caption.
  - ★ Inline audio and video, `preload="none"`, only `share_to_family` clips (`b866962`).
  - ★ Swipeable lightbox (`28206af`, 10-08).
  - ★ Deep link `?post=<id>` (`fe40dfb`).
- **Names tab:** family suggests names, shown as chips.
- ★ **Family Photos** (`/family/photos`): shuffled masonry of all shared photos, infinite scroll, taps through to the post (`fe40dfb`, 09-27).

### Shower (`/shower`, `/shower/m`, custom domain)
All ★ `49aab0b` (05-21) unless noted.
- **Public page:**
  - Countdown; event card (when, where with a Maps link, description as HTML, registry links).
  - ★ ICS "Add to Calendar", fixed 11:30–2:00 ET (`d8dc54e`, 08-01).
  - RSVP form: matches an existing guest by name, otherwise adds them as a guest. Dietary needs field.
  - **Share Your Photos:** ★ full-resolution guest uploads (`d8dc54e`), ★ drag & drop (`f51a5cf`, 08-01), ★ fullscreen viewer (`62075b2`, 08-01), ★ `#photos` anchor (`5ece417`, 08-01).
  - Background presentation: focal point, zoom, overlay, fill, tile, feather.
  - The public guest list was removed (`d8dc54e`).
- **Manager** (household sign-in):
  - Stats strip; collapsible sections.
  - Event details editor; background settings with live preview.
  - "Send RSVP link" (type SEND; mailto/SMS; marks guests invited).
  - Day-of schedule; helpers with colours; prep checklist (due dates, assignee).
  - Menu with Pottery Cellar CSV import.
  - ★ Guest photos admin: ZIP download, safer delete (`d8dc54e`).
  - ★ Photo-upload QR code (`5ece417`, 08-01).
  - Merge unmatched RSVPs.
  - Guest list: filters, add/edit, side L/B, invite/RSVP/gift/thank-you tracking, gift photo, Print TY, CSV, Export for Minted.

### Registry (`/registry`) — RETIRED 2026-10-20
The route now shows `ClosedPage`. The code described below was removed on 2026-10-21 (`src/registry/`, `src/views/Registry.tsx`); this section is history. The `babylist_*` tables and migrations 018-022 and 028 are untouched.

Everything here is ★ since `1ca0a38` (05-10). Single hard-coded `REGISTRY_ID`.
- **Access:** locked to Chris and Krista via `babylist_people.kristory_user_id` (`9cd0a31`, 05-19).
- **Overview:** dashboard totals (Budget/Mid/Premium/your picks), per-person totals, presence dot. Filter bar (priority, where to buy, mine, hide muted, saved only, "Not yet on Babylist").
- **Sections:** collapse shared live via realtime; jump menu; "Open N picked ↗".
- **Item cards:** mute, save for later, activate; custom items with an image URL (`d716b41`, 05-20); alternatives; Google "Search best" with saved refiners.
- **Tier cards:** pick toggle and quantity; per-registry override edit with reset; ★ "Mark on Babylist" (`ad11e39`, 05-24).
- **Import/export:** CSV export; CSV import (replace or merge).
- **Extension:** ★ Pair Chrome extension token (`10265ca`, 05-20).
- **Live sync:** realtime updates animate in place.

### Settings (`/settings`)
- Appearance: Light / Dark / System.
- Account: signed-in name and email, Sign out (replaced App PIN in the lockdown).
- Categories: edit and delete.
- Trips list.
- Baby profile and "show countdown" toggle.
- ★ Family Feed: copy link, view (`49aab0b`).
- Import Journal and Import Recipes.
- Export Data as JSON or PDF. This is lossy, see §9.
- App Updates: "Check for Updates".
- About shows "Version 1.0.0".

### Backup (Settings → Backup & Restore)
- ★ **Full backup ZIP** (`49aab0b`, 05-21): "Prepare" estimates the size, then "Download" runs it with phase and progress display. Contents:
  - `data.json`, `README.txt` and a dynamic `REBUILD-GUIDE.txt`.
  - `photos/<storage_path>`.
  - ★ `media/<path>` (`b866962`, 10-08).
- ★ Rebuild SQL covers media tags, Library fields and the full shower schema (`2d1907c`, 05-26).
- **Reminders:** weekly or monthly, stored in `app_settings`.
- **Restore** is a disabled "Coming soon" button.

---

## 5. Dependencies (`package.json`, version 1.0.0)

**dependencies**

| Package | Version |
|---|---|
| @anthropic-ai/sdk | ^0.97.1 |
| @supabase/supabase-js | ^2.98.0 |
| @tanstack/react-query | ^5.90.21 |
| @tiptap/extension-placeholder | ^2.27.2 |
| @tiptap/react | ^2.27.2 |
| @tiptap/starter-kit | ^2.27.2 |
| @types/papaparse | ^5.5.2 |
| date-fns | ^3.6.0 |
| dompurify | ^3.3.1 |
| dotenv | ^17.3.1 |
| jspdf | ^2.5.2 |
| jszip | ^3.10.1 |
| papaparse | ^5.5.3 |
| qrcode | ^1.5.4 |
| react | ^19.2.0 |
| react-dom | ^19.2.0 |
| react-router-dom | ^6.30.3 |

**devDependencies**

| Package | Version |
|---|---|
| @eslint/js | ^9.39.1 |
| @tailwindcss/vite | ^4.2.1 |
| @types/dompurify | ^3.0.5 |
| @types/node | ^24.10.1 |
| @types/qrcode | ^1.5.6 |
| @types/react | ^19.2.7 |
| @types/react-dom | ^19.2.3 |
| @vitejs/plugin-react | ^5.1.1 |
| eslint | ^9.39.1 |
| eslint-plugin-react-hooks | ^7.0.1 |
| eslint-plugin-react-refresh | ^0.4.24 |
| globals | ^16.5.0 |
| tailwindcss | ^4.2.1 |
| typescript | ~5.9.3 |
| typescript-eslint | ^8.48.0 |
| vite | ^7.3.1 |
| vite-plugin-pwa | ^1.2.0 |

**Scripts:**
- `dev`: `vite`
- `build`: `tsc -b && vite build`
- `lint`: `eslint .`
- `preview`: `vite preview`

**Build configuration:**
- **PWA** (`vite.config.ts`): `registerType: 'autoUpdate'`, `skipWaiting` and `clientsClaim`, Google Fonts cached CacheFirst. Manifest: "The Kristory", theme `#6B5CA5`, background `#EDE6DE`.
- **Manual chunks:** vendor, supabase, editor, pdf.

---

## 6. Storage

### `kristory-photos` (public)
Created in 001. URL builder: `getStorageUrl()` in `src/lib/helpers.ts`.

| Path | Written by |
|---|---|
| `{entry_date}/{uuid}.jpg` | Journal photos (`entry_photos.storage_path`). Photos keep their original date folder after "Change Entry Date". |
| `shower-photos/{uuid}.{ext}` | Guest shower uploads, full resolution (`baby_shower_photos`) |
| `shower/background.jpg` | Shower hero/background (upsert; old file removed first) |
| `shower/tile.jpg` | Shower tile texture (upsert) |
| `gifts/{guest_id}.jpg` | Guest gift photos (upsert) |

`baby_milestones.photo_path` is only ever read; no code writes it.

**Policies:** none are in any migration ⚠️. Before the lockdown, public SELECT, INSERT and DELETE exist on `storage.objects` for this bucket; their live names are unconfirmed (the REBUILD-GUIDE says "Public read/insert/delete", the old rebuild prompt says "Allow public uploads/reads/updates/deletes"). After the lockdown SQL: `kristory household photos select|insert|update|delete`, `to authenticated`, `bucket_id = 'kristory-photos' and public.is_household()`. The bucket stays public, so public object URLs still load for anyone. AnyoneCanParent also uploads here under `acp/` and needs a signed-in session after the lockdown.

**Reads:** the app displays every image through public URLs (`getStorageUrl()`, `/storage/v1/object/public/...`). Nothing calls `.list()`. `.download()` is used only by the shower manager's photo ZIP (signed in), and `.remove()` before deletes/upserts.

### `kristory-media` (public, 50 MB limit)
Created in 031.
- **Allowed MIME types:** `video/mp4`, `video/webm`, `video/quicktime`, `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/ogg`, `audio/webm`, `audio/wav`, `audio/x-wav`, `image/jpeg`.
- **Paths:** `{entry_id}/{uuid}.{ext}`, with video posters at `{entry_id}/{uuid}-thumb.jpg`.
- **Upload:** raw XHR POST with `x-upsert: false`, for progress reporting (`src/lib/media.ts`). Sends the session access token as `Authorization` and the anon key as `apikey`.
- **URL builder:** `getMediaUrl()`.
- **Policies (031):** "kristory-media public read" (select), "public insert" (insert), "public delete" (delete). No update policy. The lockdown SQL replaces them with `kristory household media select|insert|update|delete` (authenticated + `is_household()`); the bucket stays public.
- **Deleting an entry** must call `deleteEntryMediaFiles(entryId)` first. The rows cascade but the files don't.

`api/` never touches Storage. No other buckets are used.

---

## 7. Known quirks, gotchas and rules

### Rules future builds must follow
1. **Supabase nested selects need explicit FK hints** (`users!user_id`, `journal_entries!entry_id`). Without them PostgREST returns 400 because of ambiguous paths. Registry tiers use `!fk_tiers_catalog_item`.
2. **Photo resize:** 1600 px max edge, JPEG 0.85, `Math.round(img.width * scale)` in `resizeImage()`. Never use `Math.floor`. Shower guest uploads are deliberately full resolution.
3. **Autosave debounce is 1.5 s** (`DEBOUNCE_SAVE_MS`). Don't lower it.
4. **Keep PWA `skipWaiting` and `clientsClaim`.**
5. **Dates are local `YYYY-MM-DD`.** Parse with `parse(s, 'yyyy-MM-dd', new Date())`, never `new Date(s)`.
6. **Always pass `user_id` when creating a category.**
7. **`tagged_items.entry_id` is nullable.** Standalone items use `item_date`.
8. **`family_posts.published_at` = `{entryDate}T12:00:00Z`.** "Change Entry Date" also moves it.
9. **Use `window.location.origin` for share links;** never hardcode a domain. The deployed origin is `https://the-kristory.vercel.app` (no `www`). Exception: the ICS UID hardcodes `@the-kristory.vercel.app`, which is cosmetic.
10. **Colours come from CSS variables via inline `style`,** not Tailwind colour classes. Baby accents `#FFF8E7` / `#F0C987` / `#F0FAF0` are hardcoded light-only. The Babory forces light colours.
11. **API functions must use a named `export async function POST`,** not `export default`, and need a `maxDuration` entry in `vercel.json`.
12. **The `ANTHROPIC_API_KEY` stays server-side only.**
13. **Run `npm run build` before deploying.** It uses `tsc -b`, which is stricter than `tsc --noEmit`.
14. **The user deploys** (`npx vercel --prod`), **pushes git** and **runs SQL in the Supabase SQL Editor**. The agent has only the anon key; it has no DDL access.
15. **The user is on PowerShell.** Chain commands with `;`, not `&&`.
16. **Migration numbering collides with the BabyRegistryExtension repo,** which shares this database. Check which repo's sequence is meant.
17. **Create tables with SQL, not the Table Editor.** The Table Editor auto-enables RLS, which breaks anon writes. Every table here must have RLS disabled.
18. **Realtime-subscribed tables need `REPLICA IDENTITY FULL`.** Otherwise filtered DELETE events are dropped (see 021).
19. **Don't create partial unique indexes on upsert targets** (see 021).

### Current known issues (found while writing this snapshot)
- **Registry transfer marks were reset.** Migration 029 went in on 2026-10-17. Before that, "Mark on Babylist" writes failed, so every pick starts as not transferred and must be marked again.
- **The Baby milestone "Share with family?" prompt never creates a post.** `handleCompleteMilestone` (`Baby.tsx:151`) doesn't link an entry, so `result.entry_id` is always null and "Share" just navigates to `/journal/{today}`.
- **After the lockdown SQL, `/shower` stops working for guests:** anon can't read the event, RSVP, or upload photos. The Babory is household-only except through the family PIN.
- **"Visit The Babory →" on `/shower` is dead on the shower custom domain,** which redirects it back to `/shower`.
- **The shower ICS is hardcoded** to 11:30 AM–2:00 PM America/New_York.
- **Version mismatch:** Settings → About shows "Version 1.0.0", but backups write `app_version: '1.1.0'`.
- **Unused hooks:** `useAddBabyName`, `useFamilyPosts`, `useFamilyFeedProfile`, `usePublicShowerGuests`.
- **No tests.**

---

## 8. `git log --oneline -40`

Uncommitted at snapshot time:
- Clip names: `src/lib/media.ts`, `src/hooks/useMedia.ts`, `src/components/media/*`, `src/types/index.ts`, `src/lib/backup.ts`, and `supabase/migrations/032_journal_media_file_name.sql`.
- Recovery scripts and CSVs: `recovery-phase1.sql`, `scripts/recovery-*.js`, `registry-picks-*.csv`.
- `.claude/settings.local.json`.

```
28206af Swipeable photo lightbox for entries and the Babory
b866962 Audio and video attachments on journal entries
035c577 Add URL quick action: ?action=new-entry opens today's composer
df4c6c1 API: switch all four Claude functions from Sonnet 4.6 to Sonnet 5
695b18b Scan modal: show/copy error details for phone debugging
9ae4fce Recipe scanner: structured diagnostics for failed scans
4e9228e Entry detail: previous/next entry navigation with swipe support
fe40dfb Search: inline journal search + Book of Food recipe search
18720ab Journal: fix cursor jump while typing + editable entry date
5ece417 Shower: photo upload QR code section in manager
62075b2 Shower: fullscreen photo viewer with prev/next navigation
f51a5cf Shower: drag & drop photo upload on Share Your Photos card
d8dc54e Shower: full-res guest uploads, admin photo ZIP download + safer delete
68ea4ff EntryDetail: Mark linked baby milestone as incomplete
cfd7370 Baby: "Mark as incomplete" action for preset milestones
2d1907c Backup: include media_tags + Library rich fields + full shower SQL
63cf3b4 Books: Classify All — auto-assign media tags via Claude
30ad97e Books: Generate All — batch summaries + themes
731dc0c The Library + Lists: always-on default categories
26daee2 The Library + Lists: card-based browse, collapse-by-default Lists
709bb7b The Library: AI summary/themes + bookshelf scanner
199d83a The Library: rich Books surface
6de391f The Library: foundation — rename Explore, split categories, rich-fields schema
9581e0a Fix "Open N picked" — stop filtering on transferred_at
e7fcdb8 Add "Open N picked" button to registry section headers
ad11e39 Add per-pick "Transferred to Babylist" tracking
2b04b56 Scan Recipe: support multiple photos per recipe
19d76f3 Add clipboard paste for photos in entry detail
2a8122f Add "Scan Recipe" — extract recipes from photos via Claude vision
0a17e61 Fix parse-ingredients export signature (named POST, not default)
f899e72 Raise client parse timeout to 55s
57127a7 Raise parse-ingredients timeout to 60s and log on entry
40081ca chore: commit all pending files for repo coherence
49aab0b Commit pending app source so the production build resolves
09d0fbc force rebuild
e39303c trigger deploy
144a0c2 Add "Save as Axiom Meal" to recipes
d716b41 Custom item editing + image field + RLS safety on 028
10265ca Add Pair Chrome extension flow to registry
9cd0a31 Lock registry to Chris and Krista; remove person-creation paths
```

---

## 9. What the backup export does NOT cover

### Missing tables
- **No registry data at all.** Every `babylist_*` table is missing from both `data.json` and the rebuild SQL, along with their realtime publication and replica-identity setup.
- **Axiom tables** (`meals`, `meal_ingredients`, `grocery_categories`). They are owned by the other app, but "Save as Axiom Meal" depends on them.

### Schema gaps in REBUILD-GUIDE.txt
- **`categories.user_id` is missing.** On a rebuilt database every category insert fails. That covers Settings → Add Category, new categories in AddItemSheet, and the auto-created Library/Lists cards.
- **`INSERT INTO baby_profile` is not guarded.** Re-running the SQL creates a second row, and then `.maybeSingle()` errors.
- **No storage policies for `kristory-photos` in the main SQL.** They appear only as an optional extra step.

### data.json is a denormalized view, not a restorable dump
- **All primary and foreign keys are dropped.** Links survive only through nesting or names:
  - Trips are linked to entries by **title** only. Two trips with the same name collide, and an entry in two trips keeps only one.
  - `baby_milestones.entry_id` is dropped, so the milestone ↔ entry links are lost.
  - `family_post_photos` become storage paths, and `display_order` is dropped.
- **Dropped `created_at`** on items, milestones, posts and name suggestions. The "Recent" sorts depend on these.
- **`tagged_items.user_id` (the creator) is dropped.** Participants survive.
- **`categories.user_id`** and all tag/category IDs are dropped.
- **`app_pin` is skipped** when writing `app_settings` to data.json (and the lockdown deletes the row). Still treat backup ZIPs as sensitive.

### Files not in the ZIP
- **All shower images:** guest photos `shower-photos/*`, `shower/background.jpg`, `shower/tile.jpg`, gift photos `gifts/*`. The rows are in data.json, but the files are not downloaded.
- **`baby_milestones.photo_path` files.**
- **Failed photo or media downloads are skipped silently.** The ZIP doesn't list what's missing.
- **No source code.** The guide refers to `THE-KRISTORY-REBUILD-PROMPT.txt`, which isn't in the ZIP.

### Config and environment
- **`ANTHROPIC_API_KEY` is never mentioned in the guide** (only the two `VITE_*` vars are). Without it, AI scan, parse and book features fail after a rebuild.
- **Not documented in the guide:**
  - `vercel.json` (SPA rewrite and function durations).
  - The `leahybernierbabyshower.com` custom domain and its routing.
  - The shared-database relationship with the extension repo and Axiom.

### Browser state (never backed up)
- **localStorage:** theme, baby-widget hidden, backup snooze, dismissed trip suggestions, Lists open state, shower-manager collapse state, registry search refiners.
- **sessionStorage:** quick action. (The Auth session lives in localStorage `kristory-auth`.)

### No restore
- Settings → Restore is a disabled "Coming soon" button.
- Recovery is manual: run the SQL, re-upload files, then hand-import from the denormalized JSON.
