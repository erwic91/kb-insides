-- Aktueller Kaderbestand je Liga: welcher Manager hält welchen Spieler, mit
-- Punkten/Ø/Marktwert. Grundlage für Top-50 (beste Spieler der Liga) und
-- Kaderbesitz („wer hält Spieler X"). Wird beim Sammel-Lauf pro Liga ersetzt
-- (delete + insert), damit verkaufte Spieler nicht als Karteileichen bleiben.

create table if not exists squad_players (
  league_id     text not null,
  player_id     text not null,
  manager_id    text not null,
  points        integer,
  avg_points    integer,
  market_value  bigint,
  position      text,
  ts            timestamptz not null default now(),
  primary key (league_id, player_id)
);

alter table squad_players enable row level security;

comment on table squad_players is 'Aktueller Kaderbestand je Liga: welcher Manager welchen Spieler hält (+ Punkte/MV). Beim Sammel-Lauf pro Liga ersetzt.';
