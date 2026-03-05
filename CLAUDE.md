# The Kristory

A shared daily journal PWA for a couple (Chris & Krista). Both users write their own section for each day, tag items across categories, share photos, track recipes, organize trips, and record baby milestones — all in a warm, book-like UI.

## Tech Stack

- **Framework**: React 19 + TypeScript 5.9
- **Build**: Vite 7.3 with `tsc -b && vite build`
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` plugin) + CSS custom properties for theming
- **Backend**: Supabase (PostgreSQL, Storage, no auth — see Auth Model below)
- **Data fetching**: TanStack React Query v5 (`useQuery`, `useMutation`, `useInfiniteQuery`)
- **Routing**: React Router v6 with nested layout routes
- **Rich text**: Tiptap editor (starter-kit + placeholder extension)
- **PDF export**: jsPDF
- **Date handling**: date-fns v3
- **HTML sanitization**: DOMPurify
- **PWA**: vite-plugin-pwa with Workbox (auto-update, Google Fonts caching)

## Running Locally

```bash
npm install
cp .env.example .env   # Fill in Supabase credentials
npm run dev            # Vite dev server at localhost:5173
npm run build          # tsc -b && vite build → dist/
npm run preview        # Preview production build
```

## Deployment

Hosted on Vercel. Deploy with:
```bash
npx vercel --prod
```
No `vercel.json` — Vite's default static output works with Vercel's auto-detection.

## Auth Model

There is **no Supabase Auth**. The app uses a simple user picker (`UserPicker.tsx`) on first load. A `users` table exists in Supabase with two rows (Chris and Krista). The selected user is stored in React context (`useUser` hook) — not persisted across page reloads. RLS is **disabled on all tables**.

The `users` table is NOT created by our migrations — it was created manually in Supabase. User IDs in `src/lib/constants.ts` are empty strings (the actual UUIDs are fetched at runtime from the `users` table).

## File Structure

```
src/
├── main.tsx                  # React root, StrictMode
├── App.tsx                   # Routes + providers (QueryClient, Theme, User, Router)
├── index.css                 # Tailwind import, CSS variables, theme, Tiptap styles
├── types/index.ts            # All TypeScript interfaces
│
├── lib/
│   ├── supabase.ts           # Supabase client (reads VITE_SUPABASE_URL/KEY)
│   ├── constants.ts          # User stubs, debounce timings, image constants
│   ├── helpers.ts            # Date formatting, HTML truncation, image resize, storage URLs
│   ├── export.ts             # JSON and PDF export functions
│   ├── import-parser.ts      # Google Doc journal import parser (two formats)
│   └── recipe-parser.ts      # "Book of Food" recipe file parser with auto-tagging
│
├── hooks/
│   ├── useUser.tsx           # UserContext provider + hook (no auth, just identity)
│   ├── useTheme.tsx          # ThemeContext with light/dark/system, localStorage
│   ├── useEntries.ts         # Journal CRUD, infinite scroll, search, On This Day
│   ├── useCategories.ts      # Category CRUD + counts
│   ├── useItems.ts           # Standalone tagged item CRUD, useUsers()
│   ├── useRecipes.ts         # Home Cooking recipes, recipe tags
│   ├── useTrips.ts           # Trip CRUD, trip suggestions algorithm
│   ├── useBaby.ts            # Baby profile, milestones, tagged entries
│   └── useDebounce.ts        # Debounce hook for search
│
├── components/
│   ├── Layout.tsx            # Shell: sidebar (desktop) + bottom nav (mobile) + <Outlet/>
│   ├── Sidebar.tsx           # Desktop left nav (w-60, fixed)
│   ├── BottomNav.tsx         # Mobile bottom tab bar (Journal, Explore, Lists, On This Day)
│   ├── RichTextEditor.tsx    # Tiptap wrapper with bold/italic toolbar
│   ├── AddItemSheet.tsx      # Bottom sheet for tagging items on journal entries
│   ├── AddRecipeSheet.tsx    # Bottom sheet for adding recipes
│   ├── AddStandaloneItemSheet.tsx  # Bottom sheet for adding items outside entries
│   ├── ImportJournal.tsx     # File upload + preview for journal import
│   ├── ImportRecipes.tsx     # File upload + preview for recipe import
│   ├── SuggestionModal.tsx   # Tiptap suggestion/autocomplete modal
│   └── ui/
│       ├── BottomSheet.tsx   # Drag-to-dismiss bottom sheet portal
│       ├── Button.tsx        # Primary/secondary/ghost with loading spinner
│       ├── Card.tsx          # Styled card wrapper
│       ├── EmptyState.tsx    # Icon + title + description + action
│       ├── Modal.tsx         # Portal modal (scale on desktop, slide on mobile)
│       ├── Skeleton.tsx      # Shimmer loading placeholders
│       ├── StarRating.tsx    # 1-5 star display/input
│       └── TagPill.tsx       # Emoji + label pill
│
├── views/
│   ├── UserPicker.tsx        # Initial user selection screen
│   ├── Journal.tsx           # Timeline with infinite scroll, trip grouping, baby widget
│   ├── EntryDetail.tsx       # Full entry editor (sections, photos, tags, trips, milestones)
│   ├── Explore.tsx           # Search across entries and tagged items
│   ├── Lists.tsx             # Trips card, Baby card, category grid, suggested trips
│   ├── CategoryDetail.tsx    # Items in a category with filters and sorting
│   ├── BookOfFood.tsx        # "The Untitled Book of Food" recipe browser
│   ├── RecipeDetail.tsx      # Single recipe view/edit
│   ├── ItemDetail.tsx        # Single tagged item view/edit
│   ├── OnThisDay.tsx         # Entries from the same date in previous years
│   ├── CreateTrip.tsx        # Trip creation form with entry/photo picker
│   ├── TripDetail.tsx        # Trip detail with hero, stats, timeline, edit mode
│   ├── Baby.tsx              # Baby view with Timeline/Milestones/Firsts tabs
│   └── Settings.tsx          # Theme, categories, trips, baby profile, import/export

