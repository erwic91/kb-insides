-- Multi-User Phase 2 — Mandantentrennung. Die liga-geteilten Tabellen bekommen
-- SELECT-Policies: ein Nutzer sieht eine Zeile nur, wenn er über league_access
-- Zugriff auf die betreffende Liga hat. Schreiben bleibt dem Service-Role-Client
-- vorbehalten (RLS-Bypass, Collector). players sind globale Stammdaten und für
-- alle Angemeldeten lesbar. Siehe docs/MULTI_USER_DESIGN.md §6.

-- Hilfsausdruck als Policy je Tabelle (kein SECURITY DEFINER nötig — league_access
-- ist per RLS bereits auf die eigenen Zeilen beschränkt, aber die Policy prüft
-- explizit user_id = auth.uid()).

create policy read_shared_leagues on leagues for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = leagues.id));

create policy read_shared_managers on managers for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = managers.league_id));

create policy read_shared_snapshots on manager_snapshots for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = manager_snapshots.league_id));

create policy read_shared_transfers on transfers for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = transfers.league_id));

create policy read_shared_market on market_log for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = market_log.league_id));

create policy read_shared_player_mv on player_mv for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = player_mv.league_id));

create policy read_shared_squad on squad_players for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = squad_players.league_id));

-- calibration BEWUSST OHNE Lese-Policy: die Tabelle enthält den EXAKTEN eigenen
-- Kontostand (my_actual) des sammelnden Nutzers. Der ist nutzer-privat und darf
-- NICHT über eine geteilte Liga-Policy an Ligamitglieder gelangen. Die
-- Selbstkalibrierung wird in Phase 3 pro Nutzer (aus user_budget) neu aufgebaut.

create policy read_shared_prizes on prizes for select
  using (exists (select 1 from league_access la
                 where la.user_id = auth.uid() and la.league_id = prizes.league_id));

-- Globale Spieler-Stammdaten: für alle Angemeldeten lesbar.
create policy read_players on players for select
  using (auth.role() = 'authenticated');
