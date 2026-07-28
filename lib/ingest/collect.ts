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
  getLeagueMoneyBasis,
  replaceSquadPlayers,
  type SquadPlayerRow,
} from "../db/ingest";
import type { PlayerRow } from "./market";

const SQUAD_POS: Record<number, string> = { 1: "TW", 2: "ABW", 3: "MF", 4: "ANG" };
const posLabel = (pos: number | null | undefined): string | null =>
  pos == null ? null : (SQUAD_POS[pos] ?? String(pos));

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
  /** Stille Pro-Manager-Fehler (squad/dashboard/transfer), max. 5. */
  warnings?: string[];
}

/**
 * Ermittelt alle einzusammelnden Ligen: /selection (alle Ligen des Nutzers,
 * wird zugleich in `leagues` upgesertet) vereint mit KICKBASE_LEAGUE_IDS.
 */
export async function discoverLeagues(token: string): Promise<string[]> {
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
  const configured = parseLeagueIds();
  return [...new Set([...discovered, ...configured])];
}

export async function runCollect(): Promise<{ leagues: LeagueIngestResult[] }> {
  const token = await ensureToken();
  const ownId = await ensureOwnUserId();

  const leagueIds = await discoverLeagues(token);
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

    // Basis-Snapshots SOFORT schreiben (Kaderwert/Punkte aus dem Ranking) —
    // bevor die teure Pro-Manager-Schleife läuft. Bei großen Ligen kann diese
    // (viele Transfer-Seiten + squad/dashboard) ins Funktions-Timeout laufen;
    // die Snapshots sind dann trotzdem da. Anreicherung wird später re-upsertet.
    await upsertManagerSnapshots(rows.snapshots);
    await politeDelay();

    const snapById = new Map(rows.snapshots.map((s) => [s.manager_id, s]));

    // Budget-Basis: Startpunkt (Transfer-Cutoff) + Start-Budget (Kalibrierung).
    const { trackingSince, startBudget } = await getLeagueMoneyBasis(leagueId);

    // M4 — Transfers je Manager (volle Historie via ?start-Paginierung) +
    // Kaderwert-Anreicherung: früh in der Saison führt das Ranking keinen
    // Kaderwert; dann aus dem Manager-Dashboard (`tv`/`tp`) nachziehen.
    let transferCount = 0;
    let ownTransfers: TransferRow[] = [];
    const squadPlayers: SquadPlayerRow[] = []; // Kaderbestand (Top-50 / Besitz)
    const squadPlayerMeta: PlayerRow[] = []; // Namen für die players-Tabelle
    const warnings: string[] = []; // stille Fehler surfacen (Debugging)
    const warn = (msg: string) => {
      if (warnings.length < 5) warnings.push(msg);
    };
    const hasTv = (n: number | null) => n != null && n > 0;
    for (const manager of rows.managers) {
      const snap = snapById.get(manager.id);
      if (snap) {
        // Kadergröße + Kaderwert aus dem Kader: Kaderwert = Σ Marktwerte der
        // Kaderspieler (die eigentliche Definition, zuverlässiger als ranking.tv,
        // das bei frisch erstellten Ligen 0 sein kann).
        try {
          const squad = await fetchManagerSquad(leagueId, manager.id, { token });
          snap.squad_size = squad.it.length;
          let sum = 0;
          for (const pl of squad.it) {
            sum += pl.mv ?? 0;
            if (pl.i == null) continue;
            squadPlayers.push({
              league_id: leagueId,
              player_id: pl.i,
              manager_id: manager.id,
              points: pl.p ?? null,
              avg_points: pl.ap ?? null,
              market_value: pl.mv ?? null,
              position: posLabel(pl.pos),
            });
            squadPlayerMeta.push({
              id: pl.i,
              name: pl.n ?? null,
              team: pl.tid ?? null,
              position: posLabel(pl.pos),
            });
          }
          if (hasTv(sum)) snap.team_value = sum;
        } catch (e) {
          warn(`squad ${manager.id}: ${(e as Error).message}`);
        }
        await politeDelay();

        // Fallback, falls weder Ranking noch Kader einen Kaderwert lieferten:
        // Manager-Dashboard (tv/tp). WICHTIG: auch bei team_value === 0 laufen.
        if (!hasTv(snap.team_value)) {
          try {
            const dash = await fetchManagerDashboard(leagueId, manager.id, { token });
            if (hasTv(dash.tv ?? null)) snap.team_value = dash.tv ?? null;
            snap.points = snap.points ?? dash.tp ?? null;
          } catch (e) {
            warn(`dashboard ${manager.id}: ${(e as Error).message}`);
          }
          await politeDelay();
        }
      }

      try {
        const tr = await fetchAllTransfers(leagueId, manager.id, {
          token,
          since: trackingSince,
        });
        const transferRows = parseTransfers(tr, leagueId, manager.id);
        await upsertTransfers(transferRows);
        transferCount += transferRows.length;
        if (manager.id === ownId) ownTransfers = transferRows;
      } catch (e) {
        warn(`transfer ${manager.id}: ${(e as Error).message}`);
      }
      await politeDelay();
    }

    // Snapshots erst jetzt schreiben — mit angereichertem Kaderwert/Punkten.
    await upsertManagerSnapshots(rows.snapshots);

    // Kaderbestand ablegen (Top-50 / Besitz). Namen zuerst (Markt überschreibt
    // gleich mit den vollständigeren Namen), dann den Bestand ersetzen.
    if (squadPlayerMeta.length > 0) await upsertPlayers(squadPlayerMeta);
    await replaceSquadPlayers(leagueId, squadPlayers);
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

        // Exakten eigenen Kontostand in den eigenen Snapshot schreiben — das ist
        // die verlässliche Quelle (die Rekonstruktion ist nur eine Näherung, in
        // gpm:1 sogar prinzipbedingt ungenau). Wird im Dashboard bevorzugt.
        const ownSnap = ownId ? snapById.get(ownId) : undefined;
        if (ownSnap) {
          ownSnap.cash_actual = myActual;
          await upsertManagerSnapshots([ownSnap]);
        }

        // Rekonstruktion mit dem tatsächlichen Liga-Start-Budget (nicht der
        // globalen Konstante) und den ab Startpunkt gefilterten Transfers.
        // prizes = 0 bis Boni verdrahtet sind (Checkpoint C, braucht Prämien-
        // /Bonus-Daten der laufenden Saison).
        const myReconstructed = reconstructCash(ownTransfers, {
          startBudget: startBudget ?? START_BUDGET,
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
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (e) {
    return { leagueId, error: (e as Error).message };
  }
}
