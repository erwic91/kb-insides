import { ensureToken, ensureOwnUserId } from "../kickbase/session";
import {
  fetchRanking,
  fetchAllTransfers,
  fetchLeaguesSelection,
  fetchMarket,
  fetchMeBudget,
  fetchManagerDashboard,
  fetchManagerSquad,
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
  const token = await ensureToken();
  const ownId = await ensureOwnUserId();

  // /selection zuerst: schreibt ALLE Ligen des Nutzers in `leagues` (Switch
  // füllt sich) UND liefert die Liste, die eingesammelt wird — so wird jede neu
  // beigetretene Liga automatisch erfasst, ohne KICKBASE_LEAGUE_IDS zu pflegen.
  let discovered: string[] = [];
  try {
    const selection = await fetchLeaguesSelection({ token });
    const parsed = parseLeaguesSelection(selection);
    await upsertLeagues(parsed);
    discovered = parsed.map((l) => l.id);
    await politeDelay();
  } catch {
    // /selection nicht kritisch — Fallback ist KICKBASE_LEAGUE_IDS.
  }

  // KICKBASE_LEAGUE_IDS bleibt optionaler Override/Zusatz (Union, dedupliziert).
  const configured = parseLeagueIds();
  const leagueIds = [...new Set([...discovered, ...configured])];
  if (leagueIds.length === 0) {
    throw new Error(
      "Keine Ligen zum Einsammeln: /selection lieferte nichts und KICKBASE_LEAGUE_IDS ist leer.",
    );
  }

  const leagues: LeagueIngestResult[] = [];
  for (const leagueId of leagueIds) {
    leagues.push(await collectOneLeague(leagueId, token, ownId));
  }
  return { leagues };
}

/** Sammelt genau eine Liga on-demand (Refresh-Button / gezielter Lauf). */
export async function runCollectLeague(leagueId: string): Promise<LeagueIngestResult> {
  const token = await ensureToken();
  const ownId = await ensureOwnUserId();
  return collectOneLeague(leagueId, token, ownId);
}

/**
 * Pro-Liga-Ingest: Ranking → Transfers je Manager → Markt → Selbstkalibrierung.
 * Fehler bleiben auf die Liga isoliert (Rückgabe trägt dann `error`).
 */
async function collectOneLeague(
  leagueId: string,
  token: string,
  ownId: string | null,
): Promise<LeagueIngestResult> {
  try {
    // M2 — Ranking.
    const ranking = await fetchRanking(leagueId, { token });
    const rows = parseRanking(ranking, leagueId);
    await upsertLeague(rows.league);
    await upsertManagers(rows.managers);
    const day = rows.snapshots[0]?.day ?? null;
    if (ownId && rows.managers.some((m) => m.id === ownId)) {
      await markIsMe(leagueId, ownId);
    }
    await politeDelay();

    const snapById = new Map(rows.snapshots.map((s) => [s.manager_id, s]));

    // M4 — Transfers je Manager (volle Historie via ?start-Paginierung) +
    // Kaderwert-Anreicherung: früh in der Saison führt das Ranking keinen
    // Kaderwert; dann aus dem Manager-Dashboard (`tv`/`tp`) nachziehen.
    let transferCount = 0;
    let ownTransfers: TransferRow[] = [];
    for (const manager of rows.managers) {
      const snap = snapById.get(manager.id);
      if (snap && snap.team_value == null) {
        try {
          const dash = await fetchManagerDashboard(leagueId, manager.id, { token });
          snap.team_value = dash.tv ?? null;
          snap.points = snap.points ?? dash.tp ?? null;
        } catch {
          // Dashboard optional — Kaderwert bleibt dann null.
        }
        await politeDelay();
      }

      // A2 — Kadergröße (squad.it.length). Auch Spielerstatus für spätere Alerts.
      if (snap) {
        try {
          const squad = await fetchManagerSquad(leagueId, manager.id, { token });
          snap.squad_size = squad.it.length;
        } catch {
          // Squad optional — Kadergröße bleibt dann null.
        }
        await politeDelay();
      }

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

    // Snapshots erst jetzt schreiben — mit angereichertem Kaderwert/Punkten.
    await upsertManagerSnapshots(rows.snapshots);
    await politeDelay();

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

    return {
      leagueId,
      name: rows.league.name,
      day,
      managers: rows.managers.length,
      snapshots: rows.snapshots.length,
      transfers: transferCount,
      market: marketCount,
      calibrationDelta,
    };
  } catch (e) {
    return { leagueId, error: (e as Error).message };
  }
}
