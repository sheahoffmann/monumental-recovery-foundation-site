-- ==========================================================================
-- Taste of Recovery 2027 guest app: database setup
-- --------------------------------------------------------------------------
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run again: it only creates what's missing and resets the
-- functions and access rules to what's written here. It never deletes bids,
-- votes, photos or feedback.
--
-- How access works: every table has row-level security (RLS) on. Guests can
-- read the public parts (event status, bids by paddle number, approved photos)
-- and only their own private rows. Bids, votes, feedback and sign-up go
-- through the functions at the bottom, which check the rules (auction open,
-- minimum raise, one vote each) inside the database. Staff are the accounts
-- listed in public.staff.
-- ==========================================================================

-- Tables -------------------------------------------------------------------

create sequence if not exists public.paddle_seq start 101;

create table if not exists public.guests (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 60),
  phone      text not null check (phone ~ '^[0-9]{10}$'),
  paddle     int  not null unique default nextval('public.paddle_seq'),
  created_at timestamptz not null default now()
);
create index if not exists guests_phone_idx on public.guests (phone);

create table if not exists public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- One row: what's open right now. Staff change it from gala/admin.html.
create table if not exists public.event_state (
  id                int primary key default 1 check (id = 1),
  auction           text not null default 'upcoming' check (auction in ('upcoming', 'open', 'closed')),
  auction_closes_at timestamptz,
  voting            text not null default 'upcoming' check (voting in ('upcoming', 'open', 'closed')),
  reveal_course     int check (reveal_course between 1 and 10),
  reveal_at         timestamptz,
  feedback_open     boolean not null default false,
  updated_at        timestamptz not null default now()
);
insert into public.event_state (id) values (1) on conflict (id) do nothing;

-- Lot rules the database enforces. Titles and descriptions guests see live in
-- gala/js/content.js; keep the opening bids and raises here in step with it.
create table if not exists public.lots (
  id        text primary key,
  no        int  not null,
  title     text not null,
  start_bid int  not null check (start_bid > 0),
  step      int  not null check (step > 0)
);
insert into public.lots (id, no, title, start_bid, step) values
  ('lot-01', 1, 'Vermejo Park Ranch',     2500, 250),
  ('lot-02', 2, 'Duck & goose hunt',       750,  50),
  ('lot-03', 3, 'Guided fly fishing (Arkansas)', 500, 50),
  ('lot-04', 4, 'Guided fly fishing (Taos)',     500, 50),
  ('lot-05', 5, 'Guided fly fishing (Virginia)', 500, 50),
  ('lot-06', 6, 'Whitewater rafting',      400,  25),
  ('lot-07', 7, 'Surfing experience',      400,  25),
  ('lot-08', 8, 'Denver Broncos tickets',  300,  25)
on conflict (id) do nothing;