supabase/migrations/
├── 001_kristory_schema.sql   # Core tables + storage bucket + seed categories
├── 002_recipes.sql           # Recipe columns, recipe_tags, standalone items
└── 003_item_date.sql         # item_date column, participants junction table
```

## Architecture Patterns

### Shared Journal
Each day has one `journal_entries` row. Each user gets their own `entry_sections` row per entry (keyed on `entry_id + user_id`). This means Chris and Krista each write independently for the same date. Sections are upserted on conflict.

### Supabase Select Strings
Nested joins use explicit FK hints with `!` syntax because tables have multiple FK relationships. Example:
```ts
const ENTRY_SELECT = '*, sections:entry_sections!entry_id(*, user:users!user_id(id, name)), photos:entry_photos!entry_id(*), tagged_items:tagged_items!entry_id(*, category:categories!category_id(*))'
```
This pattern is used in `useEntries.ts`, `useTrips.ts`, `useItems.ts`, `useRecipes.ts`, and `useBaby.ts`.

### Theming
CSS custom properties defined in `index.css` under `:root` (light) and `html.dark` (dark). Components use inline `style={{ color: 'var(--text-primary)' }}` instead of Tailwind color classes. The `ThemeProvider` toggles `html.dark` class based on user preference stored in `localStorage('kristory-theme')`.

Key variables: `--bg-page`, `--bg-card`, `--border-card`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent` (#6B5CA5 purple), `--chris-color` (purple), `--krista-color` (pink).

### Collapsible Animations
The `collapsible-content` CSS class uses `grid-template-rows: 0fr/1fr` for smooth expand/collapse. Used in Journal timeline groups, Lists sections, and Baby milestones.

### Image Handling
Photos are resized client-side (`resizeImage()` in helpers.ts, max 1600px, JPEG 0.85 quality) before uploading to Supabase Storage bucket `kristory-photos`. URLs are constructed via `getStorageUrl(path)`.

### Cache Invalidation
React Query cache keys follow a pattern: `['entity']` for lists, `['entity', id]` for singles. Mutations invalidate related query keys in their `onSuccess` callbacks. Trip mutations also invalidate `['suggested-trips']` and `['entries']`.

## Key Features

### Tagged Items & Categories
Items are tagged to journal entries via `tagged_items` with a `category_id`. 9 default categories are seeded. Items can also be standalone (null `entry_id`) with their own `item_date`. Categories are manageable in Settings.

### Recipe Management ("The Untitled Book of Food")
Recipes are `tagged_items` where `category_id` points to "Home Cooking". They have extra `ingredients` and `instructions` columns. Recipe tags (Pasta, Salad, Soup, etc.) are a separate many-to-many via `tagged_item_recipe_tags`. The `BookOfFood` view provides browsing with tag filters, sorting (recent/rating/alpha), and search. Recipes can be imported from a text file via `recipe-parser.ts`.

### Trips
Trips have a date range, optional cover photo and summary. Entries are linked via `trip_entries` junction table. The Journal timeline groups consecutive trip entries under collapsible `TripGroupCard` headers. A suggestion algorithm in `useTrips.ts` scans entries for trip signals (locations, keywords like "hotel"/"beach"/"flight", batch imports) and proposes ungrouped entries as potential trips.

### Baby Milestones
The `baby_profile` table stores one profile row. `baby_milestones` tracks completed milestones with optional notes, photos, and linked journal entries. Pre-populated milestone checklists for Pregnancy (7 items) and First Year (10 items). The Baby view has three tabs: Timeline (merged milestones + baby-tagged entries), Milestones (checklists with progress bars), and Firsts ("Book of Firsts" keepsake grid). A countdown widget appears on the Journal home page.

**Note**: The `baby_profile` and `baby_milestones` tables, and the `Baby` category, must be created manually in Supabase — there is no migration file for them yet.

### Journal Import
`import-parser.ts` handles two formats of plain text journal files: "paragraph mode" (date + content on same line, separated by blank lines) and "line mode" (date on its own line, content on following lines). Supports month names, numeric dates, and ISO dates. Auto-infers year from sequential month order when years aren't specified.

### Export
JSON export includes all entries, categories, trips, photos (as full URLs), and tagged items. PDF export generates a formatted A4 document with title page and per-entry pages.

## Known Gotchas

1. **`tsc --noEmit` vs `tsc -b`**: Local `tsc --noEmit` is more lenient. Vercel runs `tsc -b` (build mode) which catches unused variables/imports that `--noEmit` misses. Always run `npm run build` before deploying.

2. **No auth**: RLS is disabled. The app trusts the client to send the correct `user_id`. Do not expose this to the public internet without adding auth.

3. **`users` table is external**: The `users` table is not in the migration files. It must exist with `id` (UUID) and `name` (text) columns before the app works.

4. **Baby tables are external**: `baby_profile` and `baby_milestones` tables, and the "Baby" category row, must be created manually in Supabase.

5. **Supabase FK hints**: All `.select()` calls that join across tables use explicit `!foreign_key` syntax. If you rename a column or add a new FK, you must update the select string or queries will silently return null for the join.

6. **Photo storage path format**: Photos are stored as `{entry_date}/{uuid}.jpg` in the `kristory-photos` bucket. The bucket is public. `getStorageUrl()` constructs the full URL.

7. **Entry creation is lazy**: Entries are created on-demand when the user first types or uploads a photo. The `ensureEntry()` pattern in `EntryDetail.tsx` handles this.

8. **CSS variables vs Tailwind**: Most color styling uses inline `style={{ color: 'var(--text-primary)' }}` rather than Tailwind classes. This is intentional for theming but means you can't use Tailwind's color utilities for theme colors.

9. **Service worker caching**: The PWA auto-updates on reload. Google Fonts are cached with CacheFirst strategy. If styles look stale, check the service worker in DevTools.

10. **Constants user IDs are empty**: `USERS` in `constants.ts` has empty `id` strings. The actual user IDs come from the Supabase `users` table at runtime via the `UserPicker` view.
