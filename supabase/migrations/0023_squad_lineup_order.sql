-- 0023: Aufstellungs-Reihenfolge (Kickbase `lo`) je Kaderspieler erfassen.
-- Der Squad-Endpunkt liefert pro Spieler ein Feld `lo` = Lineup-Order (0 = TW,
-- 1..10 = Feldspieler). Spieler MIT `lo` stehen in der aktuellen Startelf, `pos`
-- gibt die Reihe (1 TW, 2 ABW, 3 MF, 4 ANG). Grundlage für Aufgestellt-Icon und
-- die Fußballfeld-Darstellung. NULL = nicht aufgestellt (Bank).
alter table squad_players add column if not exists lineup_order smallint;
