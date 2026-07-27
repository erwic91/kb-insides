import { ensureToken } from "../kickbase/session";
import { fetchRanking } from "../kickbase/endpoints";
import { politeDelay } from "../kickbase/http";
import { parseLeagueIds } from "../env";
import { parseRanking } from "./ranking";
import { upsertLeague, upsertManagers, upsertManagerSnapshots } from "../db/ingest";

/**
 * M3 — Backfill: lädt für jede Liga das Ranking aller Spieltage (1..aktueller
 * Spieltag) nach und schreibt je Spieltag einen manager_snapshots-Eintrag →
 * Kaderwert-/Punkte-Historie. Idempotent (Upsert auf PK). Manuell auslösbar,
 * nicht Teil des täglichen Crons.
 *
 * Der ANGEFORDERTE Spieltag ist maßgeblich (dayOverride), nicht das `day` der
 * Antwort. Spieltage vor dem Liga-Start liefern ein leeres `us` → übersprungen.
 *
 * ⚠ Offen (SPEC §12, an echten Backfill-Daten zu verifizieren): Liefert
 * `ranking?dayNumber=X` den DAMALIGEN Kaderwert oder den aktuellen? Solange
 * ungeklärt, ist die tv-Historie mit Vorsicht zu lesen.
 */

export interface BackfillLeagueResult {
  leagueId: string;
  currentDay?: number;
  daysWritten?: number;
  daysSkipped?: number;
  error?: string;
}

export async function runBackfill(
  leagueIds: string[] = parseLeagueIds(),
): Promise<{ leagues: BackfillLeagueResult[] }> {
  if (leagueIds.length === 0) {
    throw new Error("Keine Liga angegeben (KICKBASE_LEAGUE_IDS leer).");
  }

  const token = await ensureToken();
  const leagues: BackfillLeagueResult[] = [];

  for (const leagueId of leagueIds) {
    try {
      // Aktuellen Spieltag ermitteln.
      const current = await fetchRanking(leagueId, { token });
      const currentDay = current.day;
      await politeDelay();

      let daysWritten = 0;
      let daysSkipped = 0;

      for (let day = 1; day <= currentDay; day++) {
        try {
          const ranking = await fetchRanking(leagueId, { token, dayNumber: day });
          if (ranking.us.length === 0) {
            daysSkipped += 1;
            await politeDelay();
            continue;
          }
          const rows = parseRanking(ranking, leagueId, { dayOverride: day });
          await upsertLeague(rows.league);
          await upsertManagers(rows.managers);
          await upsertManagerSnapshots(rows.snapshots);
          daysWritten += 1;
        } catch {
          daysSkipped += 1;
        }
        await politeDelay();
      }

      leagues.push({ leagueId, currentDay, daysWritten, daysSkipped });
    } catch (e) {
      leagues.push({ leagueId, error: (e as Error).message });
    }
  }

  return { leagues };
}
