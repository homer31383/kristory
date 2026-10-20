-- ════════════════════════════════════════════════════════════════════════════
-- Rollback for 2026-10-20_kristory_setup.sql
--
-- WRITTEN, NOT APPLIED. Drops babory_family_links. Every family link stops
-- working (api/babory-feed.ts returns an error), and the link controls in
-- Settings and on the Baby page fail. Only run it after reverting the
-- household-lockdown build, or when you mean to retire family links.
-- ════════════════════════════════════════════════════════════════════════════

begin;

drop table if exists public.babory_family_links;

notify pgrst, 'reload schema';

commit;

-- Verification (read-only):
--   select to_regclass('public.babory_family_links');   -- null
