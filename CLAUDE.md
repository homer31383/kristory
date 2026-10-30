# The Kristory

> **Security source of truth:** read `D:\AI\Claude\SECURITY-STATE.md` before changing sign-in, keys, grants, RLS, storage or any public-facing page. It overrides anything in this file that says otherwise (PIN gates, user pickers, RLS off, anon grants, legacy anon or service_role keys, public tables).

A shared daily journal PWA for Chris and Krista. Both users write their own section for each day, attach photos, audio and video, tag items across categories, keep a book/media Library, track recipes, organize trips, record baby milestones, and plan a shared baby registry. The app also exposes:
- a separate baby feed at `/family` called **"The Babory"**: full view for the signed-in household, read-only view for extended family behind a server-checked family PIN;
- `/book`, the **Book Builder** (signed-in household only): printable 7 x 7 in books curated from the journal. See "Book Builder" under Architecture Patterns.
- `/shower`, the full shower page for a signed-in household member and a static "This page is closed" page for everyone else (also on its own custom domain), and the shower manager at `/shower/m` (sign-in required).

**Household lockdown (branch `household-lockdown`, 2026-10-20).** The app signs in with Supabase Auth (email + password, Chris and Krista only, sign-ups disabled). The PIN gates and the user picker are gone. `supabase/lockdown/2026-10-20_kristory.sql` (written, applied by hand) turns RLS on for every Kristory-owned table with a single `public.is_household()` policy, revokes anon, and makes both buckets household-only for listing and writes (public object URLs still work). Rollback: `2026-10-20_kristory_rollback.sql`. `2026-10-20_kristory_setup.sql` created `babory_family_links` for the old private-link feature; `2026-10-20_babory_pin.sql` drops it.

**Babory family PIN (branch `babory-pin`, 2026-10-20).** Run `supabase/lockdown/2026-10-20_babory_pin.sql` (rollback `..._babory_pin_rollback.sql`) BEFORE deploying the `babory-pin` build, and set `BABORY_SESSION_SECRET` on Vercel.

**TODO:** Order Up must move to sign-in or a narrow function, then drop the anon select policy on baby_profile (`baby_profile_anon_read`) and the anon column grant `select (name, birth_date)`, both added by the lockdown SQL. Until then, note that Order Up currently runs `select *` on baby_profile, which fails under the column grant until it asks for `name,birth_date` explicitly.

**Book builder (branch `book-builder`, 2026-10-30).** Run `supabase/migrations/034_book_builder.sql` BEFORE deploying the `book-builder` build: photo uploads write the new `entry_photos` columns and fail without them. `035_book_revoke_extra.sql` revokes truncate, references and trigger on `book_books` and `book_items` (already applied by hand on the live database; idempotent).

**Registry retired (2026-10-20).** `/registry` is a static "This page is closed" page (`ClosedPage`), with no auth or database calls, no realtime and no nav entry. `src/views/Registry.tsx` and `src/registry/` were removed on 2026-10-21, so no `babylist_*` table is read or written at runtime.

**`STATE-SNAPSHOT.md`** (2026-10-17) is the code-verified reference for the full schema, every route, features, storage, and backup gaps. Keep it in sync when you change any of those.

## Tech Stack

