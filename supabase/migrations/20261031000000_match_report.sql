-- Relatório pós-partida no histórico: as amostras (tropas, construções, território, recursos e PIB a cada 30 s) e as
-- medalhas de cada jogador, as mesmas que a tela de resultado mostra (MatchEndInfo.report).

alter table public.matches
  add column report jsonb;

comment on column public.matches.report is
  'Relatório pós-partida: { samples: [{ t, players: [...] }], medals: [{ slot, medals: [...] }] }. Nulo nas partidas gravadas antes desta migração.';

create or replace function public.record_match(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.matches (
    room_code, mode, map_seed, started_at, ended_at, duration_seconds, end_reason, winner_id, game_version, balance_mode, report
  ) values (
    payload ->> 'room_code',
    payload ->> 'mode',
    (payload ->> 'map_seed')::bigint,
    (payload ->> 'started_at')::timestamptz,
    (payload ->> 'ended_at')::timestamptz,
    (payload ->> 'duration_seconds')::integer,
    payload ->> 'end_reason',
    nullif(payload ->> 'winner_id', '')::uuid,
    payload ->> 'game_version',
    coalesce(payload ->> 'balance_mode', 'parity'),
    case when jsonb_typeof(payload -> 'report') = 'object' then payload -> 'report' else null end
  )
  returning id into new_id;

  insert into public.match_players (
    match_id, slot, player_id, is_ai, display_name, country_id, result,
    units_produced, units_lost, units_killed, structures_built, structures_lost,
    structures_destroyed, resources_gathered, resources_spent, damage_dealt, national_summary
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
    coalesce((p ->> 'damage_dealt')::integer, 0),
    case when jsonb_typeof(p -> 'national_summary') = 'object' then p -> 'national_summary' else null end
  from jsonb_array_elements(payload -> 'players') as p;

  return new_id;
end;
$$;

revoke execute on function public.record_match(jsonb) from public, anon, authenticated;
grant execute on function public.record_match(jsonb) to service_role;
