-- ════════════════════════════════════════════════════════════════════════════
-- The Library — rich Books fields + media tags.
--
-- Adds 15 new columns to tagged_items so we can store the personal
-- cultural log shape (subtitle, author, status, format, dates, themes,
-- summary, what_stuck, cover_url, favorite, hall_of_fame, isbn,
-- page_count, subcategory). All nullable / sensible defaults so existing
-- tagged_items rows still work as-is.
--
-- Adds media_tags (similar to recipe_tags but for books / movies / etc.)
-- plus the tagged_item_media_tags junction. Seeds the initial Book
-- subcategory tag set.
--
-- All tagged_items / categories / etc. already run with RLS disabled.
-- ════════════════════════════════════════════════════════════════════════════

alter table tagged_items add column if not exists subtitle text;
alter table tagged_items add column if not exists author text;
alter table tagged_items add column if not exists status text default 'want'
  check (status in ('want', 'reading', 'read', 'abandoned', 'reference'));
alter table tagged_items add column if not exists format text
  check (format in ('physical', 'ebook', 'audiobook'));
alter table tagged_items add column if not exists start_date date;
alter table tagged_items add column if not exists finish_date date;
alter table tagged_items add column if not exists recommended_by text;
alter table tagged_items add column if not exists themes text;
alter table tagged_items add column if not exists summary text;
alter table tagged_items add column if not exists what_stuck text;
alter table tagged_items add column if not exists cover_url text;
alter table tagged_items add column if not exists favorite boolean default false;
alter table tagged_items add column if not exists hall_of_fame boolean default false;
alter table tagged_items add column if not exists isbn text;
alter table tagged_items add column if not exists page_count integer;
alter table tagged_items add column if not exists subcategory text;

create table if not exists media_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category_type text not null default 'books',
  created_at timestamptz default now()
);
alter table media_tags disable row level security;

create table if not exists tagged_item_media_tags (
  tagged_item_id uuid references tagged_items(id) on delete cascade,
  media_tag_id uuid references media_tags(id) on delete cascade,
  primary key (tagged_item_id, media_tag_id)
);
alter table tagged_item_media_tags disable row level security;

insert into media_tags (name, category_type) values
  ('Fiction', 'books'),
  ('Nonfiction', 'books'),
  ('Art', 'books'),
  ('Memoir', 'books'),
  ('Biography', 'books'),
  ('Poetry', 'books'),
  ('Graphic Novel', 'books'),
  ('Cookbook', 'books'),
  ('History', 'books'),
  ('Science', 'books'),
  ('Philosophy', 'books'),
  ('Self-Help', 'books'),
  ('Fantasy', 'books'),
  ('Sci-Fi', 'books'),
  ('Mystery', 'books'),
  ('Horror', 'books'),
  ('Romance', 'books'),
  ('Travel', 'books'),
  ('Business', 'books'),
  ('Design', 'books'),
  ('Photography', 'books'),
  ('Architecture', 'books'),
  ('Children', 'books')
on conflict (name) do nothing;
