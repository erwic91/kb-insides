-- 0020: Voll-Pool-Marktwert je Bundesliga-Team (Grundlage fürs Markt-Potenzial).
-- Aus /v4/competitions/{cid}/teams/{teamId}/teamprofile (it[].mv summiert).
-- Wettbewerbsweit (nicht liga-spezifisch) — Marktwerte sind global. Der freie
-- Marktwert einer Liga = Σ Pool − Σ besessene Kaderwerte dieser Liga.
create table if not exists market_pool (
  competition_id text   not null,
  team_id        text   not null,
  total_mv       bigint not null,
  player_count   int    not null,
  updated_at     timestamptz not null default now(),
  primary key (competition_id, team_id)
);

alter table market_pool enable row level security;

drop policy if exists market_pool_read on market_pool;
create policy market_pool_read on market_pool
  for select to authenticated using (true);