- **Framework**: Vite + React 19 + TypeScript 5.9
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` plugin) + CSS custom properties for theming
- **Backend**: Supabase (PostgreSQL + Storage + Auth email/password)
- **Data**: TanStack React Query v5 (`useQuery`, `useMutation`, `useInfiniteQuery`)
- **Routing**: React Router v6 with nested layout routes
- **Rich text**: Tiptap (starter-kit + placeholder)
- **Dates**: date-fns v3
- **PDF export**: jsPDF
- **Backup ZIPs**: JSZip
- **CSV**: papaparse is in `package.json` but `src/` no longer imports it (only untracked local recovery scripts use it); `ShowerManage` has its own CSV parser
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

2. **Photos resize to 1600px max edge, JPEG quality 0.85** before upload. See `resizeImage()` in `src/lib/helpers.ts`. Journal uploads go through `preparePhotoUpload()`, which also makes a 3000 px JPEG 0.9 print copy when the source is larger than 1600 px (book builder). The canvas dimensions use `Math.round(img.width * scale)`. Do not change to `Math.floor` or you will get off-by-one rendering glitches on certain devices.

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

13. **Create tables with SQL, not the Supabase Table Editor.** After the household lockdown, a new Kristory table needs RLS enabled with the single policy `household_only ... for all to authenticated using (public.is_household()) with check (public.is_household())`, no anon grant, and `grant select, insert, update, delete ... to authenticated, service_role`.

14. **Tables subscribed to realtime need `REPLICA IDENTITY FULL`.** Without it, filtered DELETE events are dropped (see migration 021). Also don't use partial unique indexes as upsert targets.

15. **The agent can't run SQL.** It only has the browser key (`VITE_SUPABASE_ANON_KEY`, now an `sb_publishable_` key; PostgREST); after the lockdown that key alone can't read Kristory tables at all, so column probes need a signed-in token. The user runs every migration in the Supabase SQL Editor. Ship code that depends on a new column only after the user confirms the migration ran. To check, probe `GET /rest/v1/<table>?select=<col>&limit=1`: 200 means the column exists, 400 means it doesn't.

## User IDs (Hardcoded References)

These UUIDs are referenced throughout production data — never regenerate them:

- **Chris**: `9df51388-65e8-44bf-bfad-65729744190b`
- **Krista**: `cab9d09c-0083-4ce1-aaf5-9a045d8a4315`

The `users` table was set up manually in Supabase; `033_hand_made_tables.sql` recreates it for a rebuild. The `USERS` constant in `src/lib/constants.ts` has empty `id` strings. At sign-in, `src/hooks/useUser.tsx` matches the Auth account's `user_metadata.name` ("Chris" / "Krista") to a `users` row by name; that row's id (not the Auth user id) is what every `user_id` column references.

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

Before the lockdown SQL runs, all tables have RLS **disabled**. After it, every Kristory-owned table has RLS on with one household policy (the list is in the lockdown file); `users`, `categories`, the core `babylist_*` tables, `babylist_extension_tokens` and the Axiom tables are owned elsewhere and not locked by it. The schema lives in `supabase/migrations/001`–`032`. The full column-level schema is in `STATE-SNAPSHOT.md` §2.

**Not created by any migration here:**
- `users`, `baby_profile`, `baby_milestones`: created manually in Supabase. `033_hand_made_tables.sql` recreates them idempotently (with grants) for a fresh rebuild.
- The core `babylist_*` tables (`registries`, `people`, `catalog_items`, `catalog_tiers`, `custom_items`, `alternatives`, `picks`): created by the standalone Babylist / BabyRegistryExtension repo. That repo shares this database and its migration numbers collide with ours.
- `meals`, `meal_ingredients`, `grocery_categories`: owned by Axiom Tasks.
- The `categories.user_id` column exists live but is in no migration.

All migrations through `032` are applied in production (probed 2026-10-17). `034_book_builder.sql` (2026-10-30) also adds `entry_photos.width`, `height`, `print_path`, `print_width`, `print_height`. `035_book_revoke_extra.sql` is applied (by hand, before the file existed).

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
| `babory_family_pin` | One row (`id = true`): scrypt `pin_hash`, `salt`, `version`, `updated_at`, `updated_by`. Service-role only (RLS on, no policies). `supabase/lockdown/2026-10-20_babory_pin.sql` |
| `babory_family_attempts` | Wrong-PIN counters keyed `ip:<hmac>`, `dev:<hmac>` and `*global*`. Service-role only. Same file, with the `babory_*` security-definer functions |
| `babory_family_lockouts` | One row per new lockout (`kind` 'device' or 'global'), pruned after 7 days. Service-role only. Same file |
| `book_books` | Book builder books: title, `date_from`/`date_to` or `trip_id`, `include_authors` (both/chris/krista), `trim_size` ('7x7'), `bleed_in`, `page_limit` (140), `cover_choice` jsonb. Household RLS. Migration 034 |
| `book_items` | One row per (book, entry): `sort_key`, `included`, `done`, `split_authors`, `hero_photo_id`, `photo_ids` jsonb `[{photo_id, focal_x, focal_y}]`, `hidden_text` jsonb `[{section_id, start, end, snippet, source_hash}]`, `layout_override`, `caption_override`, `pin_side`, `updated_by`. Realtime, REPLICA IDENTITY FULL. Migration 034 |
| `app_settings` | Key-value store: app_pin, last_backup_date, backup_reminder, backup_frequency, shower_guest_count |
| `baby_shower_event` | Single row: date/time/location/description/registry links + background presentation settings (007, 013–014, 023–027) |
| `baby_shower_guests` | Guest list, RSVP, plus-one, dietary, side L/B, invite/gift/thank-you tracking, jsonb address (007–008, 011, 015) |
| `baby_shower_tasks` / `_schedule` / `_helpers` / `_menu` / `_photos` | Shower prep checklist, day-of schedule, helpers, menu, guest-uploaded photos (009–010, 012, 016–017) |
| `babylist_item_states` / `_catalog_tier_overrides` / `_section_states` / `_extension_tokens` | Registry overlay tables added by this repo (019–022, 028). Core `babylist_*` tables come from the extension repo |

### Table grants (required since Supabase change, Oct 30 2026)

- Every new table in `public` must be granted explicitly in the same SQL that creates it, whether it's a migration file or run in the dashboard SQL editor. Since the household lockdown:
  `grant select, insert, update, delete on public.<table> to authenticated, service_role;` (no anon), plus RLS and the `household_only` policy.
- Migrations 001-033 still grant anon; the lockdown SQL revokes it.
- Never grant anon and never disable RLS on a new table. A table only the server touches gets `service_role` alone.
- If supabase-js returns "permission denied" on a table, check for a missing grant first, then check that table's RLS policy.
- To list public tables that are missing authenticated write access (anon is not supposed to have any):
  `select table_name from information_schema.tables t where table_schema = 'public' and table_type = 'BASE TABLE' and not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = t.table_name and g.grantee = 'authenticated' and g.privilege_type = 'INSERT');`

## Key Routes

| Route | View | Notes |
|---|---|---|
| `/` | redirect to `/journal` | Sign-in screen when signed out (`RequireAuth`) |
| `/journal` | `Journal` | Timeline, infinite scroll, baby widget, family feed link |
| `/journal/:date` | `EntryDetail` | Editor with photos, tagged items, trip, milestone, family share |
| `/photos` | `PhotoMemories` | Shuffled gallery of all entry photos (sign-in, no Layout) |
| `/explore` | `Explore` | "The Library": search, Hall of Fame, Currently Reading, category cards (`/library` redirects here) |
| `/library/books`, `/library/books/:bookId` | `Books`, `BookDetail` | Rich books list/detail, AI summary/themes, bookshelf scan |
| `/library/river`, `/library/:categoryId/river` | `LibraryRiver` | Cover collage (sign-in, no Layout) |
| `/lists` | `Lists` | Trips, Baby, category grid, suggested trips |
| `/lists/:catId` | `CategoryDetail` | Items in a category with filters |
| `/book-of-food` | `BookOfFood` | Recipe browser |
| `/recipes/:id` | `RecipeDetail` | Single recipe view/edit |
| `/items/:id` | `ItemDetail` | Single tagged item view/edit |
| `/on-this-day` | `OnThisDay` | Same date in previous years |
| `/trips/new` | `CreateTrip` | Trip creation form |
| `/trips/:id` | `TripDetail` | Trip detail with timeline, edit |
| `/baby` | `Baby` | Timeline / Milestones / Firsts / Names tabs, family share card |
| `/registry` | `ClosedPage` | Retired: static "This page is closed", no auth, no database calls |
| `/settings` | `Settings` | All settings + Backup & Restore |
| `/book` | `BookBuilder` | Book Builder: books list and new-book setup (Lists page card) |
| `/book/:bookId` | `BookReview` | Review contact sheet: page meter, filmstrip of spreads (desktop), quick skips, include/skip (swipe on phone), done, flags, Preview and Print buttons |
| `/book/:bookId/preview` | `BookPreview` | Spread viewer (single pages on phone), scaled with a CSS transform; arrows, swipe, cover style A/B toggle (saved to `cover_choice.style`). Sign-in, no Layout |
| `/book/:bookId/print` | `BookPrint` | Every page as a 7 x 7 in sheet for Save as PDF in desktop Chrome; optional covers; `?test=effects` adds the effects test sheet. Sign-in, no Layout |
| `/family` | `FamilyFeed` | **"The Babory"** branding, no Kristory chrome; household sign-in, or the family PIN screen then the read-only feed when nobody is signed in |
| `/family/photos` | `FamilyPhotos` | Babory photo gallery; same access as `/family` |
| `/shower` | `ShowerRoute` | `BabyShower` for a signed-in household member (`is_household()` check, reads through their session); everyone else gets the static `ClosedPage` and no shower queries run. No sign-in prompt (sign in at `/shower/m`) |
| `/shower/m` | `ShowerManage` | Shower manager; household sign-in |

Every route except `/shower` (household check in `ShowerRoute`, no sign-in prompt), `/registry` and signed-out visits to `/family` is wrapped in `RequireAuth` (`src/components/RequireAuth.tsx`), which shows the sign-in screen (titled "The Babory" / "Shower Manager" on those routes) until a household member is signed in. Sign out is in Settings > Account; it removes all realtime channels and clears the React Query cache. The family routes still never query journal entries directly. `baby_profile.family_pin` still exists in the database but nothing reads it.

**Babory family PIN.** When nobody is signed in, `/family` and `/family/photos` show `FamilyPinScreen`. The PIN goes to `api/babory-unlock.ts`, which checks locks first (5 wrong tries per IP or per device in 15 minutes lock that key for 15 minutes; more than 30 wrong tries in an hour across all devices lock the page for an hour), then compares an scrypt hash with `timingSafeEqual`. Every failure, lockout or missing PIN is the same `401 {"error":"Wrong PIN"}`. A right PIN sets the `babory_session` cookie (httpOnly, Secure, SameSite=Lax, 30 days; `{v, exp}` signed with HMAC-SHA256 and `BABORY_SESSION_SECRET`). `api/babory-feed.ts` (GET) answers only for a valid cookie whose `v` equals the current PIN `version`, so changing the PIN signs every family device out; otherwise 401. It returns only the baby's name and dates, family posts, shared photos (public URLs), shared clips and milestone titles. `api/babory-signout.ts` clears the cookie. The household sets or changes the PIN in Settings > Family Feed (`FamilyPinControls` → `api/babory-pin.ts`, household-only). The PIN is exactly 4 digits, and the server rejects easy ones (`isWeakPin` in `api/_lib/babory.ts`): one digit repeated, runs by 1 up or down (0123…6789, 9876…3210, plus 7890 and 0987), and the baby's birthday as MMDD or DDMM (`birth_date`, or `due_date` while there is no birth date). Settings also shows device and page (global) lockouts in the last 7 days, from the service-only `babory_family_lockouts` table; `babory_register_failure` records one event per new lockout. Family viewers have no Names tab and no writes. Shared server code is in `api/_lib/babory.ts`.

**Custom domain:** on any hostname ending in `leahybernierbabyshower.com`, `App.tsx` serves only `/shower` (same `ShowerRoute`: shower page for the household, closed page for everyone else) and `/shower/m`; every other path redirects to `/shower`.

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
- **Print copies:** `print/{entry_date}/{uuid}.jpg` (3000 px, JPEG 0.9), recorded in `entry_photos.print_path`. Only for uploads larger than 1600 px since migration 034. Deleting the photo removes both files. Not in the backup ZIP.
- **Shower:** `shower-photos/{uuid}.{ext}` (guest uploads, full resolution), `shower/background.jpg`, `shower/tile.jpg`, and `gifts/{guest_id}.jpg`.

The bucket's storage policies are not in any migration.

### AI Functions (`api/`)
- `parse-ingredients` (Save as Axiom Meal)
- `scan-recipe` (vision, 1–5 pages)
- `scan-bookshelf` (vision)
- `book-ai` (summary / themes / classify)

All use `claude-sonnet-5`, need `ANTHROPIC_API_KEY`, and have `maxDuration` 60/60/60/30 respectively.

`babory-unlock`, `babory-feed` and `babory-signout` serve the family PIN flow and don't need a household session (the PIN and the signed cookie are their credentials); `babory-pin` is household-only. Every other function starts with `verifyHousehold(req)` from `api/_lib/household.ts` (import it as `./_lib/household.js`). It reads `Authorization: Bearer <access token>`, validates it at `/auth/v1/user`, then looks the user up in `household_members` with `SUPABASE_SERVICE_ROLE_KEY`. It uses plain fetch, not supabase-js (2.98 would send a key as Bearer), so an `sb_secret_...` key only ever goes in the `apikey` header; legacy JWT keys (now disabled) would also get a Bearer header. Needs `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` on Vercel. Browser callers build headers with `apiHeaders()` from `src/lib/supabase.ts`.

### Registry (retired, code removed)
`/registry` renders `ClosedPage`. The registry code (`src/registry/`, `src/views/Registry.tsx`) was removed on 2026-10-21. The `babylist_*` tables and their migrations are untouched.

### Book Builder
A book is a layer of decisions on top of the journal; it never edits entries, sections or photos (it only fills in `entry_photos` size metadata).
- **Pages are never stored.** `paginate()` in `src/book/paginate.ts` computes them from the items every time, for every screen. Page 1 is a right page. It adds a title page, a chapter opener per trip (always on a right page, blank inserted when needed), blanks for `pin_side`, and a trailing blank so the count is even. Two short photo-less days share a `two-quiet` page. Overflow text and photos continue on extra pages.
- **Layout catalog** is `src/book/catalog.ts`: layout ids, slot rectangles (px on the 672 px page, used for the DPI check and the review thumbnails), text box, tone, and the layout choice. `rankLayouts()` lists every layout that suits a page, best first, by photo count, orientation (portrait-heavy means more than half portrait) and word count, and never lists a layout with more photo slots than photos: milestone first for milestones; 0 photos text-day only; 1 photo full-bleed (no words), then by room for the words (navy-panel 45, navy-frame or navy-top 80, split-day or text-day); 2 photos band-text (portrait-heavy) or two-authors; 3 photos navy-trio, photo-day (all landscape) or grid-day; 4+ navy-trio or white-mosaic. `chooseLayout(needs, avoid)` takes the best one that differs from the page before, so two consecutive pages never get the same automatic layout. Exceptions: a day with no photos has only text-day, text continuation pages are always text-day, and a manual `layout_override` is used as is. Two `two-quiet` pages are never paired back to back. `MANUAL_ONLY_LAYOUTS` (`mid-arch`) is never picked automatically, only by hand (phase 2 picker).
- **Layout components** are in `src/book/layouts/`, one per design file in `docs/book-layouts/` (the `.dc.html` files are the source of truth; do not restyle). Each renders a 672 x 672 px page (7 in at 96 px per inch). `TwoQuiet` and `Blank` are derived pages with no design file. `Main`/`BackCover` are cover option A, `CoverScript`/`BackScript` option B (the default). Shared pieces are in `parts.tsx` (components) and `style.ts` (backgrounds, padding). Every color, font family and body size comes from `src/book/tokens.ts` (`COLOR`, `alpha()`, `SHADE`, `FONT`, `TYPE`); do not put color literals in a layout. `index.tsx` maps layout ids to components (`BookPageView`, `BookCoverView`).
- **SVG defs** (`bk-wc`, `bk-ink`, `bk-sk1`, `bk-sk2`, `bk-sprig`, `bk-leaf`) are in `BookDefs.tsx`. Mount `<BookDefs />` once per screen that shows pages; it is a 0 x 0 svg, not `display: none`, or Chrome drops the filters.
- **Text fitting:** `src/book/fit.tsx` renders the page's own layout offscreen (`renderToStaticMarkup`, photos as empty boxes via `MeasureContext`) and binary-searches how many words fit in its `[data-fit-box]`. It runs after the book fonts load (`useTextFitter`); until then `paginate()` uses word estimates. Text that does not fit continues on `text-day` pages, except a leftover of 40 words or fewer: the page's body type is set smaller (14.5, 14, then 13.5 px, the floor) until it all fits (`BookPage.textScale`, applied by `TextBlocks` through `TextScaleContext`). Only when 13.5 px is not enough does the text continue. The page header uses the design's styles; the date never wraps and the weekday drops below it in narrow columns.
- **Shared hook:** `useBookPagination(bookId)` (`src/hooks/useBookPagination.ts`) gives review, preview and print the same item views, pages and cover data (`src/book/cover.ts`: `cover_choice` first, else the first and last heroes and the last sentence).
- **Print:** `src/book/print.tsx` adds `@page { size: 7in 7in; margin: 0 }` only while the print route is mounted; each `.book-sheet` has `print-color-adjust: exact` and a page break after it (not after the last). `usePrintReady` waits for `document.fonts.ready` and every image before setting `data-book-ready="true"` and enabling Print. Photos use `print_path` when present. Chrome rasterizes every SVG and CSS filter (watercolor sprigs, the cover K outline, the faint cover photo) at 300 ppi; blend modes, gradients, text stroke and `object-fit` stay vector. Book fonts are self-hosted static TrueType files in `public/fonts/book/` (Lora 400, 500, 600, italic 400 and Great Vibes, SIL OFL), declared in `src/book/fonts.css`, so the PDF embeds them as TrueType; Google's variable Lora embedded as Type 3. index.html no longer loads Lora or Great Vibes from Google. The PDF has no bleed yet (phase 4).
- **Lazy loading:** `App.tsx` loads the four book screens with `React.lazy`, so the layouts, the fitter, `react-dom/server` and the book fonts CSS stay out of the main bundle.
- **Flags never remove anything:** no photo, over 180 words, DPI under 200 (soft) or 150 (hard), duplicate photo, text changed since a passage was hidden. Effective DPI uses the print copy's size when there is one, `object-fit: cover` math, and bleed on edges a slot touches.
- **Hidden text** offsets point into the section's plain text from `sectionPlainText()` (`src/book/text.ts`); keep that function deterministic or saved offsets break. `source_hash` is FNV-1a of that text. When it no longer matches, the snippet is looked up again and the item is flagged.
- **Draft:** every entry in range gets a row (`sort_key` = yyyymmdd * 10), photos in journal order, first as hero. Only entries with nothing for the chosen authors start skipped. Entries added later are drafted when the book is opened; items are never deleted when the range shrinks.
- **Sync between Chris and Krista:** last save wins. Realtime on `book_items` merges only `included`, `done`, `updated_by`, `updated_at`, so an open editor is never overwritten; everything else arrives on focus refetch (`staleTime: 0`).
- **Photo sizes:** photos from before 034 are measured in the browser the first time a book uses them, and the size is saved on `entry_photos`.
- Book Builder pages use the `household_only` policy like every other table; no anon access, no server route.

### Audio & Video
Clips go to the public `kristory-media` bucket as `{entry_id}/{uuid}.{ext}` (50MB cap), with video posters at `{entry_id}/{uuid}-thumb.jpg`. Uploads use XHR in `src/lib/media.ts` for progress, sending the session access token as `Authorization` and the browser key (`sb_publishable_`) as `apikey`. Players live in `src/components/media/`; use `preload="none"` on the family feed. Deleting a journal entry must call `deleteEntryMediaFiles(entryId)` first: the rows cascade but bucket files don't.

### Family Feed Separation
The `/family` route uses a completely separate page layout. It only ever queries `family_posts`, `family_post_photos`, `entry_photos`, `journal_media` (nested under the post's entry, filtered to `share_to_family`), `baby_profile`, `baby_milestones`, and `baby_name_suggestions` — never journal entries, tagged items, trips, etc.

## Known Quirks / Gotchas

1. **`tsc --noEmit` vs `tsc -b`**: Local `tsc --noEmit` is more lenient. Vercel runs `tsc -b` (build mode) which catches unused variables/imports that `--noEmit` misses. Always run `npm run build` before deploying.

2. **Storage bucket policies**: Before the lockdown SQL, `kristory-photos` and `kristory-media` have public SELECT/INSERT/DELETE policies. After it, both buckets stay public (public URLs work for anyone), but listing, API downloads, insert, update and delete need a household session (`kristory household ...` policies).

3. **Photo upload canvas math**: Use `Math.round(img.width * scale)` in `resizeImage()`. Other rounding causes off-by-one rendering glitches on some devices.

4. **`baby_profile` and `baby_milestones` were created by hand**: Both tables were created manually in Supabase. `033_hand_made_tables.sql` and the disaster recovery `REBUILD-GUIDE.txt` (generated dynamically in backup ZIPs by `src/lib/backup.ts`) contain the SQL. Keep all three in sync, grants included.

5. **Family feed `published_at` must use entry date**: When creating a `family_posts` row, set `published_at = {entryDate}T12:00:00Z` so the feed timeline reflects when things happened, not when they were shared. Already enforced in `useCreateFamilyPost`.

6. **Vercel SPA routing**: `vercel.json` has a rewrite rule (`/(.*) → /index.html`) so `/family` and other client-side routes work on direct navigation. Without it, users get 404s on hard reloads.

7. **No `www` subdomain**: The deployed origin is `https://the-kristory.vercel.app`. Always use `window.location.origin` in code rather than hardcoding URLs.

