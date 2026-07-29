-- Premium/Multi-Liga: ein Liga-Limit je Nutzer. Free = 1 aktive Liga (Standard),
-- Premium = höheres Limit. Aktive Ligen sind die Zeilen in league_access; deren
-- activated_at trägt die 7-Tage-Sperre fürs Entfernen (verallgemeinert die
-- bisherige Einzel-Liga-Wechselsperre). Siehe docs/MULTI_USER_DESIGN.md.

alter table profiles
  add column if not exists max_leagues integer not null default 1;

alter table league_access
  add column if not exists activated_at timestamptz not null default now();

comment on column profiles.max_leagues is 'Maximale Anzahl gleichzeitig aktiver Ligen (1 = free, >1 = premium).';
comment on column league_access.activated_at is 'Wann die Liga aktiviert wurde — Basis der 7-Tage-Sperre fürs Entfernen.';
