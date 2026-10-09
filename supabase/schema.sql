-- Karbala Rooms database (Supabase / Postgres).
-- This is the same SQL as the migrations applied to the live project, in order.
-- Run it on an empty project to rebuild the schema, then load rooms with scripts/parse_sheet.py.

-- 1. core_schema --------------------------------------------------------------
create extension if not exists btree_gist;

create table public.buildings (
  id text primary key,
  name text not null,
  code text not null,
  sort int not null default 0
);

create table public.rooms (
  id text primary key,
  building_id text not null references public.buildings(id),
  number text not null,
  floor text not null,
  floor_sort int not null default 0,
  room_type text not null default 'Standard',
  beds int not null default 0 check (beds >= 0),
  extra_beds int not null default 0 check (extra_beds >= 0),
  sharing text not null default 'none' check (sharing in ('none','male','female')),
  notes text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rooms_building_idx on public.rooms (building_id, floor_sort, sort);

create table public.stays (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id),
  category text not null default 'tour'
    check (category in ('tour','group_leader','khidmat_guzar','hr_mawaid','staff','blocked')),
  tour_id text,
  group_name text,
  guest_name text,
  phone text,
  pax int check (pax is null or pax >= 0),
  notes text,
  check_in timestamptz not null,
  check_out timestamptz,
  checked_out_at timestamptz,
  auto_checked_out boolean not null default false,
  cancelled_at timestamptz,
  transferred_from uuid references public.stays(id),
  transferred_to uuid references public.stays(id),
  source text not null default 'app' check (source in ('app','sheet')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stays_dates_ok check (check_out is null or check_out > check_in)
);
create index stays_room_idx on public.stays (room_id, check_in);
create index stays_tour_idx on public.stays (tour_id);
create index stays_open_idx on public.stays (check_out) where checked_out_at is null and cancelled_at is null;

create table public.activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null,
  room_id text references public.rooms(id),
  stay_id uuid references public.stays(id),
  tour_id text,
  summary text not null,
  details jsonb
);
create index activity_at_idx on public.activity (at desc);

-- updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger rooms_touch before update on public.rooms for each row execute function public.touch_updated_at();
create trigger stays_touch before update on public.stays for each row execute function public.touch_updated_at();

-- effective end of a stay
create or replace function public.stay_end(s public.stays) returns timestamptz
language sql immutable set search_path = public as $$
  select coalesce(s.checked_out_at, s.check_out, 'infinity'::timestamptz)
$$;

-- reject double bookings and over-capacity sharing rooms
create or replace function public.stays_validate() returns trigger
language plpgsql set search_path = public as $$
declare
  r public.rooms;
  clash record;
  used int;
  new_end timestamptz := coalesce(new.checked_out_at, new.check_out, 'infinity'::timestamptz);
begin
  if new.source = 'sheet' or new.cancelled_at is not null then return new; end if;
  if tg_op = 'UPDATE'
     and new.room_id = old.room_id and new.check_in >= old.check_in
     and new_end <= coalesce(old.checked_out_at, old.check_out, 'infinity'::timestamptz)
     and coalesce(new.pax,0) <= coalesce(old.pax,0) and old.cancelled_at is null then
    return new; -- shrinking a stay never creates a clash
  end if;
  select * into r from public.rooms where id = new.room_id;
  if r.sharing = 'none' or new.category = 'blocked' then
    select s.id, s.tour_id, s.group_name, s.check_out into clash from public.stays s
     where s.room_id = new.room_id and s.id <> new.id and s.cancelled_at is null
       and tstzrange(s.check_in, coalesce(s.checked_out_at, s.check_out, 'infinity'::timestamptz))
           && tstzrange(new.check_in, new_end)
     limit 1;
    if found then
      raise exception 'Room % is already taken by % for these dates', r.number,
        coalesce(nullif(trim(coalesce(clash.group_name,'') || ' ' || coalesce(clash.tour_id,'')), ''), 'another stay')
        using errcode = 'P0001';
    end if;
  else
    select coalesce(sum(coalesce(s.pax,1)),0) into used from public.stays s
     where s.room_id = new.room_id and s.id <> new.id and s.cancelled_at is null
       and tstzrange(s.check_in, coalesce(s.checked_out_at, s.check_out, 'infinity'::timestamptz))
           && tstzrange(new.check_in, new_end);
    if used + coalesce(new.pax,1) > r.beds + r.extra_beds then
      raise exception 'Room % only has % of % places free for these dates', r.number,
        greatest(r.beds + r.extra_beds - used, 0), r.beds + r.extra_beds using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger stays_validate before insert or update on public.stays
  for each row execute function public.stays_validate();

-- activity log written by the database itself
create or replace function public.stays_log() returns trigger
language plpgsql set search_path = public as $$
declare
  who text := coalesce(nullif(trim(coalesce(new.group_name,'') || ' ' || coalesce(new.tour_id,'')), ''), initcap(replace(new.category,'_',' ')));
  rn text;
  act text;
  msg text;
