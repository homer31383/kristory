Write a CLAUDE.md file in the project root that Claude Code will read on startup in future sessions. Include:

1. Project overview: The Kristory is a shared daily journal PWA for Chris and Krista, with a family baby feed called "The Babory" at /family
2. Tech stack: Vite + React + TypeScript + Tailwind + Supabase + Vercel
3. Critical rules:
   - ALL Supabase nested queries MUST use explicit FK hints (!column_name) or PostgREST returns 400
   - Photos resize to 1600px max, JPEG 85% before upload
   - Auto-save with 1.5s debounce on journal editing
   - PWA uses skipWaiting + clientsClaim
   - Dates use date-fns, stored as YYYY-MM-DD, local timezone not UTC
   - categories table requires user_id (not nullable)
   - tagged_items.entry_id is nullable (standalone items exist)
   - Deploy: user runs "npx vercel --prod" from their shell manually
   - Git push: user runs manually from Windows terminal
   - PowerShell uses ; not && for chaining
4. User IDs: Chris 9df51388-65e8-44bf-bfad-65729744190b, Krista cab9d09c-0083-4ce1-aaf5-9a045d8a4315
5. Design system: Light bg #EDE6DE, cards #F7F3EF, accent #6B5CA5, Chris purple #6B5CA5, Krista pink #D4708F. Playfair Display headings, Inter body. Baby accents #FFF8E7/#F0FAF0.
6. Database tables: journal_entries, entry_sections, entry_photos, categories, tagged_items, recipe_tags, tagged_item_recipe_tags, tagged_item_participants, trips, trip_entries, baby_milestones, baby_profile, baby_name_suggestions, family_posts, family_post_photos, app_settings
7. Key routes: / (user picker), /journal, /journal/:date, /explore, /lists, /lists/:catId, /on-this-day, /trips/new, /trips/:tripId, /baby, /settings, /family (separate PIN gate, "The Babory")
8. Known quirks: Storage bucket needs RLS policies, photo upload uses canvas Math.round(), family feed published_at should use entry date not share date, no www on Vercel URLs

Also write a PROJECT_STATUS.md documenting:
- Current state: fully functional with all features live
- What was built in the most recent session (April 8, 2026): Family baby feed ("The Babory") with PIN gate, share-to-family toggle on entries, family feed Kristory-style timeline redesign, app PIN lock, baby name suggestions, share via SMS/email/copy/native, backup system with full ZIP export and monthly reminders, disaster recovery documentation
- Known bugs: none currently known
- What's planned: yearbook PDF export, Claude AI integration for querying history, map view, on-this-day notifications, recipe scaling
