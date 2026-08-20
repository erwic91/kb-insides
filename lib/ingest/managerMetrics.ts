import { getServiceClient } from "../db/client";
import { reconstructCash } from "../compute/reconstruct";
import { loginBonusSinceReset } from "../compute/loginBonus";
import { MATCHDAY_BONUS_PER_POINT } from "./matchdayBonus";
import type { Direction } from "./transfers";

/**
 * Täglicher Snapshot der Manager-Kennzahlen (Kaderwert, rekonstruiertes Konto,
 * Punkte) nach manager_tv_daily — Grundlage für die sortier-reaktiven
 * Platzierungs-Pfeile (Rang der sortierten Spalte vs. Vortag). Läuft im
 * nächtlichen Cron (recordDailyTv). Rekonstruktion identisch zu getManagerTable
 * (Startbudget − Käufe + Verkäufe + Login-Bonus + Korrekturen + Spieltagsbonus),
 * aber ohne den „eigenen exakten"-Sonderfall — der Snapshot ist manager-neutral.
 */
export async function snapshotManagerMetrics(leagueId: string): Promise<void> {
  const supabase = getServiceClient();

  const { data: lg } = await supabase
    .from("leagues")
    .select("start_budget, tracking_since, game_mode")
    .eq("id", leagueId)
    .maybeSingle();
  const startBudget = (lg?.start_budget as number) ?? 0;
  const trackingSince = (lg?.tracking_since as string | null) ?? null;
  const gameMode = (lg?.game_mode as number | null) ?? null;
  const sinceMs = trackingSince ? Date.parse(trackingSince) : null;

  // Jüngster Spieltag → Kaderwert & Punkte je Manager.
  const { data: dayRow } = await supabase
    .from("manager_snapshots")
    .select("day")
    .eq("league_id", leagueId)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  const day = dayRow?.day as number | null | undefined;
  if (day == null) return;
  const { data: snaps } = await supabase
    .from("manager_snapshots")
    .select("manager_id, team_value, points")
    .eq("league_id", leagueId)
    .eq("day", day);
  if (!snaps || snaps.length === 0) return;

  // Transfers je Manager (owner = Käufer bei buy, sonst Verkäufer).
  const byMgr = new Map<string, { direction: Direction; price: number; ts: string | null }[]>();
  const { data: trs } = await supabase
    .from("transfers")
    .select("from_manager, to_manager, direction, price, ts")
    .eq("league_id", leagueId);
  for (const t of trs ?? []) {
    const direction = ((t.direction as Direction) ?? "buy") as Direction;
    const owner = direction === "buy" ? (t.to_manager as string | null) : (t.from_manager as string | null);
    if (!owner) continue;
    const arr = byMgr.get(owner) ?? [];
    arr.push({ direction, price: (t.price as number) ?? 0, ts: (t.ts as string | null) ?? null });
    byMgr.set(owner, arr);
  }

  const adjSum = new Map<string, number>();
  const { data: adj } = await supabase.from("adjustments").select("manager_id, amount").eq("league_id", leagueId);
  for (const a of adj ?? []) {
    const mid = a.manager_id as string;
    adjSum.set(mid, (adjSum.get(mid) ?? 0) + ((a.amount as number) ?? 0));
  }
  const bonusPts = new Map<string, number>();
  const { data: bonus } = await supabase
    .from("manager_bonus_points")
    .select("manager_id, points")
    .eq("league_id", leagueId);
  for (const b of bonus ?? []) bonusPts.set(b.manager_id as string, (b.points as number) ?? 0);

  const loginBonus = loginBonusSinceReset(trackingSince, Date.now());
  const snapDate = new Date().toISOString().slice(0, 10);

  const rows = snaps.map((s) => {
    const mid = s.manager_id as string;
    const tv = (s.team_value as number) ?? null;
    let cash: number | null = null;
    if (startBudget > 0) {
      const all = byMgr.get(mid) ?? [];
      const filtered = sinceMs != null ? all.filter((t) => t.ts != null && Date.parse(t.ts) >= sinceMs) : all;
      const prizes =
        loginBonus +
        (adjSum.get(mid) ?? 0) +
        (gameMode === 2 ? (bonusPts.get(mid) ?? 0) * MATCHDAY_BONUS_PER_POINT : 0);
      cash = reconstructCash(filtered, { startBudget, prizes });
    }
    return {
      league_id: leagueId,
      manager_id: mid,
      snap_date: snapDate,
      team_value: tv,
      cash,
      points: (s.points as number) ?? null,
    };
  });

  await supabase
    .from("manager_tv_daily")
    .upsert(rows, { onConflict: "league_id,manager_id,snap_date" });
}
