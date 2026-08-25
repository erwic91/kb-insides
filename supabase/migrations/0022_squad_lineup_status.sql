-- 0022: Startelf-Wahrscheinlichkeit (Kickbase `lst`) je Kaderspieler erfassen.
-- Kickbase liefert im Squad-Endpunkt neben `st` (Verletzung/Sperre) ein Feld
-- `lst` = Aufstellungs-/Einsatzprognose (blauer Stern „Startelf sicher", grüner
-- Haken „wahrscheinlich", gelbes Fragezeichen, rotes Ausrufezeichen, X „fällt
-- aus"). Wir speichern den Rohcode; die Zahl→Icon-Zuordnung wird an echten
-- Daten verifiziert. Verfügbarkeit hängt von Modus & Spieltagsnähe ab.
alter table squad_players add column if not exists lineup_status smallint;