8. **PowerShell uses `;` for chaining, not `&&`**: The user is on Windows. When suggesting commands, use `;` (or separate commands).

9. **Constants user IDs are empty strings**: `USERS` in `src/lib/constants.ts` has empty `id` strings; actual UUIDs come from the `users` table at sign-in via `useUser` (see User IDs). Never hardcode the UUIDs in `constants.ts`.

10. **PWA service worker caching**: PWA auto-updates on reload (`skipWaiting + clientsClaim`). Google Fonts cached with CacheFirst. If styles look stale, check the service worker in DevTools.

11. **CSS variables vs Tailwind**: Most color styling uses inline `style={{ color: 'var(--text-primary)' }}` rather than Tailwind classes. Intentional for theming but means you can't use Tailwind's color utilities for theme colors.

12. **Baby feature hardcoded light colors**: Baby UI (`Baby.tsx`, `Lists.tsx` BabyCard, `Journal.tsx` countdown widget, `EntryDetail.tsx` milestone section) uses hardcoded warm colors (`#FFF8E7`, `#F0C987`, `#F0FAF0`) that don't adapt to dark mode.

13. **`categories.user_id` exists only in the live DB.** It is not in any migration, not in the REBUILD-GUIDE SQL, and not in the `Category` type, but the app always inserts it.

14. **Milestone "Share with family?" prompt is broken.** `handleCompleteMilestone` in `Baby.tsx` never links an entry, so "Share" only navigates to today's entry and doesn't create a post.

15. **PINs are gone.** The lockdown SQL deletes `app_settings.app_pin` and sets `baby_profile.family_pin` to null. The column remains, unused.

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
