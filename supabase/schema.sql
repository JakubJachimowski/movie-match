-- MovieMatch — schemat bazy (konta, parowanie, decyzje, dopasowania)
-- Wklej całość w Supabase Dashboard → SQL Editor → Run.
-- Bezpieczne do ponownego uruchomienia (idempotentne tam, gdzie się da).

create extension if not exists pgcrypto with schema extensions;

-- =========================================================
-- 1. PROFILE
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- =========================================================
-- 2. CONNECTIONS (parowanie dwóch użytkowników)
-- =========================================================
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  invite_code text unique,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (user_b is null or user_b <> user_a)
);

-- tylko jeden aktywny (pending) zaproszony kod na użytkownika naraz
create unique index if not exists connections_one_pending_per_user
  on public.connections (user_a)
  where status = 'pending';

alter table public.connections enable row level security;

-- =========================================================
-- 3. DECISIONS (swipe'y — osobne per połączenie i użytkownik)
-- =========================================================
-- Brak unique (connection_id, user_id, movie_id) — celowo: ten sam film może
-- pojawić się wielokrotnie (np. odrzucony, po 7 dniach wraca do puli, odrzucony
-- ponownie, a w końcu polubiony) i każda taka decyzja ma zostać osobnym wierszem,
-- żeby w historii znajomego widniała wielokrotnie, a nie się nadpisywała.
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  movie_id text not null,
  title text not null,
  year text,
  image text,
  direction text not null check (direction in ('left', 'right')),
  created_at timestamptz not null default now()
);

alter table public.decisions enable row level security;

-- Migracja dla bazy, w której tabela już istnieje ze starym ograniczeniem
-- (uruchom raz, bezpieczne do wielokrotnego uruchomienia):
alter table public.decisions
  drop constraint if exists decisions_connection_id_user_id_movie_id_key;

-- =========================================================
-- 4. MATCHES (wypełniane automatycznie triggerem)
-- =========================================================
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections (id) on delete cascade,
  movie_id text not null,
  title text not null,
  year text,
  image text,
  matched_at timestamptz not null default now(),
  unique (connection_id, movie_id)
);

alter table public.matches enable row level security;

-- =========================================================
-- 5. FUNKCJE POMOCNICZE
-- =========================================================
create or replace function public.is_paired_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and ((user_a = auth.uid() and user_b = p_user_id)
        or (user_b = auth.uid() and user_a = p_user_id))
  );
$$;

-- =========================================================
-- 6. RPC: zapraszanie i parowanie
-- =========================================================
create or replace function public.create_invite()
returns table (invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_expires timestamptz := now() + interval '1 day';
begin
  -- usuń poprzedni, jeszcze niewykorzystany kod tego użytkownika
  delete from public.connections
  where user_a = auth.uid() and status = 'pending';

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    begin
      insert into public.connections (user_a, status, invite_code, expires_at)
      values (auth.uid(), 'pending', v_code, v_expires);
      exit;
    exception when unique_violation then
      -- kolizja kodu — spróbuj ponownie z nowym
    end;
  end loop;

  return query select v_code, v_expires;
end;
$$;

create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn_id uuid;
begin
  select id into v_conn_id
  from public.connections
  where invite_code = upper(p_code)
    and status = 'pending'
    and expires_at > now()
    and user_a <> auth.uid();

  if v_conn_id is null then
    raise exception 'Nieprawidłowy lub wygasły kod zaproszenia.';
  end if;

  update public.connections
  set user_b = auth.uid(), status = 'accepted', accepted_at = now()
  where id = v_conn_id;

  return v_conn_id;
end;
$$;

grant execute on function public.create_invite() to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

-- =========================================================
-- 7. TRIGGER: automatyczne wykrywanie dopasowania
-- =========================================================
create or replace function public.check_for_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_partner_has_right boolean;
begin
  if new.direction <> 'right' then
    return new;
  end if;

  select case when user_a = new.user_id then user_b else user_a end
  into v_partner_id
  from public.connections
  where id = new.connection_id;

  if v_partner_id is null then
    return new;
  end if;

  select exists (
    select 1 from public.decisions
    where connection_id = new.connection_id
      and user_id = v_partner_id
      and movie_id = new.movie_id
      and direction = 'right'
  ) into v_partner_has_right;

  if v_partner_has_right then
    insert into public.matches (connection_id, movie_id, title, year, image)
    values (new.connection_id, new.movie_id, new.title, new.year, new.image)
    on conflict (connection_id, movie_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_match on public.decisions;
create trigger trg_check_match
  after insert or update on public.decisions
  for each row execute function public.check_for_match();

-- =========================================================
-- 8. RLS — POLITYKI
-- =========================================================

-- profiles
drop policy if exists profiles_select_own_or_paired on public.profiles;
create policy profiles_select_own_or_paired
  on public.profiles for select
  using (id = auth.uid() or public.is_paired_with(id));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  using (id = auth.uid());

-- connections (insert/update tylko przez powyższe funkcje RPC, jako właściciel definer)
drop policy if exists connections_select_own on public.connections;
create policy connections_select_own
  on public.connections for select
  using (user_a = auth.uid() or user_b = auth.uid());

-- decisions
drop policy if exists decisions_select_own_or_partner on public.decisions;
create policy decisions_select_own_or_partner
  on public.decisions for select
  using (
    user_id = auth.uid()
    or connection_id in (
      select id from public.connections
      where status = 'accepted' and (user_a = auth.uid() or user_b = auth.uid())
    )
  );

drop policy if exists decisions_insert_own on public.decisions;
create policy decisions_insert_own
  on public.decisions for insert
  with check (
    user_id = auth.uid()
    and connection_id in (
      select id from public.connections
      where status = 'accepted' and (user_a = auth.uid() or user_b = auth.uid())
    )
  );

drop policy if exists decisions_update_own on public.decisions;
create policy decisions_update_own
  on public.decisions for update
  using (user_id = auth.uid());

drop policy if exists decisions_delete_own on public.decisions;
create policy decisions_delete_own
  on public.decisions for delete
  using (user_id = auth.uid());

-- matches (insert tylko przez trigger, jako właściciel definer)
drop policy if exists matches_select_members on public.matches;
create policy matches_select_members
  on public.matches for select
  using (
    connection_id in (
      select id from public.connections
      where status = 'accepted' and (user_a = auth.uid() or user_b = auth.uid())
    )
  );

-- =========================================================
-- 8b. REALTIME — powiadomienia o nowych dopasowaniach na żywo w apce
-- =========================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end $$;

-- =========================================================
-- 9. GRANTY (uzupełniające, na wypadek gdyby domyślne nie objęły nowych tabel)
-- =========================================================
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.connections to authenticated;
grant select, insert, update, delete on public.decisions to authenticated;
grant select on public.matches to authenticated;

-- =========================================================
-- 10. STORAGE — bucket na avatary (publiczny odczyt, zapis tylko właściciel)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own
  on storage.objects for update
  using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own
  on storage.objects for delete
  using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
