-- 033: Recreate the tables that were made by hand in the Supabase dashboard
-- (users, baby_profile, baby_milestones), so a fresh schema rebuild has them.
-- Shapes match what the app code reads and writes (src/types/index.ts, useBaby.ts,
-- Anyone Can Parent's profile sync and kristoryAddMilestone, Order Up's baby age read).
-- Every statement is idempotent: on the live database the tables already exist and
-- only the grants and the guarded inserts run (the inserts do nothing there).
-- Run order on a fresh project: run the users section before 001, because
-- journal_entries and entry_sections reference users. The baby tables need 001
-- first (baby_milestones references journal_entries), so run the rest after it.

-- Users: Chris and Krista. Axiom Tasks shares this project and its migration
-- 007_user_system creates the same table with avatar_emoji, so that column is
-- included to keep both apps' rebuilds compatible. Kristory only uses id and name.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_emoji text not null default '👤',
  created_at timestamptz default now()
);
grant select, insert, update, delete on public.users to anon, authenticated, service_role;
alter table users disable row level security;

-- These UUIDs are referenced throughout production data. Only seeds an empty table.
insert into users (id, name)
select v.id, v.name
from (values
  ('9df51388-65e8-44bf-bfad-65729744190b'::uuid, 'Chris'),
  ('cab9d09c-0083-4ce1-aaf5-9a045d8a4315'::uuid, 'Krista')
) as v(id, name)
where not exists (select 1 from users);

-- Baby profile: single row. Also read and written by Anyone Can Parent
-- (name, due_date, birth_date) and read by Order Up.
create table if not exists baby_profile (
  id uuid primary key default gen_random_uuid(),
  name text,
  due_date date,
  birth_date date,
  birth_weight text,
  birth_length text,
  notes text,
  family_pin text default '2026',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select, insert, update, delete on public.baby_profile to anon, authenticated, service_role;
alter table baby_profile disable row level security;

insert into baby_profile (name)
select null
where not exists (select 1 from baby_profile);

-- Baby milestones. Anyone Can Parent inserts milestone_type 'first_year' rows
-- and later fills photo_path.
create table if not exists baby_milestones (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references journal_entries(id) on delete set null,
  title text not null,
  milestone_type text not null default 'custom',
  milestone_date date not null,
  notes text,
  photo_path text,
  created_at timestamptz default now()
);
grant select, insert, update, delete on public.baby_milestones to anon, authenticated, service_role;
alter table baby_milestones disable row level security;

-- Anyone Can Parent subscribes to realtime changes on baby_profile.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'baby_profile'
  ) then
    alter publication supabase_realtime add table baby_profile;
  end if;
end $$;
