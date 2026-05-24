-- ════════════════════════════════════════════════════════════════════════════
-- Per-pick "transferred to Babylist" tracking.
--
-- We're migrating ~78 picks across both registries into Babylist.com via their
-- browser extension (one manual click per pick — no automated sync). To make
-- the bulk migration manageable and to keep a clear "what's left" queue when
-- new picks are added later, every pick now carries an optional transfer
-- timestamp.
--
--   transferred_at IS NULL      → still needs to be moved to Babylist
--   transferred_at IS NOT NULL  → moved (transferred_by tracks who)
--
-- Per-pick, not per-item: if someone picked Budget AND Premium tiers on the
-- same item, the two picks track separately — moving one to Babylist doesn't
-- automatically mark the other.
--
-- babylist_picks already runs with RLS disabled (the existing pattern) and is
-- already in the realtime publication (021), so adding columns automatically
-- propagates them via UPDATE events — no further wiring needed.
-- ════════════════════════════════════════════════════════════════════════════

alter table babylist_picks
  add column if not exists transferred_at timestamptz;

alter table babylist_picks
  add column if not exists transferred_by uuid references babylist_people(id);
