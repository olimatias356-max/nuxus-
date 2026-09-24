-- =============================================================================
-- MbareteFans · 002 · Profiles, sign-up validation (age gate, username rules),
-- blocks and visibility helpers.
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null
    check (username ~ '^[a-z0-9._]{3,24}$' and username !~ '(^[.])|([.]$)|([.]{2})'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_path text check (avatar_path is null or (avatar_path like id::text || '/%' and char_length(avatar_path) <= 200)),
  country char(2) not null default 'PY' references public.countries (code),
  is_verified boolean not null default false,
  followers_count integer not null default 0,
  following_count integer not null default 0,
  posts_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'restricted', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (username);
create index profiles_username_trgm on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_display_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);

alter table public.profiles enable row level security;

-- Private per-user data: never exposed through the API.
create table private.user_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_date date not null,
  terms_version text not null,
  accepted_terms_at timestamptz not null default now(),
  signup_ip text
);
alter table private.user_private enable row level security;

create table private.reserved_usernames (
  username text primary key
);
alter table private.reserved_usernames enable row level security;
insert into private.reserved_usernames (username) values
  ('admin'), ('administrador'), ('root'), ('soporte'), ('support'), ('ayuda'), ('help'),
  ('mbarete'), ('mbaretefans'), ('mbarete.fans'), ('mbarete_fans'), ('oficial'), ('official'),
  ('moderador'), ('moderacion'), ('moderation'), ('seguridad'), ('security'), ('staff'),
  ('equipo'), ('team'), ('pagos'), ('payments'), ('billing'), ('verificacion'), ('verified'),
  ('system'), ('sistema'), ('null'), ('undefined'), ('me'), ('yo'), ('api'), ('www')
on conflict do nothing;

-- Possible impersonation of verified creators, queued for human review
-- (spec: detect similar names with risk levels, do not auto-block common names).
create table private.impersonation_flags (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  similar_to uuid not null references auth.users (id) on delete cascade,
  similarity real not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table private.impersonation_flags enable row level security;

-- -----------------------------------------------------------------------------
-- Blocks
-- -----------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;
grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;

create policy "users see their own blocks" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "users block others" on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "users unblock" on public.blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- The blocker can list whom they blocked (profiles RLS hides them otherwise).
create function public.get_my_blocks()
returns table (user_id uuid, username text, display_name text, avatar_path text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc
$$;

-- Is there a block in either direction between the caller and p_other?
create function private.is_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = (select auth.uid()) and blocked_id = p_other)
       or (blocker_id = p_other and blocked_id = (select auth.uid()))
  )
$$;

-- Can the caller see content from p_user? (not blocked, not suspended)
create function private.can_see_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = (select auth.uid())
      or (
        exists (select 1 from public.profiles where id = p_user and status <> 'suspended')
        and not private.is_blocked_with(p_user)
      )
$$;

-- Caller's account is allowed to publish / interact.
create function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'active')
$$;


-- -----------------------------------------------------------------------------
-- Profile policies and column-level privileges.
-- Clients may only change display_name, bio, avatar_path and country.
-- -----------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, bio, avatar_path, country) on public.profiles to authenticated;

create policy "profiles are visible unless blocked or suspended" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (status <> 'suspended' and not private.is_blocked_with(id))
  );

create policy "users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function private.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := private.clean_text(new.display_name);
  new.bio := private.clean_text(new.bio);
  if char_length(new.display_name) = 0 then
    raise exception 'El nombre no puede estar vacío' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function private.profiles_before_update();

-- -----------------------------------------------------------------------------
-- Username validation shared by sign-up and the availability check.
-- Returns null when valid, otherwise a user-facing error message.
-- -----------------------------------------------------------------------------
create function private.username_problem(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_username is null or p_username !~ '^[a-z0-9._]{3,24}$' then
    return 'El usuario debe tener 3 a 24 caracteres: letras minúsculas, números, punto o guion bajo.';
  end if;
  if p_username ~ '(^[.])|([.]$)|([.]{2})' then
    return 'El usuario no puede empezar ni terminar con punto, ni tener dos puntos seguidos.';
  end if;
  if exists (select 1 from private.reserved_usernames where username = p_username)
     or p_username ~ '^(mbarete|admin|soporte|support|oficial|official)' then
    return 'Ese nombre de usuario está reservado.';
  end if;
  if exists (select 1 from public.profiles where username = p_username) then
    return 'Ese nombre de usuario ya está en uso.';
  end if;
  return null;
end;
$$;

create function public.check_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.username_problem(lower(btrim(p_username)))
$$;

-- -----------------------------------------------------------------------------
-- Sign-up hook: creates the profile from the metadata sent by the app and
-- enforces server-side rules (age gate, terms, username). Raising here aborts
-- the sign-up, so a client cannot bypass the checks.
-- -----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username text := lower(btrim(v_meta ->> 'username'));
  v_display text := private.clean_text(v_meta ->> 'display_name');
  v_country text := upper(coalesce(nullif(v_meta ->> 'country', ''), 'PY'));
  v_birth date;
  v_min_age integer := private.config_num('auth.min_age', 18)::integer;
  v_terms text := v_meta ->> 'terms_version';
  v_problem text;
  v_similar record;
begin
  v_problem := private.username_problem(v_username);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;

  begin
    v_birth := (v_meta ->> 'birth_date')::date;
  exception when others then
    v_birth := null;
  end;
  if v_birth is null or v_birth > current_date or v_birth < date '1900-01-01' then
    raise exception 'Fecha de nacimiento inválida' using errcode = '22023';
  end if;
  if v_birth > (current_date - make_interval(years => v_min_age)) then
    raise exception 'Debés tener al menos % años para usar MbareteFans', v_min_age using errcode = '22023';
  end if;

  if v_terms is null or v_terms <> (private.config('app.terms_version') #>> '{}') then
    raise exception 'Tenés que aceptar los términos y la política de privacidad vigentes' using errcode = '22023';
  end if;

  if not exists (select 1 from public.countries where code = v_country and enabled) then
    v_country := 'PY';
  end if;

  if v_display is null or char_length(v_display) = 0 then
    v_display := v_username;
  end if;

  insert into public.profiles (id, username, display_name, country)
  values (new.id, v_username, left(v_display, 50), v_country);

  insert into private.user_private (user_id, birth_date, terms_version, signup_ip)
  values (new.id, v_birth, v_terms, private.request_ip());

  -- Flag look-alikes of verified creators for human review (never auto-block).
  for v_similar in
    select p.id, extensions.similarity(p.username, v_username) as sim
    from public.profiles p
    where p.is_verified and p.id <> new.id
      and extensions.similarity(p.username, v_username) >= 0.6
    order by 2 desc
    limit 3
  loop
    insert into private.impersonation_flags (user_id, username, similar_to, similarity)
    values (new.id, v_username, v_similar.id, v_similar.sim);
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Profile search (RPC to avoid building PostgREST filters from user input).
-- -----------------------------------------------------------------------------
create function public.search_profiles(p_query text, p_limit integer default 20)
returns setof public.profiles
language sql
stable
set search_path = ''
as $$
  select p.*
  from public.profiles p
  where char_length(btrim(p_query)) >= 1
    and (
      p.username ilike '%' || replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or p.display_name ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by (p.username = lower(btrim(p_query))) desc, p.is_verified desc, p.followers_count desc
  limit least(greatest(p_limit, 1), 50)
$$;
