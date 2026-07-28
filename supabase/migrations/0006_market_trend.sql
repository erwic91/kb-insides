-- Marktwert-Trend je Listing (mvt aus /market): 1 = steigend, 2 = fallend.
-- Grundlage für Auto-Targets (steigende, unterbewertete Spieler am Markt).

alter table market_log add column if not exists trend smallint;

comment on column market_log.trend is 'Marktwert-Trend (mvt): 1 = steigend, 2 = fallend.';
