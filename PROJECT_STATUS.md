# The Kristory — Project Status

*Updated 2026-10-17 to match `STATE-SNAPSHOT.md`, which is the code-verified reference for routes, schema, features, storage and backup gaps.*

## Current State

**Live in production at https://the-kristory.vercel.app.** The shower site is also served on the `leahybernierbabyshower.com` custom domain. HEAD is `28206af` (2026-10-08).

| Area | What's there |
|---|---|
| **Journal** | Two-author daily entries with autosave, photos (paste, swipeable lightbox), audio/video clips, tagged items, trips, milestones, share-to-family, inline search, Change Entry Date, prev/next swipe, Photo Memories, On This Day, `?action=new-entry` quick action |
| **Library** | `/explore` "The Library", rich Books (status, format, Hall of Fame, tags), Open Library/Google Books lookup, Claude summary/themes/classify, bookshelf scanner, Generate All / Classify All, River collage |
| **Lists** | Trips + suggested trips, category grid, standalone items, Book of Food (search, suggestions), Scan Recipe (multi-page), Save as Axiom Meal |
| **Baby** | Countdown/age, milestones (presets + custom, mark incomplete), Firsts, family name suggestions, share card |
| **Babory** (`/family`) | PIN-gated family feed: year/month timeline, post detail with photos/video/audio, deep links, Names tab, `/family/photos` gallery |
| **Shower** (`/shower`, `/shower/m`) | Public RSVP + photo upload + ICS; manager with guests, invites, schedule, helpers, checklist, menu CSV import, photo ZIP, QR code, background designer |
| **Registry** (`/registry`) | Shared realtime registry for Chris & Krista: picks, tiers, overrides, mute/save, CSV import/export, Babylist transfer tracking, Chrome-extension pairing |
| **Settings / Backup** | Theme, App PIN, categories, baby profile, Family PIN, imports, JSON/PDF export, full backup ZIP (data, photos, media, rebuild guide) with reminders |

## In Progress (uncommitted)

- **Audio clip names:**
  - Original filename is saved on upload; the name is editable in edit mode and shown above the audio player on entries and in the Babory.
  - `032_journal_media_file_name.sql` is applied in production (2026-10-17), so this is ready to deploy.
- **Data recovery work:** `recovery-phase1.sql`, `scripts/recovery-diagnose.js`, `scripts/recovery-phase2.js` and the registry-picks CSVs.

## Known Bugs / Drift

1. **Registry transfer marks need redoing.** Migration 029 was applied on 2026-10-17. Earlier "Mark on Babylist" clicks were never saved, so every pick shows as not on Babylist.
2. **The milestone "Share with family?" prompt doesn't share.** In `Baby.tsx` `handleCompleteMilestone`, no entry is linked, so the prompt just opens today's entry.
3. **`categories.user_id` isn't in any migration or the rebuild SQL.** On a rebuilt database every category insert fails.
4. **"Visit The Babory →" is dead on the shower custom domain.** That domain redirects every non-shower path to `/shower`.
5. **The shower manager shares the family PIN and unlock flag.** Anyone with Babory access can open `/shower/m`.
6. **Version label mismatch:** Settings → About shows "1.0.0", but backups write `app_version: '1.1.0'`.

## What's Planned

Roughly in priority order:

1. **Restore from Backup.** The Settings button is still "Coming soon". This first needs data.json to keep IDs and FKs, since it is currently a denormalized view (see snapshot §9).
2. **Close the backup gaps** (snapshot §9):
   - Registry (`babylist_*`) tables.
   - Shower image files.
   - `categories.user_id` in the rebuild SQL.
   - A guard on the `baby_profile` seed insert.
   - `ANTHROPIC_API_KEY` in the guide.
   - Report failed downloads instead of skipping them.
3. **Migration files for manually created tables:** `users`, `baby_profile`, `baby_milestones`, and the `categories.user_id` column.
4. **Yearbook PDF export:** a designed yearly keepsake with cover, photos, sections and milestones.
5. **Natural-language "ask our history"** over the journal with Claude. The AI plumbing now exists in `api/`.
6. **Map view** of tagged-item locations.
7. **On-this-day notifications.**
8. **Recipe scaling** on recipe detail.
9. **Dark mode for baby colours:** `#FFF8E7`, `#F0C987`, `#F0FAF0` are hardcoded light-only.
10. **Test coverage.** There are none yet.

## History

| When | Milestone |
|---|---|
| 2026-03-05 | Initial commit: journal, photos, tagged items, recipes, trips, baby, On This Day, export, imports |
| ≤ 2026-04-08 | Babory family feed, share-to-family, App PIN, baby names, backup system, shower site (first committed 2026-05-21 in `49aab0b`) |
| 2026-05-10 → 05-24 | Registry merged into Kristory: realtime, overrides, item/section states, extension pairing, transfer tracking |
| 2026-05-21 | Save as Axiom Meal, Scan Recipe, clipboard photo paste |
| 2026-05-26 | The Library (rich Books, AI summary/themes, bookshelf scan, batch generate/classify); milestone "mark incomplete" |
| 2026-08-01 → 08-05 | Shower photo upgrades (full-res, drag & drop, viewer, ZIP, QR); editable entry date + editor cursor fix |
| 2026-09-27 → 09-28 | Inline search, recipe search, Photo Memories, Library River, Babory gallery, prev/next swipe, scan diagnostics, Sonnet 5 switch, quick action |
| 2026-10-08 | Audio/video attachments; swipeable photo lightbox |
