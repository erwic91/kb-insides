-- 0017: Bestätigte Spieltags-Bonuspunkte je Manager.
-- Kickbase schüttet standardmäßig einen Spieltagsbonus aus: Saison-Punkte × 1000 €
-- (Manager-Modus). Um die Gegner-Kontoschätzung nicht während des laufenden
-- Spieltags (Live-Punkte) wackeln zu lassen, werden die Punkte einmal pro Woche
-- (dienstagabends, wenn der Spieltag final ist) hier „eingefroren".
-- Nur Manager-Ligen (game_mode = 2). points = kumulierte Saisonpunkte (sp).
create table if not exists manager_bonus_points (
  league_id  text not null,
  manager_id text not null,
  points     integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (league_id, manager_id)
);

alter table manager_bonus_points enable row level security;

drop policy if exists manager_bonus_points_read on manager_bonus_points;
create policy manager_bonus_points_read on manager_bonus_points
  for select to authenticated using (true);
