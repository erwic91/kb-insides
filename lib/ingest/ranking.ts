import { RankingSchema, type Ranking } from "../kickbase/schemas";

/**
 * M2 — Ranking-Ingest (reine Transformation, ohne Netz/DB).
 *
 * Wandelt eine `/ranking`-Antwort in die DB-Zeilen für `leagues`, `managers`
 * und `manager_snapshots` um. Der eigentliche Upsert (idempotent auf den PKs)
 * passiert in lib/db/ingest.ts.
 */

export interface LeagueRow {
  id: string;
  name: string;
}

export interface ManagerRow {
  league_id: string;
  id: string;
  name: string | null;
}

export interface SnapshotRow {
  league_id: string;
  manager_id: string;
  day: number;
  team_value: number | null;
  points: number | null;
}

export interface RankingRows {
  league: LeagueRow;
  managers: ManagerRow[];
  snapshots: SnapshotRow[];
}

/**
 * Baut aus der (bereits zod-validierten oder rohen) Ranking-Antwort die Zeilen.
 * Akzeptiert auch rohe Objekte — validiert dann selbst.
 */
export function parseRanking(
  input: Ranking | unknown,
  leagueId: string,
  opts: { dayOverride?: number } = {},
): RankingRows {
  const res = RankingSchema.parse(input);
  // Beim Backfill (M3) wird der ANGEFORDERTE Spieltag verwendet, nicht das
  // `day` der Antwort — so landet jeder historische Lauf unter dem richtigen Tag.
  const day = opts.dayOverride ?? res.day;

  const managers: ManagerRow[] = res.us.map((u) => ({
    league_id: leagueId,
    id: u.i,
    name: u.n ?? null,
  }));

  const snapshots: SnapshotRow[] = res.us.map((u) => ({
    league_id: leagueId,
    manager_id: u.i,
    day,
    team_value: u.tv ?? null,
    points: u.sp ?? null,
  }));

  return {
    league: { id: leagueId, name: res.ti ?? leagueId },
    managers,
    snapshots,
  };
}
