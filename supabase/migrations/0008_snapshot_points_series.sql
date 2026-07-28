-- Formkurve: Punkte je Spieltag (Serie) pro Manager. Kickbase liefert im
-- Ranking (`us[].lp`) die vollständige Saison-Serie der Spieltagspunkte. Wir
-- legen sie als JSON-Array auf dem Snapshot ab (der jüngste Snapshot trägt die
-- aktuelle Serie) — Grundlage für die Formkurve-Sparklines im Dashboard.

alter table manager_snapshots
  add column if not exists points_series jsonb;

comment on column manager_snapshots.points_series is 'Punkte je Spieltag (aus ranking us[].lp) — Formkurve-Serie, Array von int|null.';
