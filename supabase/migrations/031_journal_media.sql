-- ════════════════════════════════════════════════════════════════════════════
-- Journal media: audio files and short video clips attached to entries.
--
-- Files live in the public kristory-media bucket as {entry_id}/{uuid}.{ext};
-- video thumbnails sit beside them as {entry_id}/{uuid}-thumb.jpg.
-- Media on an entry that is shared to the family feed also shows in the
-- Babory, unless share_to_family is turned off for that item.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists journal_media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references journal_entries(id) on delete cascade,
  user_id uuid not null references users(id),
  file_path text not null,
  file_url text not null,
  file_type text not null check (file_type in ('video', 'audio')),
  mime_type text not null,
  file_size_bytes bigint,
  duration_seconds numeric,
  thumbnail_path text,
  caption text,
  share_to_family boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create index if not exists journal_media_entry_id_idx on journal_media(entry_id);

alter table journal_media disable row level security;

-- Storage bucket: public, 50MB cap, audio/video plus JPEG for video thumbnails.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kristory-media',
  'kristory-media',
  true,
  52428800,
  array[
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav',
    'image/jpeg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A public bucket still enforces object-level RLS, so open it up explicitly
-- (same setup as kristory-photos).
drop policy if exists "kristory-media public read" on storage.objects;
drop policy if exists "kristory-media public insert" on storage.objects;
drop policy if exists "kristory-media public delete" on storage.objects;

create policy "kristory-media public read" on storage.objects for select
  using (bucket_id = 'kristory-media');
create policy "kristory-media public insert" on storage.objects for insert
  with check (bucket_id = 'kristory-media');
create policy "kristory-media public delete" on storage.objects for delete
  using (bucket_id = 'kristory-media');
