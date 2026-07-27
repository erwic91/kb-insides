import { ensureToken } from "../kickbase/session";
import { fetchRanking, fetchTransfers } from "../kickbase/endpoints";
import { politeDelay } from "../kickbase/http";
import { parseLeagueIds } from "../env";
import { parseRanking } from "./ranking";
import { parseTransfers } from "./transfers";
import {
  upsertLeague,
  upsertManagers,
  upsertManagerSnapshots,
  upsertTransfers,
} from "../db/ingest";

/**
 * Collector: iteriert über alle konfigurierten Ligen (KICKBASE_LEAGUE_IDS).
 * Pro Liga:
 *   M2 — aktuelles Ranking → leagues / managers / manager_snapshots
 *   M4 — Transfers je Manager → transfers
 * Idempotent (Upserts auf die PKs). Defensiv: ein Fehler bei Liga/Manager A
 * bricht den Rest nicht ab.
 *
 * ⚠ Die Transfer-API ist auf ~25 Einträge gedeckelt. Bei einer laufenden Saison
 * ab Spieltag 1 fällt das nicht ins Gewicht (Historie wächst mit); bei
 * Alt-Ligen mit langer Historie fehlen ältere Transfers (README / Checkpoint C).
 */

export interface LeagueIngestResult {
  leagueId: string;
  name?: string;
  day?: number | null;
  managers?: number;
  snapshots?: number;
  transfers?: number;
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
      // M2 — Ranking.
      const ranking = await fetchRanking(leagueId, { token });
      const rows = parseRanking(ranking, leagueId);
      await upsertLeague(rows.league);
      await upsertManagers(rows.managers);
      await upsertManagerSnapshots(rows.snapshots);
      await politeDelay();

      // M4 — Transfers je Manager.
      let transferCount = 0;
      for (const manager of rows.managers) {
        try {
          const tr = await fetchTransfers(leagueId, manager.id, { token });
          const transferRows = parseTransfers(tr, leagueId, manager.id);
          await upsertTransfers(transferRows);
          transferCount += transferRows.length;
        } catch {
          // Manager-Transfer-Fehler ignorieren, nächster Manager.
        }
        await politeDelay();
      }

      leagues.push({
        leagueId,
        name: rows.league.name,
        day: rows.snapshots[0]?.day ?? null,
        managers: rows.managers.length,
        snapshots: rows.snapshots.length,
        transfers: transferCount,
      });
    } catch (e) {
      leagues.push({ leagueId, error: (e as Error).message });
    }
  }

  return { leagues };
}
