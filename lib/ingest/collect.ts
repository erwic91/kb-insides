import { ensureToken } from "../kickbase/session";
import { fetchRanking } from "../kickbase/endpoints";
import { politeDelay } from "../kickbase/http";
import { parseLeagueIds } from "../env";
import { parseRanking } from "./ranking";
import { upsertLeague, upsertManagers, upsertManagerSnapshots } from "../db/ingest";

/**
 * M2-Collector: iteriert über alle konfigurierten Ligen (KICKBASE_LEAGUE_IDS)
 * und ingestet je Liga das aktuelle Ranking → leagues / managers /
 * manager_snapshots. Idempotent (Upserts auf die PKs). Pro Liga defensiv in
 * try/catch, damit ein Fehler in Liga A den Lauf für Liga B nicht abbricht.
 *
 * Spätere Meilensteine erweitern den Zyklus (Transfers M4, Markt M6, …).
 */

export interface LeagueIngestResult {
  leagueId: string;
  name?: string;
  day?: number | null;
  managers?: number;
  snapshots?: number;
  error?: string;
}

export async function runCollect(): Promise<{ leagues: LeagueIngestResult[] }> {
  const leagueIds = parseLeagueIds();
  if (leagueIds.length === 0) {
    throw new Error("KICKBASE_LEAGUE_IDS ist leer — keine Liga zum Einsammeln.");
  }

  const token = await ensureToken();
  const leagues: LeagueIngestResult[] = [];

  for (const leagueId of leagueIds) {
    try {
      const ranking = await fetchRanking(leagueId, { token });
      const rows = parseRanking(ranking, leagueId);

      await upsertLeague(rows.league);
      await upsertManagers(rows.managers);
      await upsertManagerSnapshots(rows.snapshots);

      leagues.push({
        leagueId,
        name: rows.league.name,
        day: rows.snapshots[0]?.day ?? null,
        managers: rows.managers.length,
        snapshots: rows.snapshots.length,
      });
    } catch (e) {
      leagues.push({ leagueId, error: (e as Error).message });
    }
    await politeDelay();
  }

  return { leagues };
}
