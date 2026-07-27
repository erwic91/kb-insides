-- Monitoring-Startpunkt je Liga. Für Ligen, die nie zurückgesetzt werden
-- (perpetuelle Classic/Manager-Ligen mit riesiger Historie): nur Daten ab
-- diesem Zeitpunkt laden — das vermeidet teure Voll-Paginierung (Timeouts) und
-- definiert eine klare Monitoring-Basis. NULL = keine Grenze.

alter table leagues add column if not exists tracking_since timestamptz;

comment on column leagues.tracking_since is 'Monitoring-Startpunkt: Transfers/Daten vor diesem Zeitpunkt werden nicht geladen. NULL = keine Grenze (alles Verfügbare).';
