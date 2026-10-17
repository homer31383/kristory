-- Keep the original filename of uploaded media so audio clips can show a
-- name in the player. Clips uploaded before this have no name (the stored
-- path is {entry_id}/{uuid}.{ext}, so the original can't be recovered).
alter table journal_media add column if not exists file_name text;
