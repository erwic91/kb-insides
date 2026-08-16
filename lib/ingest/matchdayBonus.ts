import { getServiceClient } from "../db/client";

/** Spieltagsbonus: Kickbase schreibt je Saisonpunkt diesen Betrag gut (Manager-Modus). */
export const MATCHDAY_BONUS_PER_POINT = 1000;

export interface MatchdayBonusResult {
  leagues: number;
  managers: number;
}

/**
 * Friert die aktuellen Saisonpunkte (sp) je Manager als „bestätigte" Bonus-
 * punkte ein — Grundlage für den Spieltagsbonus (Punkte × 1000 €). Gedacht für
 * einen wöchentlichen Lauf (dienstagabends), wenn der Spieltag final ist, damit
 * die Gegner-Kontoschätzung nicht während des Live-Wochenendes schwankt.
 *
 * Nur Manager-Ligen (game_mode = 2). Liest die jüngsten manager_snapshots
 * (bereits vom nächtlichen Collector befüllt) — kein zusätzlicher Kickbase-Call.
 */
export async function snapshotMatchdayBonus(): Promise<MatchdayBonusResult> {
  const supabase = getServiceClient();
  const { data: leagues } = await supabase.from("leagues").select("id").eq("game_mode", 2);

  let managers = 0;
  for (const lg of leagues ?? []) {
    const leagueId = lg.id as string;

    // Jüngster erfasster Spieltag dieser Liga.
    const { data: dayRow } = await supabase
      .from("manager_snapshots")
      .select("day")
      .eq("league_id", leagueId)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    const day = dayRow?.day as number | null | undefined;
    if (day == null) continue;

    const { data: snaps } = await supabase
      .from("manager_snapshots")
      .select("manager_id, points")
      .eq("league_id", leagueId)
      .eq("day", day);

    const nowIso = new Date().toISOString();
    const rows = (snaps ?? [])
      .filter((s) => s.points != null)
      .map((s) => ({
        league_id: leagueId,
        manager_id: s.manager_id as string,
        points: (s.points as number) ?? 0,
        updated_at: nowIso,
      }));
    if (rows.length === 0) continue;

    const { error } = await supabase
      .from("manager_bonus_points")
      .upsert(rows, { onConflict: "league_id,manager_id" });
    if (!error) managers += rows.length;
  }

  return { leagues: leagues?.length ?? 0, managers };
}
