import { ensureToken, ensureOwnUserId } from "../kickbase/session";
import {
  fetchRanking,
  fetchAllTransfers,
  fetchLeaguesSelection,
  fetchMarket,
  fetchMeBudget,
} from "../kickbase/endpoints";
import { politeDelay } from "../kickbase/http";
import { parseLeagueIds } from "../env";
import { parseRanking } from "./ranking";
import { parseTransfers, type TransferRow } from "./transfers";
import { parseLeaguesSelection } from "./leaguesSelection";
import { parseMarket } from "./market";
import { reconstructCash } from "../compute/reconstruct";
import { START_BUDGET } from "../compute/constants";
import {
  upsertLeague,
  upsertLeagues,
  upsertManagers,
  upsertManagerSnapshots,
  upsertTransfers,
  upsertPlayers,
  upsertMarketLog,
  upsertPlayerMv,
  upsertCalibration,
  markIsMe,
} from "../db/ingest";

/**
 * Collector: iteriert über alle konfigurierten Ligen (KICKBASE_LEAGUE_IDS).
 * Einmal pro Lauf: /selection → alle Ligen des Nutzers in `leagues` (Basis für
 * den globalen Liga-Switch, unabhängig davon welche gesammelt werden).
 * Pro Liga:
 *   M2 — Ranking → leagues / managers / manager_snapshots (+ is_me)
 *   M4 — Transfers je Manager → transfers
 *   M6 — Markt → players / market_log / player_mv
 *   §8 — me/budget + eigene Rekonstruktion → calibration
 * Idempotent (Upserts auf die PKs), defensiv (Fehler isoliert je Liga/Manager).
 */

export interface LeagueIngestResult {
  leagueId: string;
  name?: string;
  day?: number | null;
  managers?: number;
  snapshots?: number;
  transfers?: number;
  market?: number;
  calibrationDelta?: number | null;
  error?: string;
}

export async function runCollect(): Promise<{ leagues: LeagueIngestResult[] }> {
  const leagueIds = parseLeagueIds();
  if (leagueIds.length === 0) {
    throw new Error("KICKBASE_LEAGUE_IDS ist leer — keine Liga zum Einsammeln.");
  }

  const token = await ensureToken();
  const ownId = await ensureOwnUserId();

  // Alle Ligen des Nutzers in `leagues` schreiben (Liga-Switch füllt sich).
  try {
    const selection = await fetchLeaguesSelection({ token });
    await upsertLeagues(parseLeaguesSelection(selection));
    await politeDelay();
  } catch {
    // /selection nicht kritisch — Ranking legt die Primärliga ohnehin an.
  }

  const leagues: LeagueIngestResult[] = [];

  for (const leagueId of leagueIds) {
    try {
      // M2 — Ranking.
      const ranking = await fetchRanking(leagueId, { token });
      const rows = parseRanking(ranking, leagueId);
      await upsertLeague(rows.league);
      await upsertManagers(rows.managers);
      await upsertManagerSnapshots(rows.snapshots);
      const day = rows.snapshots[0]?.day ?? null;
      if (ownId && rows.managers.some((m) => m.id === ownId)) {
        await markIsMe(leagueId, ownId);
      }
      await politeDelay();

      // M4 — Transfers je Manager.
      let transferCount = 0;
      let ownTransfers: TransferRow[] = [];
      for (const manager of rows.managers) {
        try {
          const tr = await fetchAllTransfers(leagueId, manager.id, { token });
          const transferRows = parseTransfers(tr, leagueId, manager.id);
          await upsertTransfers(transferRows);
          transferCount += transferRows.length;
          if (manager.id === ownId) ownTransfers = transferRows;
        } catch {
          // Manager-Transfer-Fehler ignorieren, nächster Manager.
        }
        await politeDelay();
      }

      // M6 — Markt.
      let marketCount = 0;
      try {
        const market = await fetchMarket(leagueId, { token });
        const parsed = parseMarket(market, leagueId, new Date().toISOString());
        await upsertPlayers(parsed.players);
        await upsertMarketLog(parsed.marketLog);
        await upsertPlayerMv(parsed.playerMv);
        marketCount = parsed.marketLog.length;
      } catch {
        // Markt-Fehler isolieren.
      }
      await politeDelay();

      // §8 — Selbstkalibrierung (eigenes Konto exakt vs. Rekonstruktion).
      let calibrationDelta: number | null = null;
      if (day != null) {
        try {
          const budget = await fetchMeBudget(leagueId, { token });
          const myActual = budget.b;
          // prizes = 0 bis Prämien verdrahtet sind. Discovery-Ergebnis: der
          // Endpunkt ist `/managers/{mid}/dashboard` (Feld `prft`); post-Reset
          // 0, daher noch nicht in die Geldformel gezogen (Checkpoint C, braucht
          // laufende Saison zur Bedeutungs-Klärung: Prämien vs. Handelsgewinn).
          const myReconstructed = reconstructCash(ownTransfers, {
            startBudget: START_BUDGET,
          });
          calibrationDelta = myReconstructed - myActual;
          await upsertCalibration({
            league_id: leagueId,
            day,
            my_reconstructed: myReconstructed,
            my_actual: myActual,
            delta: calibrationDelta,
          });
        } catch {
          // me/budget nur für eigene Ligen verfügbar.
        }
        await politeDelay();
      }

      leagues.push({
        leagueId,
        name: rows.league.name,
        day,
        managers: rows.managers.length,
        snapshots: rows.snapshots.length,
        transfers: transferCount,
        market: marketCount,
        calibrationDelta,
      });
    } catch (e) {
      leagues.push({ leagueId, error: (e as Error).message });
    }
  }

  return { leagues };
}
