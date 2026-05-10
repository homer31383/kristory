-- ════════════════════════════════════════════════════════════════════════════
-- Link Kristory users to babylist_people.
--
-- Standalone Babylist was used with a "first-visit name prompt" identity flow.
-- After merging into Kristory, identity comes from Kristory's users table
-- instead. We add a nullable kristory_user_id column so each Kristory user
-- gets exactly one babylist_people row (per registry), while still allowing
-- name-only people imported from CSVs that predate the merge.
--
-- The `name` column stays as-is so badge initials still work for CSV-imported
-- people who never become Kristory users.
-- ════════════════════════════════════════════════════════════════════════════

alter table babylist_people
  add column if not exists kristory_user_id uuid;

-- One Kristory user maps to at most one babylist_people row per registry.
-- Partial index so NULLs (CSV-imported, non-Kristory people) don't collide.
create unique index if not exists babylist_people_kristory_user_id_idx
  on babylist_people (registry_id, kristory_user_id)
  where kristory_user_id is not null;
