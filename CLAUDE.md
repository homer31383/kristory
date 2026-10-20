# The Kristory

A shared daily journal PWA for Chris and Krista. Both users write their own section for each day, attach photos, audio and video, tag items across categories, keep a book/media Library, track recipes, organize trips, record baby milestones, and plan a shared baby registry. The app also exposes:
- a separate read-only family-facing baby feed at `/family` called **"The Babory"**, behind a PIN;
- a public baby-shower site at `/shower` (and a manager at `/shower/m`), also served on its own custom domain.

**`STATE-SNAPSHOT.md`** (2026-10-17) is the code-verified reference for the full schema, every route, features, storage, and backup gaps. Keep it in sync when you change any of those.

## Tech Stack

- **Framework**: Vite + React 19 + TypeScript 5.9
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` plugin) + CSS custom properties for theming
- **Backend**: Supabase (PostgreSQL + Storage, no auth)
- **Data**: TanStack React Query v5 (`useQuery`, `useMutation`, `useInfiniteQuery`)
- **Routing**: React Router v6 with nested layout routes
- **Rich text**: Tiptap (starter-kit + placeholder)
- **Dates**: date-fns v3
- **PDF export**: jsPDF
- **Backup ZIPs**: JSZip
- **CSV**: papaparse (shower menu import, registry import/export)
- **QR codes**: qrcode (shower photo-upload QR)
- **AI**: `@anthropic-ai/sdk` in Vercel serverless functions under `api/` (model `claude-sonnet-5`)
- **HTML sanitization**: DOMPurify
- **PWA**: vite-plugin-pwa with Workbox (skipWaiting + clientsClaim, auto-update)
- **Hosting**: Vercel (`vercel.json` has SPA rewrite for client-side routes)
- **Source control**: GitHub `homer31383/kristory` (private)

## Critical Rules — Read Before Editing

These rules have caused real bugs in the past. Follow them.

1. **Supabase nested queries MUST use explicit FK hints** with `!column_name` syntax. PostgREST returns a 400 error otherwise because most tables have multiple foreign-key paths.
   - Correct: `sections:entry_sections!entry_id(*, user:users!user_id(name))`
   - Wrong: `sections:entry_sections(*, user:users(name))`
   - Used in `useEntries.ts`, `useTrips.ts`, `useItems.ts`, `useRecipes.ts`, `useBaby.ts`, `useFamilyFeed.ts`.

2. **Photos resize to 1600px max edge, JPEG quality 0.85** before upload. See `resizeImage()` in `src/lib/helpers.ts`. The canvas dimensions use `Math.round(img.width * scale)` — do not change to `Math.floor` or you will get off-by-one rendering glitches on certain devices.

3. **Auto-save debounce is 1.5 seconds** for journal entry editing (`DEBOUNCE_SAVE_MS` in `src/lib/constants.ts`). Do not lower this — Supabase will rate-limit you under sustained typing.

4. **PWA uses `skipWaiting: true` + `clientsClaim: true`** so users get updates on next reload. Do not change without coordinating — could leave users stuck on stale builds.

5. **Dates are local timezone, not UTC**. Stored as `YYYY-MM-DD` in `journal_entries.entry_date`, `tagged_items.item_date`, `baby_milestones.milestone_date`. Always parse with `parse(dateStr, 'yyyy-MM-dd', new Date())` from date-fns. Never use `new Date(dateStr)` directly — that interprets as UTC midnight and shifts the date by a day in many timezones.

6. **`categories.user_id` is NOT NULL**. Always pass the current user ID when creating categories (`useCreateCategory`).

7. **`tagged_items.entry_id` IS nullable** — standalone items (recipes, items added without a journal entry) have `entry_id = null` and use `item_date` instead. Don't assume an `entry_id` exists.

8. **Deploy is manual, run from the user's shell**. The user runs `npx vercel --prod` themselves from their terminal — do not run it from the agent shell unless explicitly asked. Same for `git push` — the user pushes from their Windows terminal.

9. **PowerShell uses `;` for command chaining, NOT `&&`**. The user is on Windows; if you give them a multi-step command, use `;` between commands (or hand them as separate commands).

10. **Family feed `published_at` should use the journal entry's date, NOT the share date**. When creating a `family_posts` row, set `published_at` from the linked entry's `entry_date` (`{entryDate}T12:00:00Z`). The feed timeline groups by entry date so the chronology reflects when things happened.

11. **No `www` subdomain on Vercel URLs**. The deployed origin is `https://the-kristory.vercel.app`. If you need to construct share links, use `window.location.origin` so it works in dev and prod.

