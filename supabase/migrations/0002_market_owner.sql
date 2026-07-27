-- M6: Anbieter + Marktwert eines Marktlistings festhalten.
-- market_log kannte bisher keinen Anbieter; für den Marktradar wird er gebraucht.
alter table market_log
  add column if not exists offered_by      text,   -- Anbieter (Manager-ID); NULL = Kickbase/Computer
  add column if not exists offered_by_name text,   -- Anzeigename des Anbieters
  add column if not exists market_value    bigint; -- Marktwert zum Listing-Zeitpunkt
