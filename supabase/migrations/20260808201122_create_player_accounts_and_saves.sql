-- Player profile with case-insensitive unique username
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_length
    check (char_length(username) between 3 and 20),

  constraint profiles_username_format
    check (username ~ '^[A-Za-z0-9_]+$')
);

create unique index profiles_username_unique
  on public.profiles (lower(username));


-- One cloud save per player
create table public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_version integer not null default 1,
  revision bigint not null default 1,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),

  constraint game_saves_state_is_object
    check (jsonb_typeof(state) = 'object')
);


-- Meaningful player events, not movement every frame
create table public.game_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint game_events_type_length
    check (char_length(event_type) between 1 and 50),

  constraint game_events_payload_is_object
    check (jsonb_typeof(payload) = 'object')
);

create index game_events_user_created_idx
  on public.game_events (user_id, created_at desc);


-- Automatically update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger game_saves_set_updated_at
before update on public.game_saves
for each row execute function public.set_updated_at();


-- Automatically create a profile when someone registers
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_username text;
begin
  selected_username := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    'Player_' || substring(new.id::text from 1 for 8)
  );

  insert into public.profiles (id, username)
  values (new.id, selected_username);

  return new;
end;
$$;

create trigger create_profile_after_signup
after insert on auth.users
for each row execute function public.handle_new_user();


-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.game_saves enable row level security;
alter table public.game_events enable row level security;


-- Profile policies
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can create own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);


-- Save policies
create policy "Users can read own save"
on public.game_saves
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own save"
on public.game_saves
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own save"
on public.game_saves
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own save"
on public.game_saves
for delete
to authenticated
using ((select auth.uid()) = user_id);


-- Event policies
create policy "Users can read own events"
on public.game_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own events"
on public.game_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete own events"
on public.game_events
for delete
to authenticated
using ((select auth.uid()) = user_id);


-- Required API privileges
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.game_saves to authenticated;
grant select, insert, delete on public.game_events to authenticated;
grant usage, select on sequence public.game_events_id_seq to authenticated;