12. **API functions use a named `export async function POST(req: Request)`**, never `export default`. The default export is the legacy `(req, res)` signature and Vercel ignores the returned `Response`. Each function also needs a `maxDuration` entry in `vercel.json`. `ANTHROPIC_API_KEY` is server-side only.

13. **Create tables with SQL, not the Supabase Table Editor.** The Table Editor auto-enables RLS, which silently breaks anon writes. Every table must have RLS disabled.

14. **Tables subscribed to realtime need `REPLICA IDENTITY FULL`.** Without it, filtered DELETE events are dropped (see migration 021). Also don't use partial unique indexes as upsert targets.

15. **The agent can't run SQL.** It only has the anon key (PostgREST). The user runs every migration in the Supabase SQL Editor. Ship code that depends on a new column only after the user confirms the migration ran. To check, probe `GET /rest/v1/<table>?select=<col>&limit=1`: 200 means the column exists, 400 means it doesn't.

## User IDs (Hardcoded References)

These UUIDs are referenced throughout production data — never regenerate them:

- **Chris**: `9df51388-65e8-44bf-bfad-65729744190b`
- **Krista**: `cab9d09c-0083-4ce1-aaf5-9a045d8a4315`

The `users` table was set up manually in Supabase; `033_hand_made_tables.sql` recreates it for a rebuild. The `USERS` constant in `src/lib/constants.ts` has empty `id` strings; the actual UUIDs are fetched at runtime from the `users` table by the `UserPicker` view.

## Design System

CSS custom properties defined in `src/index.css` under `:root` (light) and `html.dark` (dark). Components use inline `style={{ color: 'var(--text-primary)' }}` instead of Tailwind color utilities — this is intentional for theming. The `ThemeProvider` toggles `html.dark` based on the user's preference stored in `localStorage('kristory-theme')`.

