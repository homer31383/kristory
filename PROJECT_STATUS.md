# The Kristory — Project Status

## Current State

**Fully functional. All core features live in production at https://the-kristory.vercel.app**

The app supports the full daily-journal experience for Chris and Krista (sections, photos, tagged items, recipes, trips, baby milestones), plus a separate family-facing baby feed at `/family` ("The Babory") gated by a PIN. App-wide PIN lock, full backup system, and disaster recovery documentation are all in place.

## What Was Built in the Most Recent Session (April 8, 2026)

This session was a major build-out focused on the family-facing experience, security, and disaster recovery.

### Family Feed ("The Babory")
- Public-ish family feed at `/family` with its own PIN gate (`baby_profile.family_pin`, defaults to `2026`)
- Completely standalone layout — no Kristory chrome, no sidebar, no nav bar
- Header branding: "The Babory" in Playfair Display with baby age subtitle
- "Updates" tab with Kristory-style timeline layout: collapsible year groups → collapsible month groups → compact post cards (newest first within each level)
- "Names" tab where family can suggest baby names (with optional "your name" attribution)
- Tap a post card to open the full post detail view (large stacked photos, full caption, milestone badge if applicable, back button)
- Posts grouped and sorted by the linked journal entry's date, not when they were shared

### Share-to-Family on Journal Entries
- Toggle in the entry detail view to share an entry to the family feed
- Caption pre-filled from the user's section text (HTML stripped to plain text), editable
- Photo selector grid where users pick which photos to share (all selected by default)
- Save creates/updates a `family_posts` row with `published_at` set to the entry's date
- Toggle off shows a remove confirmation
- Quick "Shared" badge on entries in the Baby view timeline
- Milestone completion auto-prompts to share the milestone with family

### Family Feed Settings
- Settings → "Family Feed" section: PIN management (view/edit), copy share link, view feed link
- Settings → "Backup & Restore" section: full backup with progress indicator, monthly/weekly reminder toggle, last backup date
- Settings → "App PIN" section: set/change/remove the app-wide PIN

### App PIN Lock
- Optional app-wide PIN stored in `app_settings.app_pin` (persists across devices)
- Wraps the user picker and authenticated routes in `AppPinLock`
- `/family` route is intentionally NOT wrapped — family has its own separate PIN
- Session-only unlock via `sessionStorage` so the PIN is asked once per browser session, not on every page refresh
- Set/change/remove from Settings with confirm-PIN validation

### Baby Name Suggestions
- New `baby_name_suggestions` table
- Family members can suggest names from the family feed (name + optional "your name")
- Chris and Krista can view and delete suggestions from the Baby view "Names" tab
- Cards display name and "by [person]" attribution

### Share Sheet on Baby View
- "Family Feed" card on the Baby view shows current PIN and a "Share with Family" button
- Bottom sheet with options:
  - **Share...** (mobile only via `navigator.share`)
  - **Text** — opens SMS with pre-filled message including URL and PIN
  - **Email** — opens mail client with subject "Baby Updates from The Babory" and body
  - **Copy Link & PIN** — clipboard copy with "Copied!" confirmation
- Subtle "View Family Feed →" link below the baby countdown on the Journal home

### Backup System
- New `src/lib/backup.ts` using JSZip
- Settings → "Backup & Restore" generates a ZIP containing:
  - `data.json` — fully denormalized export of every table (users, journal entries with sections/photos/items, standalone items, trips, categories, recipe tags, baby profile/milestones/names, family posts, app settings)
  - `README.txt` — human-readable summary with counts and date range
  - `REBUILD-GUIDE.txt` — dynamically generated complete rebuild instructions including the full SQL schema for all 17 tables, storage bucket policies, environment variable setup, Vercel deployment steps, photo re-upload methods, and the actual user UUIDs from the live database
  - `photos/{entry_date}/{uuid}.jpg` — every photo downloaded from Supabase Storage in batches of 10
- Progress indicator with phase labels and a per-photo progress bar
- "Prepare Full Backup" → estimates size first → "Download Full Backup" actually runs it
- Backup reminders: weekly or monthly, surfaces as a dismissible card on the Journal home when overdue
- Last backup date stored in `app_settings.last_backup_date`

### Family Feed Display Polish
- Posts sorted by entry date (not share date), grouped into year → month timeline
- Post detail view uses Playfair Display for the date heading, Kristory cream/card design system
- PIN gate styled with Kristory branding (cream background, Playfair Display "The Babory" header)
- Shake animation on wrong PIN
- localStorage persistence so family doesn't re-enter the PIN

### Bug Fixes
- Family posts no longer show today's date — `published_at` now uses the journal entry's `entry_date` at creation time
- Family feed query joins through `entry:journal_entries!entry_id(entry_date)` for accurate display even on legacy posts
- Sort within each month group fixed (was using query order which sorted by old `published_at`)
- `vercel.json` SPA rewrite added so `/family` works on direct navigation (was 404'ing)

### Database Migrations Added This Session
- `004_family_feed.sql` — `family_posts`, `family_post_photos`, `baby_profile.family_pin` column
- `005_app_pin.sql` — `app_settings` key-value table
- `006_baby_names.sql` — `baby_name_suggestions` table

### Documentation
- `CLAUDE.md` rewritten with critical rules, design system, table list, route map, known quirks
- This `PROJECT_STATUS.md` created
- Backup ZIPs include a complete dynamic `REBUILD-GUIDE.txt`

## Known Bugs

None currently known.

## What's Planned

These are ideas/features that have been discussed but not yet built. Listed roughly in priority order:

1. **Yearbook PDF export** — A polished, designed yearly PDF compilation (one per year) with cover, photos, sections, milestones — something printable as a keepsake. Different from the current PDF export which is more utilitarian.

2. **Claude AI integration for querying history** — A natural-language search/chat interface where Chris and Krista can ask things like "When did we last go to Greenport?" or "What movies did we watch in March?" and get answers grounded in the journal data.

3. **Map view** — Visualize tagged items with locations on a map (places visited, restaurants, trip stops). Cluster by city/region.

4. **On-this-day push notifications** — PWA notifications surfacing "X years ago today" memories on the Journal home or as a system notification.

5. **Recipe scaling** — On a recipe detail page, let users scale the ingredients up or down (2x, half, custom servings) with auto-recalculated quantities.

6. **Restore from Backup tool** — Currently the backup system only exports. The Restore button in Settings is a placeholder. Building a real importer that takes a `data.json` and reconstructs the database would close the disaster-recovery loop.

7. **Migration file for `baby_profile` and `baby_milestones`** — These tables exist in Supabase but were created manually. A `004_baby.sql` migration would bring them under version control. (Lower priority since the rebuild guide in backups already documents the SQL.)

8. **Dark mode for baby feature colors** — `#FFF8E7`, `#F0C987`, `#F0FAF0` are currently hardcoded light-mode values that look bad in dark mode.

9. **Test coverage** — The codebase currently has zero tests.
