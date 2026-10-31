-- Denúncias do chat da Comunidade (menu). O servidor grava com a chave de serviço; a equipe lê no painel.
-- Sem políticas de RLS: só o servidor acessa. `author_id`/`reporter_id` são ids de conta ou "guest:<id>" (texto).
create table public.community_reports (
  id bigint generated always as identity primary key,
  reporter_id text not null,
  reporter_name text not null,
  author_id text not null,
  author_name text not null,
  message text not null,
  reason text not null check (reason in ('offense', 'hate', 'spam', 'cheat', 'other')),
  removed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.community_reports enable row level security;
create index community_reports_created_at_idx on public.community_reports (created_at desc);
create index community_reports_author_idx on public.community_reports (author_id);
comment on table public.community_reports is 'Denúncias do chat da Comunidade. removed = a mensagem saiu do chat por denúncias. Só o servidor acessa.';
