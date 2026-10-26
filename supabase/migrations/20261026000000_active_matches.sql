-- Partidas em andamento salvas pelo servidor de jogo, para retomar depois de um reinício
-- (atualização, queda ou servidor que adormece). Uma linha por sala; apagada quando a partida
-- termina. Acesso só pela service role do servidor: RLS ligada e nenhuma política.

create table public.active_matches (
  room_code text primary key,
  -- ids dos jogadores humanos (uuid do Supabase Auth ou "guest:<id>"), para achar a partida na volta
  player_ids text[] not null,
  -- RoomSave em JSON, comprimido com gzip e codificado em base64
  state text not null,
  updated_at timestamptz not null default now()
);

create index active_matches_player_ids_idx on public.active_matches using gin (player_ids);

alter table public.active_matches enable row level security;

comment on table public.active_matches is
  'Estado completo das partidas em andamento (simulação, camada nacional, operações e IA), gravado periodicamente e no encerramento do servidor. Usado só pelo servidor de jogo.';
