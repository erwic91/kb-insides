-- 0024: Startelf-Wahrscheinlichkeit (Kickbase `prob`, 1..5) je Spieler.
-- prob ist spielerglobal (unabhängig vom Besitzer) und steckt NICHT im Squad-
-- Endpunkt, sondern im Spielerprofil. Wir reichern die players-Tabelle nächtlich
-- gestaffelt an (stalest zuerst). 1 = Startelf sicher … 5 = spielt nicht.
alter table players add column if not exists lineup_prob     smallint;
alter table players add column if not exists lineup_prob_at  timestamptz;
