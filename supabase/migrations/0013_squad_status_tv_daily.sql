-- Kaderliste & Kaderwert-Trend.
-- 1) Kader-Status (st aus dem squad-Endpunkt: 0 = fit, >0 = angeschlagen/Ausfall)
--    für die eigene Kader-Liste.
-- 2) Täglicher Kaderwert je Manager (kalendertäglich, nicht je Spieltag) —
--    Grundlage für „Veränderung zum Vortag in %".

alter table squad_players
  add column if not exists status integer;

create table if not exists manager_tv_daily (
  league_id  text not null,
  manager_id text not null,
  snap_date  date not null,
  team_value bigint,
  primary key (league_id, manager_id, snap_date)
);

alter table manager_tv_daily enable row level security;

create policy read_tv_daily on manager_tv_daily for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = manager_tv_daily.league_id));
