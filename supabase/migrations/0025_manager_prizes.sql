-- Kickbase-Prämien/Gewinn (`prft` aus dem Manager-Dashboard) je Snapshot.
-- Exakte Gutschriften-Summe pro Manager (Preisgeld/Boni) — Grundlage für eine
-- exakte Kontorekonstruktion aller Manager (nicht nur des eigenen, exakten
-- /me/budget). Wird gegen den eigenen exakten Kontostand validiert.
ALTER TABLE manager_snapshots
  ADD COLUMN IF NOT EXISTS prizes BIGINT;

COMMENT ON COLUMN manager_snapshots.prizes IS
  'Kickbase-Prämien/Gewinn (dashboard.prft) — kumulierte Gutschriften des Managers.';
