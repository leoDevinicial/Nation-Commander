-- Diagnóstico do navegador (21/11): perda dos gráficos, fim abrupto da página, erros e modo leve automático.
-- Explica quedas que o servidor só vê como "conexão perdida". Sem políticas de RLS: só o servidor grava e lê.
create table public.client_diagnostics (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  guest boolean not null default false,
  display_name text not null,
  room_code text,
  in_match boolean not null default false,
  kind text not null check (kind in ('abrupt_end', 'context_lost', 'context_restored', 'context_failed', 'error', 'safe_mode')),
  detail text check (detail is null or char_length(detail) <= 600),
  device jsonb,
  game_version text not null,
  created_at timestamptz not null default now()
);
alter table public.client_diagnostics enable row level security;
create index client_diagnostics_created_at_idx on public.client_diagnostics (created_at desc);
create index client_diagnostics_user_idx on public.client_diagnostics (user_id, created_at desc);
comment on table public.client_diagnostics is 'Diagnóstico enviado pelo navegador (gráficos, fim abrupto, erros). Só o servidor acessa.';
