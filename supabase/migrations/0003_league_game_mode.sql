-- M-Design: Spielmodus je Liga, um modusabhängige Metriken korrekt zu steuern.
-- gpm:2 = Manager-Liga (jeder Spieler gekauft → Kontostand aus Transfers
-- rekonstruierbar). gpm:1 = Classic/Public (Draft-Startkader → Transfer-basierte
-- Rekonstruktion NICHT gültig; Geld-Spalten werden dort im UI ausgeblendet).

alter table leagues add column if not exists game_mode smallint;

comment on column leagues.game_mode is 'Kickbase-Spielmodus (gpm): 2 = Manager-Liga (Konto rekonstruierbar), 1 = Classic/Public (Draft-Startkader).';

-- Bekannte Werte aus /selection nachtragen (idempotent).
update leagues set game_mode = 2 where id in ('6847281','1762865') and game_mode is null;
update leagues set game_mode = 1 where id = '11320459' and game_mode is null;