### Light theme palette
- **Page background**: `#EDE6DE` (warm pinkish beige)
- **Card background**: `#F7F3EF`
- **Card border**: `#DDD5CB`
- **Text primary**: `#2C2522`
- **Text secondary**: `#8C8078`
- **Text muted**: `#B5ADA5`
- **Accent**: `#6B5CA5` (purple — also Chris's color)
- **Chris**: `#6B5CA5` (purple)
- **Krista**: `#D4708F` (pink)

### Baby accents (currently hardcoded, do not adapt to dark mode)
- `#FFF8E7` (warm cream) — milestone cards, baby widget
- `#F0C987` (warm yellow) — milestone borders
- `#F0FAF0` (mint) — baby tag pills

### Typography
- **Headings**: `'Playfair Display', serif` — section titles, view headers, "The Kristory" branding
- **Body**: `'Inter', sans-serif` — everything else
- Both loaded from Google Fonts (cached by Workbox CacheFirst)

## Database Tables

All tables have RLS **disabled**; the app is private and trusts the client. The schema lives in `supabase/migrations/001`–`032`. The full column-level schema is in `STATE-SNAPSHOT.md` §2.

**Not created by any migration here:**
- `users`, `baby_profile`, `baby_milestones`: created manually in Supabase. `033_hand_made_tables.sql` recreates them idempotently (with grants) for a fresh rebuild.
- The core `babylist_*` tables (`registries`, `people`, `catalog_items`, `catalog_tiers`, `custom_items`, `alternatives`, `picks`): created by the standalone Babylist / BabyRegistryExtension repo. That repo shares this database and its migration numbers collide with ours.
- `meals`, `meal_ingredients`, `grocery_categories`: owned by Axiom Tasks.
- The `categories.user_id` column exists live but is in no migration.

All migrations through `032` are applied in production (probed 2026-10-17).

| Table | Purpose |
|---|---|
| `users` | Chris and Krista (manual, not in migrations) |
| `journal_entries` | One row per day, unique by `entry_date` |
| `entry_sections` | One row per (entry, user) — each user's prose for that day |
| `entry_photos` | Photos attached to a journal entry |
| `journal_media` | Audio/video clips on an entry (`kristory-media` bucket, `share_to_family` controls Babory visibility). Migration `031_journal_media.sql` |
| `categories` | Tag categories (Movies, Restaurants, Home Cooking, Baby, etc.) |
| `tagged_items` | Tagged items. Linked to an entry or standalone (recipes, books). Migration 030 added the Library/Books fields: author, status, format, dates, summary, themes, cover_url, favorite, hall_of_fame, isbn, etc. |
| `media_tags` / `tagged_item_media_tags` | Book subcategory tags (Fiction, Art, Memoir, …) and their junction (030) |
| `recipe_tags` | Pasta, Salad, Soup, etc. |
| `tagged_item_recipe_tags` | Many-to-many between tagged_items and recipe_tags |
| `tagged_item_participants` | Many-to-many between items and users (who participated) |
| `trips` | Trip with date range, optional cover photo and summary |
| `trip_entries` | Junction linking trips to journal entries |
| `baby_milestones` | Pregnancy/first-year milestones with optional notes/photos/entry link |
| `baby_profile` | Single row with name, due date, birth date, weight, length, `family_pin` |
| `baby_name_suggestions` | Names suggested via the family feed |
| `family_posts` | Baby updates shared to the family feed |
| `family_post_photos` | Which entry photos are visible in each family post |
| `app_settings` | Key-value store: app_pin, last_backup_date, backup_reminder, backup_frequency, shower_guest_count |
| `baby_shower_event` | Single row: date/time/location/description/registry links + background presentation settings (007, 013–014, 023–027) |
| `baby_shower_guests` | Guest list, RSVP, plus-one, dietary, side L/B, invite/gift/thank-you tracking, jsonb address (007–008, 011, 015) |
| `baby_shower_tasks` / `_schedule` / `_helpers` / `_menu` / `_photos` | Shower prep checklist, day-of schedule, helpers, menu, guest-uploaded photos (009–010, 012, 016–017) |
| `babylist_item_states` / `_catalog_tier_overrides` / `_section_states` / `_extension_tokens` | Registry overlay tables added by this repo (019–022, 028). Core `babylist_*` tables come from the extension repo |

### Table grants (required since Supabase change, Oct 30 2026)

- Every new table in `public` must be granted explicitly in the same SQL that creates it, whether it's a migration file or run in the dashboard SQL editor:
  `grant select, insert, update, delete on public.<table> to anon, authenticated, service_role;`
- Anon needs full CRUD because this app uses the anon key with RLS disabled. Do not copy Supabase's default example, which gives anon select only and will break writes.
- If supabase-js returns "permission denied" on a table with RLS off, check for a missing grant first, before assuming it's an RLS problem.
- To list public tables that are missing anon write access:
  `select table_name from information_schema.tables t where table_schema = 'public' and table_type = 'BASE TABLE' and not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = t.table_name and g.grantee = 'anon' and g.privilege_type = 'INSERT');`

## Key Routes

| Route | View | Notes |
|---|---|---|
| `/` | `UserPicker` | Wrapped in `AppPinLock` |
| `/journal` | `Journal` | Timeline, infinite scroll, baby widget, family feed link |
| `/journal/:date` | `EntryDetail` | Editor with photos, tagged items, trip, milestone, family share |
| `/photos` | `PhotoMemories` | Shuffled gallery of all entry photos (PIN + user, no Layout) |
| `/explore` | `Explore` | "The Library": search, Hall of Fame, Currently Reading, category cards (`/library` redirects here) |
| `/library/books`, `/library/books/:bookId` | `Books`, `BookDetail` | Rich books list/detail, AI summary/themes, bookshelf scan |
| `/library/river`, `/library/:categoryId/river` | `LibraryRiver` | Cover collage (PIN + user, no Layout) |
| `/lists` | `Lists` | Trips, Baby, category grid, suggested trips |
| `/lists/:catId` | `CategoryDetail` | Items in a category with filters |
| `/book-of-food` | `BookOfFood` | Recipe browser |
| `/recipes/:id` | `RecipeDetail` | Single recipe view/edit |
| `/items/:id` | `ItemDetail` | Single tagged item view/edit |
| `/on-this-day` | `OnThisDay` | Same date in previous years |
| `/trips/new` | `CreateTrip` | Trip creation form |
| `/trips/:id` | `TripDetail` | Trip detail with timeline, edit |
| `/baby` | `Baby` | Timeline / Milestones / Firsts / Names tabs, family share card |
| `/registry` | `Registry` | Shared baby registry (Chris & Krista only, realtime) |
| `/settings` | `Settings` | All settings + Backup & Restore |
| `/family` | `FamilyFeed` | **Separate PIN gate, "The Babory"** branding, no Kristory chrome |
| `/family/photos` | `FamilyPhotos` | Babory photo gallery (requires family PIN flag) |
| `/shower` | `BabyShower` | Public shower page: RSVP, photo upload, calendar |
| `/shower/m` | `ShowerManage` | Shower manager (gated by the **family** PIN) |

`/family`, `/family/photos`, `/shower` and `/shower/m` are **NOT** wrapped in `AppPinLock` or `RequireUser`. The family routes have their own PIN gate (`baby_profile.family_pin`, localStorage `kristory-family-pin-ok`) and never query journal entries directly. `/shower/m` reuses that same PIN and flag.

**Custom domain:** on any hostname ending in `leahybernierbabyshower.com`, `App.tsx` serves only `/shower` and `/shower/m`; every other path redirects to `/shower`.

## Architecture Patterns

### Shared Journal
Each day has one `journal_entries` row. Each user gets their own `entry_sections` row per entry (keyed on `entry_id + user_id`). Sections are upserted on conflict. Chris and Krista write independently for the same date.

### Lazy Entry Creation
Entries are created on-demand when the user first types or uploads a photo. The `ensureEntry()` pattern in `EntryDetail.tsx` handles this.

### Cache Invalidation
React Query keys: `['entity']` for lists, `['entity', id]` for singles. Mutations invalidate related keys in their `onSuccess` callbacks. Trip mutations also invalidate `['suggested-trips']` and `['entries']`.

### Theming
CSS custom properties in `:root` (light) and `html.dark` (dark). Use `style={{ color: 'var(--text-primary)' }}` not Tailwind color classes.

### Collapsible Animations
The `collapsible-content` CSS class uses `grid-template-rows: 0fr/1fr` for smooth expand/collapse. Used in Journal timeline, Baby milestones, Family feed timeline.

### Photo Storage
Photos go to the public `kristory-photos` Supabase Storage bucket. URLs are built with `getStorageUrl(path)`.
- **Journal photos:** `{entry_date}/{uuid}.jpg`. They keep their original folder after "Change Entry Date".
- **Shower:** `shower-photos/{uuid}.{ext}` (guest uploads, full resolution), `shower/background.jpg`, `shower/tile.jpg`, and `gifts/{guest_id}.jpg`.

The bucket's storage policies are not in any migration.

### AI Functions (`api/`)
- `parse-ingredients` (Save as Axiom Meal)
- `scan-recipe` (vision, 1–5 pages)
- `scan-bookshelf` (vision)
- `book-ai` (summary / themes / classify)

All use `claude-sonnet-5`, need `ANTHROPIC_API_KEY`, and have `maxDuration` 60/60/60/30 respectively.

### Registry
`/registry` (`src/registry/`) uses a single hard-coded `REGISTRY_ID`. Identity is resolved through `babylist_people.kristory_user_id`. Live sync uses the realtime channel `registry:{id}` plus a presence channel. The Chrome extension pairs through `babylist_extension_tokens`.

### Audio & Video
Clips go to the public `kristory-media` bucket as `{entry_id}/{uuid}.{ext}` (50MB cap), with video posters at `{entry_id}/{uuid}-thumb.jpg`. Uploads use XHR in `src/lib/media.ts` for progress. Players live in `src/components/media/`; use `preload="none"` on the family feed. Deleting a journal entry must call `deleteEntryMediaFiles(entryId)` first: the rows cascade but bucket files don't.

### Family Feed Separation
The `/family` route uses a completely separate page layout. It only ever queries `family_posts`, `family_post_photos`, `entry_photos`, `journal_media` (nested under the post's entry, filtered to `share_to_family`), `baby_profile`, `baby_milestones`, and `baby_name_suggestions` — never journal entries, tagged items, trips, etc.

## Known Quirks / Gotchas

1. **`tsc --noEmit` vs `tsc -b`**: Local `tsc --noEmit` is more lenient. Vercel runs `tsc -b` (build mode) which catches unused variables/imports that `--noEmit` misses. Always run `npm run build` before deploying.

2. **Storage bucket needs RLS policies**: The `kristory-photos` bucket must have public SELECT, INSERT, and DELETE policies. Setting the bucket "public" alone is not enough — Supabase still enforces object-level RLS.

3. **Photo upload canvas math**: Use `Math.round(img.width * scale)` in `resizeImage()`. Other rounding causes off-by-one rendering glitches on some devices.

4. **`baby_profile` and `baby_milestones` were created by hand**: Both tables were created manually in Supabase. `033_hand_made_tables.sql` and the disaster recovery `REBUILD-GUIDE.txt` (generated dynamically in backup ZIPs by `src/lib/backup.ts`) contain the SQL. Keep all three in sync, grants included.

5. **Family feed `published_at` must use entry date**: When creating a `family_posts` row, set `published_at = {entryDate}T12:00:00Z` so the feed timeline reflects when things happened, not when they were shared. Already enforced in `useCreateFamilyPost`.

6. **Vercel SPA routing**: `vercel.json` has a rewrite rule (`/(.*) → /index.html`) so `/family` and other client-side routes work on direct navigation. Without it, users get 404s on hard reloads.

7. **No `www` subdomain**: The deployed origin is `https://the-kristory.vercel.app`. Always use `window.location.origin` in code rather than hardcoding URLs.

8. **PowerShell uses `;` for chaining, not `&&`**: The user is on Windows. When suggesting commands, use `;` (or separate commands).

9. **Constants user IDs are empty strings**: `USERS` in `src/lib/constants.ts` has empty `id` strings — actual UUIDs come from the `users` table at runtime via `UserPicker`. Never hardcode the UUIDs in `constants.ts`.

10. **PWA service worker caching**: PWA auto-updates on reload (`skipWaiting + clientsClaim`). Google Fonts cached with CacheFirst. If styles look stale, check the service worker in DevTools.

11. **CSS variables vs Tailwind**: Most color styling uses inline `style={{ color: 'var(--text-primary)' }}` rather than Tailwind classes. Intentional for theming but means you can't use Tailwind's color utilities for theme colors.

12. **Baby feature hardcoded light colors**: Baby UI (`Baby.tsx`, `Lists.tsx` BabyCard, `Journal.tsx` countdown widget, `EntryDetail.tsx` milestone section) uses hardcoded warm colors (`#FFF8E7`, `#F0C987`, `#F0FAF0`) that don't adapt to dark mode.

13. **`categories.user_id` exists only in the live DB.** It is not in any migration, not in the REBUILD-GUIDE SQL, and not in the `Category` type, but the app always inserts it.

14. **Milestone "Share with family?" prompt is broken.** `handleCompleteMilestone` in `Baby.tsx` never links an entry, so "Share" only navigates to today's entry and doesn't create a post.

15. **PINs are client-side checks.** `app_settings.app_pin` and `baby_profile.family_pin` are plain text and readable with the anon key. The shower manager shares the family PIN.

## Source Control & Deployment

- **Repo**: `github.com/homer31383/kristory` (private)
- **Branch**: `main`
- **Deploy**: User runs `npx vercel --prod` from their own terminal — agent does NOT deploy unless explicitly asked
- **Git push**: User runs `git push` manually from their Windows terminal
- **Pre-deploy check**: Always run `npm run build` locally first — `tsc -b` is stricter than `tsc --noEmit`
- **GitHub CLI**: Installed at `/c/Users/chris/gh/gh.exe` but NOT authenticated. Git push works via Windows credential helper.

## Backup System

The Settings page has a "Backup & Restore" section that exports a ZIP containing:
- `data.json` — fully denormalized JSON of every table
- `README.txt` — human-readable summary with counts
- `REBUILD-GUIDE.txt` — dynamically generated complete rebuild instructions including the full SQL schema, user IDs, storage policies, and step-by-step Vercel/Supabase setup
- `photos/<storage_path>`: every journal photo, downloaded from Supabase Storage
- `media/<path>`: every audio/video clip and video poster from `kristory-media`

**Not covered** (full list in `STATE-SNAPSHOT.md` §9):
- Registry (`babylist_*`) data.
- Shower image files.
- `categories.user_id` in the rebuild SQL.
- IDs and FKs: data.json is denormalized, not a restorable dump.
- `ANTHROPIC_API_KEY` in the guide.
- Restore itself: the button is still "Coming soon".

Backup reminders can be set to weekly or monthly and surface as a card on the Journal home when overdue. State stored in `app_settings`: `last_backup_date`, `backup_reminder`, `backup_frequency`.
