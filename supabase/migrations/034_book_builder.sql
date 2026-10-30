-- ════════════════════════════════════════════════════════════════════════════
-- Book builder: printable books curated from journal entries.
--
-- A book is a layer of decisions on top of the journal. It never changes an
-- entry's text or photos. Pages are not stored; the app computes them from
-- book_items every time (src/book/paginate.ts).
--
-- Also adds photo size and print copy columns to entry_photos. New uploads
-- keep a 3000 px print copy at print/{entry_date}/{uuid}.jpg next to the
-- 1600 px display copy. These are metadata, not journal content.
--
-- Household lockdown rules: RLS on, one household_only policy, no anon grant.
-- Run in the Supabase SQL Editor before deploying the book-builder build.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Photo size and print copy ────────────────────────────────────────────────
-- width/height: pixel size of storage_path (the display copy). Older photos
-- are measured in the browser the first time a book uses them.
-- print_path: the 3000 px copy, when the upload was larger than 1600 px or an
-- original was added later. print_width/print_height: its pixel size.
alter table public.entry_photos add column if not exists width integer;
alter table public.entry_photos add column if not exists height integer;
alter table public.entry_photos add column if not exists print_path text;
alter table public.entry_photos add column if not exists print_width integer;
alter table public.entry_photos add column if not exists print_height integer;

-- ── Books ────────────────────────────────────────────────────────────────────
create table if not exists public.book_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date_from date,
  date_to date,
  trip_id uuid references public.trips(id) on delete set null,
  include_authors text not null default 'both' check (include_authors in ('both', 'chris', 'krista')),
  trim_size text not null default '7x7',
  bleed_in numeric not null default 0.125,
  page_limit integer not null default 140 check (page_limit > 0),
  -- {photo_id, title, subtitle}; shape owned by the app
  cover_choice jsonb,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Book items: one row per journal entry in a book ──────────────────────────
-- photo_ids:   ordered [{photo_id, focal_x, focal_y}], focal 0..1, may name
--              photos from other entries
-- hidden_text: [{section_id, start, end, snippet, source_hash}], offsets into
--              the section's plain text
create table if not exists public.book_items (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.book_books(id) on delete cascade,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  sort_key integer not null default 0,
  included boolean not null default true,
  done boolean not null default false,
  split_authors boolean not null default false,
  hero_photo_id uuid references public.entry_photos(id) on delete set null,
  photo_ids jsonb not null default '[]'::jsonb,
  hidden_text jsonb not null default '[]'::jsonb,
  layout_override text,
  caption_override text,
  pin_side text check (pin_side in ('left', 'right')),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  unique (book_id, entry_id)
);

create index if not exists book_items_book_id_idx on public.book_items(book_id, sort_key);
create index if not exists book_items_entry_id_idx on public.book_items(entry_id);
create index if not exists book_books_trip_id_idx on public.book_books(trip_id);

-- ── Access: household only ───────────────────────────────────────────────────
alter table public.book_books enable row level security;
alter table public.book_items enable row level security;

drop policy if exists household_only on public.book_books;
create policy household_only on public.book_books for all to authenticated
  using (public.is_household()) with check (public.is_household());

drop policy if exists household_only on public.book_items;
create policy household_only on public.book_items for all to authenticated
  using (public.is_household()) with check (public.is_household());

revoke all on public.book_books from anon;
revoke all on public.book_items from anon;
grant select, insert, update, delete on public.book_books to authenticated, service_role;
grant select, insert, update, delete on public.book_items to authenticated, service_role;

-- ── Realtime for book_items (include, done, changed by) ──────────────────────
alter table public.book_items replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'book_items'
  ) then
    execute 'alter publication supabase_realtime add table public.book_items';
  end if;
end $$;
