-- 0014: Marktwert-Historie (gestern/vorgestern) je Kaderspieler.
-- Basis für die Spalte „Entwicklung seit gestern" in „Dein Kader": der aktuelle
-- Marktwert steht in `market_value`, hier kommen die beiden Vortageswerte dazu.
-- Wird pro Sammel-Lauf aus der Spieler-MV-Kurve befüllt (nur eigener Manager).
alter table squad_players
  add column if not exists mv_prev_day  bigint,  -- Marktwert gestern
  add column if not exists mv_prev2_day bigint;  -- Marktwert vorgestern
