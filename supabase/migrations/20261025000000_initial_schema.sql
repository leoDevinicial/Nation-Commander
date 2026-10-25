-- Nation Commander — esquema inicial: perfis de jogadores, partidas e estatísticas.
-- Escritas em partidas/estatísticas são feitas apenas pelo servidor de jogo (service_role),
-- que é a autoridade sobre o resultado. Clientes só leem.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null
    check (char_length(username) between 3 and 20 and username ~ '^[A-Za-z0-9_]+$'),
  display_name text check (display_name is null or char_length(display_name) <= 40),
  preferred_country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil público de cada jogador (1:1 com auth.users).';

create unique index profiles_username_lower_idx on public.profiles (lower(username));

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  mode text not null check (mode in ('pvp', 'vs_ai')),
  map_seed bigint not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  end_reason text not null check (end_reason in ('hq_destroyed', 'forfeit', 'disconnect', 'draw')),
  winner_id uuid references public.profiles (id) on delete set null,
  game_version text not null,
  created_at timestamptz not null default now()
);

create index matches_ended_at_idx on public.matches (ended_at desc);
create index matches_winner_id_idx on public.matches (winner_id);

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  slot smallint not null check (slot between 0 and 7),
  -- null para jogadores controlados pela IA
  player_id uuid references public.profiles (id) on delete set null,
  is_ai boolean not null default false,
  display_name text not null,
  country_id text not null,
  result text not null check (result in ('win', 'loss', 'draw')),
  units_produced integer not null default 0,
  units_lost integer not null default 0,
  units_killed integer not null default 0,
  structures_built integer not null default 0,
  structures_lost integer not null default 0,
  structures_destroyed integer not null default 0,
  resources_gathered integer not null default 0,
  resources_spent integer not null default 0,
  damage_dealt integer not null default 0,
  primary key (match_id, slot)
);

create index match_players_player_id_idx on public.match_players (player_id);

-- Estatísticas agregadas por jogador (calculadas, nunca armazenadas em duplicidade).
create view public.player_stats
with (security_invoker = true) as
select
  p.id as player_id,
  p.username,
  count(mp.match_id)::integer as matches_played,
  count(*) filter (where mp.result = 'win')::integer as wins,
  count(*) filter (where mp.result = 'loss')::integer as losses,
  count(*) filter (where mp.result = 'draw')::integer as draws,
  coalesce(sum(mp.units_produced), 0)::integer as units_produced,
  coalesce(sum(mp.units_killed), 0)::integer as units_killed,
  coalesce(sum(mp.units_lost), 0)::integer as units_lost,
  coalesce(sum(mp.structures_destroyed), 0)::integer as structures_destroyed,
  coalesce(sum(mp.resources_gathered), 0)::integer as resources_gathered,
  coalesce(sum(m.duration_seconds), 0)::integer as total_seconds_played
from public.profiles p
left join public.match_players mp on mp.player_id = p.id
left join public.matches m on m.id = mp.match_id
group by p.id, p.username;

-- updated_at automático
create function public.set_updated_at()
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

-- Cria o perfil quando um usuário se cadastra. O username vem de raw_user_meta_data.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  final_name text;
begin
  if requested is null or requested !~ '^[A-Za-z0-9_]{3,20}$' then
    final_name := 'jogador_' || substr(replace(new.id::text, '-', ''), 1, 8);
  else
    final_name := requested;
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, final_name, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), final_name), 40));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Verificação de disponibilidade de username antes do cadastro.
-- security invoker: perfis já são legíveis publicamente pela política de select.
create function public.username_available(name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;

create policy "Perfis são públicos"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Jogador edita o próprio perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Partidas são públicas"
  on public.matches for select
  to anon, authenticated
  using (true);

create policy "Participações são públicas"
  on public.match_players for select
  to anon, authenticated
  using (true);

-- O username só pode mudar pelo fluxo de cadastro; o jogador edita display_name e país preferido.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, preferred_country) on public.profiles to authenticated;

-- Gravação atômica de uma partida e suas participações. Chamado apenas pelo servidor de jogo.
create function public.record_match(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.matches (
    room_code, mode, map_seed, started_at, ended_at, duration_seconds, end_reason, winner_id, game_version
  ) values (
    payload ->> 'room_code',
    payload ->> 'mode',
    (payload ->> 'map_seed')::bigint,
    (payload ->> 'started_at')::timestamptz,
    (payload ->> 'ended_at')::timestamptz,
    (payload ->> 'duration_seconds')::integer,
    payload ->> 'end_reason',
    nullif(payload ->> 'winner_id', '')::uuid,
    payload ->> 'game_version'
  )
  returning id into new_id;

  insert into public.match_players (
    match_id, slot, player_id, is_ai, display_name, country_id, result,
    units_produced, units_lost, units_killed, structures_built, structures_lost,
    structures_destroyed, resources_gathered, resources_spent, damage_dealt
  )
  select
    new_id,
    (p ->> 'slot')::smallint,
    nullif(p ->> 'player_id', '')::uuid,
    coalesce((p ->> 'is_ai')::boolean, false),
    p ->> 'display_name',
    p ->> 'country_id',
    p ->> 'result',
    coalesce((p ->> 'units_produced')::integer, 0),
    coalesce((p ->> 'units_lost')::integer, 0),
    coalesce((p ->> 'units_killed')::integer, 0),
    coalesce((p ->> 'structures_built')::integer, 0),
    coalesce((p ->> 'structures_lost')::integer, 0),
    coalesce((p ->> 'structures_destroyed')::integer, 0),
    coalesce((p ->> 'resources_gathered')::integer, 0),
    coalesce((p ->> 'resources_spent')::integer, 0),
    coalesce((p ->> 'damage_dealt')::integer, 0)
  from jsonb_array_elements(payload -> 'players') as p;

  return new_id;
end;
$$;

revoke execute on function public.record_match(jsonb) from public, anon, authenticated;
grant execute on function public.record_match(jsonb) to service_role;
