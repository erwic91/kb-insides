-- 0019: Täglicher Marktwert je Kaderspieler (liga-/spielerbezogen).
-- Ermöglicht „Entwicklung seit gestern" für ALLE Manager (nicht nur den eigenen
-- Kader). Wird im nächtlichen Collector aus den ohnehin geholten Kadern befüllt
-- (kein zusätzlicher Kickbase-Call). „Gestern"/„vorgestern" = die zwei jüngsten
-- Snapshots vor heute; „heute" ist der Live-Marktwert in squad_players.
create table if not exists player_mv_daily (
  league_id    text   not null,
  player_id    text   not null,
  snap_date    date   not null,
  market_value bigint not null,
  primary key (league_id, player_id, snap_date)
);

create index if not exists player_mv_daily_lookup
  on player_mv_daily (league_id, player_id, snap_date desc);

alter table player_mv_daily enable row level security;

drop policy if exists player_mv_daily_read on player_mv_daily;
create policy player_mv_daily_read on player_mv_daily
  for select to authenticated using (true);
