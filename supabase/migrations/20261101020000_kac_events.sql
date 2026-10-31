-- KAC — Kaiser Anti Cheat: diário persistente de eventos de segurança (gravidade média ou maior).
-- O servidor de jogo grava com a chave de serviço e apaga o que passar de 90 dias (retenção). Sem políticas de RLS:
-- só o servidor acessa; a equipe lê pelo painel do Supabase. `user_id` é o id interno da conta (ou "guest:<hash>").
create table public.kac_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null,
  category text not null,
  severity text not null check (severity in ('medium', 'high')),
  room_code text,
  user_id text,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.kac_events enable row level security;
create index kac_events_occurred_at_idx on public.kac_events (occurred_at desc);
create index kac_events_user_idx on public.kac_events (user_id);
create index kac_events_category_idx on public.kac_events (category);
comment on table public.kac_events is 'KAC: eventos de segurança de gravidade média ou maior (retenção de 90 dias). Só o servidor acessa.';