begin
  select number into rn from public.rooms where id = new.room_id;
  if tg_op = 'INSERT' then
    if new.source = 'sheet' or new.transferred_from is not null then return null; end if;
    if new.category = 'blocked' then act := 'block'; msg := 'Blocked room ' || rn || ' (' || who || ')';
    elsif new.check_in <= now() + interval '10 minutes' then act := 'check_in'; msg := who || ' checked in to ' || rn;
    else act := 'reserve'; msg := who || ' booked into ' || rn || ' from ' || to_char(new.check_in at time zone 'Asia/Baghdad', 'DD Mon');
    end if;
  else
    if new.transferred_to is not null and old.transferred_to is null then
      act := 'transfer';
      msg := who || ' moved from ' || rn || ' to ' || (select r.number from public.rooms r join public.stays s on s.room_id = r.id where s.id = new.transferred_to);
    elsif new.cancelled_at is not null and old.cancelled_at is null then
      act := 'cancel'; msg := who || ' cancelled in ' || rn;
    elsif new.checked_out_at is not null and old.checked_out_at is null then
      if new.auto_checked_out then act := 'auto_check_out'; msg := who || ' auto checked out of ' || rn;
      else act := 'check_out'; msg := who || ' checked out of ' || rn; end if;
    elsif new.room_id <> old.room_id then
      act := 'move'; msg := who || ' booking moved from ' || (select number from public.rooms where id = old.room_id) || ' to ' || rn;
    elsif new.check_out is distinct from old.check_out or new.check_in is distinct from old.check_in then
      act := 'dates'; msg := who || ' in ' || rn || ' now leaves ' ||
        coalesce(to_char(new.check_out at time zone 'Asia/Baghdad', 'DD Mon HH24:MI'), 'open-ended');
    elsif new.checked_out_at is null and old.checked_out_at is not null then
      act := 'undo_check_out'; msg := who || ' check-out undone in ' || rn;
    else
      act := 'edit'; msg := who || ' details updated in ' || rn;
    end if;
  end if;
  insert into public.activity (action, room_id, stay_id, tour_id, summary)
  values (act, new.room_id, new.id, new.tour_id, msg);
  return null;
end $$;
create trigger stays_log after insert or update on public.stays
  for each row execute function public.stays_log();

-- transfer a stay to another room in one step
create or replace function public.transfer_stay(p_stay uuid, p_room text) returns uuid
language plpgsql set search_path = public as $$
declare
  s public.stays;
  new_id uuid;
  t timestamptz := now();
begin
  select * into s from public.stays where id = p_stay for update;
  if not found then raise exception 'Stay not found'; end if;
  if s.room_id = p_room then raise exception 'They are already in that room'; end if;
  if s.check_in > t then
    update public.stays set room_id = p_room where id = p_stay;
    return p_stay;
  end if;
  insert into public.stays (room_id, category, tour_id, group_name, guest_name, phone, pax, notes,
                            check_in, check_out, transferred_from, source)
  values (p_room, s.category, s.tour_id, s.group_name, s.guest_name, s.phone, s.pax, s.notes,
          t, s.check_out, s.id, 'app')
  returning id into new_id;
  update public.stays set checked_out_at = t, transferred_to = new_id where id = p_stay;
  return new_id;
end $$;

-- automatic 08:00 check-outs
create or replace function public.auto_checkout() returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  update public.stays set checked_out_at = check_out, auto_checked_out = true
   where checked_out_at is null and cancelled_at is null and check_out is not null and check_out <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- open access: single supervisor, no login (by the owner's choice)
alter table public.buildings enable row level security;
alter table public.rooms enable row level security;
alter table public.stays enable row level security;
alter table public.activity enable row level security;
create policy "open read" on public.buildings for select to anon, authenticated using (true);
create policy "open all" on public.rooms for all to anon, authenticated using (true) with check (true);
create policy "open all" on public.stays for all to anon, authenticated using (true) with check (true);
create policy "open read" on public.activity for select to anon, authenticated using (true);

grant execute on function public.transfer_stay(uuid, text) to anon, authenticated;
grant execute on function public.auto_checkout() to anon, authenticated;

alter publication supabase_realtime add table public.rooms, public.stays, public.activity;

-- 2. log_definer_and_cron -----------------------------------------------------
alter function public.stays_log() security definer;
revoke execute on function public.stays_log() from public, anon, authenticated;
create extension if not exists pg_cron;
select cron.schedule('auto-checkout', '*/5 * * * *', $$select public.auto_checkout()$$);

-- 3. tours_planning -----------------------------------------------------------
alter table public.stays add column arrived_at timestamptz;

create table public.imports (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  file_name text,
  tours_total int not null default 0,
  tours_new int not null default 0,
  tours_changed int not null default 0
);

create table public.tours (
  tour_id text primary key,               -- short id, e.g. 2429 (last part of the ERP reference)
  tour_ref text unique,                   -- NKERP/TOUR/2026/2429
  office text,
  to_name text,
  to_its text,
  country text,
  city text,
  arrival timestamptz,
  departure timestamptz,
  entry_port text,
  exit_port text,
  arrival_flight text,
  departure_flight text,
  pax int not null default 0,
  pax_required int not null default 0,
  pax_not_required int not null default 0,
  approved_option text,
  mawaid boolean,
  -- planning
  karbala_in timestamptz,
  karbala_out timestamptz,
  preferred_building text references public.buildings(id),
  gender text check (gender in ('family','male','female')),
  notes text,
  status text not null default 'open' check (status in ('open','cancelled','not_needed')),
  erp_changed text,                       -- what changed on the last ERP import after planning started
  import_id bigint references public.imports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tours_arrival_idx on public.tours (arrival);
create trigger tours_touch before update on public.tours for each row execute function public.touch_updated_at();

alter table public.tours enable row level security;
alter table public.imports enable row level security;
create policy "open all" on public.tours for all to anon, authenticated using (true) with check (true);
create policy "open all" on public.imports for all to anon, authenticated using (true) with check (true);
alter publication supabase_realtime add table public.tours;

-- 4. tours_plan_order ---------------------------------------------------------
alter table public.tours add column if not exists plan_order text check (plan_order in ('karbala_first','najaf_first','skip'));
comment on column public.tours.plan_order is 'Supervisor override for the month planner: which city first, or leave the tour out. Null = let the planner decide.';
