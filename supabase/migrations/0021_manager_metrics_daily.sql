-- 0021: Tages-Snapshot der Manager-Kennzahlen erweitern.
-- Bisher hielt manager_tv_daily nur den Kaderwert je Tag. Für sortier-reaktive
-- Platzierungs-Pfeile (Rang der aktuell sortierten Spalte vs. Vortag) brauchen
-- wir auch Konto (rekonstruiert) und Punkte — daraus ergibt sich der Gesamtwert.
alter table manager_tv_daily add column if not exists cash   bigint;
alter table manager_tv_daily add column if not exists points  bigint;