create table if not exists public.bids (
  id         bigint generated always as identity primary key,
  lot_id     text not null references public.lots (id),
  guest_id   uuid not null references public.guests (id) on delete cascade,
  paddle     int  not null,
  amount     int  not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists bids_lot_idx on public.bids (lot_id, amount desc);

create table if not exists public.lots_paid (
  lot_id         text primary key references public.lots (id),
  paid_at        timestamptz not null default now(),
  method         text not null default 'card',
  stripe_session text
);

create table if not exists public.votes (
  guest_id   uuid primary key references public.guests (id) on delete cascade,
  course     int not null check (course between 1 and 10),
  updated_at timestamptz not null default now()
);

create table if not exists public.media (
  id         uuid primary key default gen_random_uuid(),
  guest_id   uuid not null references public.guests (id) on delete cascade,
  path       text not null unique,
  kind       text not null check (kind in ('image', 'video')),
  caption    text not null default '' check (char_length(caption) <= 140),
  by_name    text not null default '',
  status     text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  guest_id   uuid primary key references public.guests (id) on delete cascade,
  answers    jsonb not null,
  created_at timestamptz not null default now()
);

-- Helpers --------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- The auction counts as closed once its auto-close time has passed.
create or replace function public.auction_is_open()
returns boolean language sql stable security definer set search_path = '' as $$
  select auction = 'open' and (auction_closes_at is null or now() < auction_closes_at)
  from public.event_state where id = 1;
$$;

-- Older copies of the media table get the uploader's first name too.
alter table public.media add column if not exists by_name text not null default '';

-- The uploader's first name, filled in by the database so it can't be faked.
create or replace function public.media_set_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.by_name := coalesce((select split_part(name, ' ', 1) from public.guests where id = new.guest_id), 'Guest');
  return new;
end $$;
drop trigger if exists media_set_name on public.media;
create trigger media_set_name before insert on public.media for each row execute function public.media_set_name();

-- Row-level security -------------------------------------------------------

alter table public.guests      enable row level security;
alter table public.staff       enable row level security;
alter table public.event_state enable row level security;
alter table public.lots        enable row level security;
alter table public.bids        enable row level security;
alter table public.lots_paid   enable row level security;
alter table public.votes       enable row level security;
alter table public.media       enable row level security;
alter table public.feedback    enable row level security;

drop policy if exists "own or staff" on public.guests;
create policy "own or staff" on public.guests for select using (id = auth.uid() or public.is_staff());

drop policy if exists "own row" on public.staff;
create policy "own row" on public.staff for select using (user_id = auth.uid());

drop policy if exists "everyone reads" on public.event_state;
create policy "everyone reads" on public.event_state for select using (true);
drop policy if exists "staff update" on public.event_state;
create policy "staff update" on public.event_state for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "everyone reads" on public.lots;
create policy "everyone reads" on public.lots for select using (true);

-- Bids are public by paddle number (guest_id is an opaque id, used only so a
-- phone can tell which bids are its own). New bids only via place_bid().
drop policy if exists "everyone reads" on public.bids;
create policy "everyone reads" on public.bids for select using (true);

drop policy if exists "everyone reads" on public.lots_paid;
create policy "everyone reads" on public.lots_paid for select using (true);
drop policy if exists "staff write" on public.lots_paid;
create policy "staff write" on public.lots_paid for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "own or staff" on public.votes;
create policy "own or staff" on public.votes for select using (guest_id = auth.uid() or public.is_staff());

drop policy if exists "approved, own or staff" on public.media;
create policy "approved, own or staff" on public.media for select
  using (status = 'approved' or guest_id = auth.uid() or public.is_staff());
drop policy if exists "guests add their own" on public.media;
create policy "guests add their own" on public.media for insert
  with check (guest_id = auth.uid() and status = 'pending' and path like auth.uid()::text || '/%');
drop policy if exists "staff moderate" on public.media;
create policy "staff moderate" on public.media for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "own or staff" on public.feedback;
create policy "own or staff" on public.feedback for select using (guest_id = auth.uid() or public.is_staff());

-- "Automatically expose new tables" was switched off, so grant access here.
grant usage on schema public to anon, authenticated;
grant select on public.event_state, public.lots, public.bids, public.lots_paid, public.media to anon, authenticated;
grant select on public.guests, public.votes, public.feedback, public.staff to authenticated;
grant update on public.event_state to authenticated;
grant insert, update, delete on public.lots_paid to authenticated;
grant insert, update on public.media to authenticated;

-- Functions guests call ------------------------------------------------------

-- Create or update the signed-in guest's profile. Returns it with a paddle number.
create or replace function public.register_guest(p_name text, p_phone text)
returns public.guests language plpgsql security definer set search_path = '' as $$
declare
  g public.guests;
  n text := regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g');
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  n := btrim(n);
  if char_length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
  if char_length(n) not between 2 and 60 then raise exception 'Please enter your name.'; end if;
  if d !~ '^[0-9]{10}$' then raise exception 'Please enter a 10-digit US mobile number.'; end if;
  insert into public.guests (id, name, phone) values (auth.uid(), n, d)
    on conflict (id) do update set name = excluded.name, phone = excluded.phone
    returning * into g;
  return g;
end $$;

create or replace function public.place_bid(p_lot text, p_amount int)
returns public.bids language plpgsql security definer set search_path = '' as $$
declare
  l    public.lots;
  g    public.guests;
  top  public.bids;
  minb int;
  b    public.bids;
begin
  select * into g from public.guests where id = auth.uid();
  if g.id is null then raise exception 'Please sign in to bid.'; end if;
  if not public.auction_is_open() then raise exception 'Bidding is closed.'; end if;
  -- Lock the lot so two bids at the same moment are handled one after the other.
  select * into l from public.lots where id = p_lot for update;
  if l.id is null then raise exception 'That lot doesn''t exist.'; end if;
  select * into top from public.bids where lot_id = p_lot order by amount desc, created_at asc limit 1;
  if top.guest_id = g.id then raise exception 'You''re already the high bidder on this lot.'; end if;
  minb := coalesce(top.amount + l.step, l.start_bid);
  if p_amount is null or p_amount < minb then
    raise exception 'The minimum bid is now $%.', to_char(minb, 'FM999,999');
  end if;
  if p_amount > 100000 then raise exception 'Bids over $100,000 need to go through a staff member.'; end if;
  insert into public.bids (lot_id, guest_id, paddle, amount) values (p_lot, g.id, g.paddle, p_amount) returning * into b;
  return b;
end $$;

-- Voting code: four digits the host announces in the room when voting opens.
-- Only staff can read it. A guest's first vote must include it; after that
-- they can switch dishes without it. Five wrong codes and a guest is locked out.
create table if not exists public.vote_code (
  id         int primary key default 1 check (id = 1),
  code       text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.vote_code (id) values (1) on conflict (id) do nothing;
alter table public.vote_code enable row level security;
drop policy if exists "staff only" on public.vote_code;
create policy "staff only" on public.vote_code for all using (public.is_staff()) with check (public.is_staff());
grant select, update on public.vote_code to authenticated;

create table if not exists public.vote_code_tries (
  guest_id uuid primary key references public.guests (id) on delete cascade,
  tries    int not null default 0
);
alter table public.vote_code_tries enable row level security;
drop policy if exists "staff manage" on public.vote_code_tries;
create policy "staff manage" on public.vote_code_tries for all using (public.is_staff()) with check (public.is_staff());
grant select, delete on public.vote_code_tries to authenticated;

-- True if p_code is the current code. A wrong code counts against the guest
-- (and is committed, because callers report it instead of raising an error).
create or replace function public.vote_code_ok(p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  t int;
  c text;
begin
  select tries into t from public.vote_code_tries where guest_id = auth.uid();
  if coalesce(t, 0) >= 5 then raise exception 'Too many wrong codes. Please find a staff member.'; end if;
  select code into c from public.vote_code where id = 1;
  if coalesce(c, '') <> '' and upper(btrim(coalesce(p_code, ''))) = upper(c) then return true; end if;
  insert into public.vote_code_tries (guest_id, tries) values (auth.uid(), 1)
    on conflict (guest_id) do update set tries = public.vote_code_tries.tries + 1;
  return false;
end $$;

create or replace function public.check_vote_code(p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.guests where id = auth.uid()) then raise exception 'Please sign in to vote.'; end if;
  if (select voting from public.event_state where id = 1) <> 'open' then raise exception 'Voting isn''t open right now.'; end if;
  return public.vote_code_ok(p_code);
end $$;

-- Returns 'ok', or 'bad_code' when a first vote has a wrong or missing code.
drop function if exists public.cast_vote(int);
create or replace function public.cast_vote(p_course int, p_code text default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.guests where id = auth.uid()) then raise exception 'Please sign in to vote.'; end if;
  if (select voting from public.event_state where id = 1) <> 'open' then raise exception 'Voting isn''t open right now.'; end if;
  if p_course is null or p_course not between 1 and 10 then raise exception 'Pick a course.'; end if;
  if not exists (select 1 from public.votes where guest_id = auth.uid()) and not public.vote_code_ok(p_code) then
    return 'bad_code';
  end if;
  insert into public.votes (guest_id, course) values (auth.uid(), p_course)
    on conflict (guest_id) do update set course = excluded.course, updated_at = now();
  return 'ok';
end $$;

-- Vote counts per course, only once the winner has been revealed (staff see them any time).
create or replace function public.vote_results()
returns table (course int, votes bigint) language sql stable security definer set search_path = '' as $$
  select c.course, count(v.guest_id)
  from generate_series(1, 10) as c(course)
  left join public.votes v on v.course = c.course
  where public.is_staff() or (select reveal_course from public.event_state where id = 1) is not null
  group by c.course order by c.course;
$$;

create or replace function public.submit_feedback(p_answers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.guests where id = auth.uid()) then raise exception 'Please sign in first.'; end if;
  if not (select feedback_open from public.event_state where id = 1) then raise exception 'Feedback opens after the gala.'; end if;
  if jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 8000 then raise exception 'We couldn''t read that.'; end if;
  insert into public.feedback (guest_id, answers) values (auth.uid(), p_answers)
    on conflict (guest_id) do update set answers = excluded.answers, created_at = now();
end $$;

revoke execute on function public.register_guest(text, text), public.place_bid(text, int), public.cast_vote(int, text),
  public.check_vote_code(text), public.submit_feedback(jsonb) from public, anon;
grant execute on function public.register_guest(text, text), public.place_bid(text, int), public.cast_vote(int, text),
  public.check_vote_code(text), public.submit_feedback(jsonb) to authenticated;
revoke execute on function public.vote_code_ok(text) from public, anon, authenticated;
grant execute on function public.vote_results(), public.is_staff(), public.auction_is_open() to anon, authenticated;

-- Photo and video storage ------------------------------------------------------
-- Public bucket: files have unguessable names, and the app only lists approved
-- ones. Each guest uploads into a folder named after their own id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gala-media', 'gala-media', true, 104857600, array['image/*', 'video/*'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "gala guests upload to own folder" on storage.objects;
create policy "gala guests upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'gala-media' and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from public.guests where id = auth.uid()));

-- Live updates -------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['event_state', 'bids', 'lots_paid', 'media', 'votes', 'guests'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Staff -------------------------------------------------------------------
-- 1. Supabase -> Authentication -> Users -> Add user -> Create new user
--    (email + password, tick "Auto Confirm User").
-- 2. Run this line with their email:
--    insert into public.staff (user_id) select id from auth.users where email = 'name@example.org' on conflict do nothing;
