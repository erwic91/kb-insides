-- Per-Liga-Einstellungen (vom Nutzer konfigurierbar):
--   game_mode      (0003)  2 = 200 Mio / Nullspieler, 1 = 50 Mio / zugeloste Spieler
--   start_budget   (0001)  Budget zum Startzeitpunkt
--   tracking_since (0004)  Liga-/Monitoring-Start
--   include_history        Daten vor tracking_since einbeziehen?
--   bonus_mode             Spieltagsboni vs. nur Lock-In-Bonus

alter table leagues add column if not exists include_history boolean not null default true;
alter table leagues add column if not exists bonus_mode text not null default 'matchday';

comment on column leagues.include_history is 'Historische Daten vor tracking_since einbeziehen (true) oder ignorieren (false).';
comment on column leagues.bonus_mode is 'Bonusmodell: matchday = Spieltagsboni, lockin = nur Lock-In-Bonus.';

-- Sinnvolle Start-Budgets für die bekannten Ligen.
update leagues set start_budget = 200000000 where id in ('6847281','1762865');
update leagues set start_budget = 50000000  where id = '11320459';
