-- Vitórias alternativas (lote 2, item 15): territorial e política entram como motivos de fim de partida.
alter table public.matches drop constraint matches_end_reason_check;
alter table public.matches
  add constraint matches_end_reason_check
  check (end_reason in ('hq_destroyed', 'forfeit', 'disconnect', 'draw', 'territory', 'political'));
