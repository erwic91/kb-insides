import { getServiceClient } from "../db/client";
import { fetchTeamProfile } from "../kickbase/endpoints";
import { politeDelay } from "../kickbase/http";

/**
 * Voll-Pool-Marktwert: für alle Bundesliga-Teams das Team-Profil holen und die
 * Spieler-Marktwerte (it[].mv) je Team summieren → market_pool. Wettbewerbsweit
 * (Marktwerte sind global), daher EINMAL pro Lauf, mit Freshness-Guard (~1×/Tag).
 * Team-IDs stammen aus players.team (Bundesliga = 18 Teams). Best-effort je Team.
 */

const COMPETITION_ID = "1"; // Bundesliga (per Discovery bestätigt)
const AT_KEY = "__market_pool_synced_at";
const MIN_INTERVAL_MS = 20 * 3600_000;

export interface MarketPoolResult {
  synced: boolean;
  teams?: number;
  totalMv?: number;
}

export async function syncMarketPool(token: string): Promise<MarketPoolResult> {
  const supabase = getServiceClient();

  const { data: at } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", AT_KEY)
    .maybeSingle();
  const last = at?.value ? Date.parse(at.value as string) : 0;
  if (last && Date.now() - last < MIN_INTERVAL_MS) return { synced: false };

  const { data: teamRows } = await supabase.from("players").select("team").not("team", "is", null);
  const teamIds = [...new Set((teamRows ?? []).map((r) => r.team as string).filter(Boolean))];
  if (teamIds.length === 0) return { synced: false };

  let okTeams = 0;
  let totalMv = 0;
  for (const teamId of teamIds) {
    try {
      const tp = await fetchTeamProfile(COMPETITION_ID, teamId, { token });
      const players = tp.it ?? [];
      const teamMv = players.reduce((s, p) => s + (p.mv ?? 0), 0);
      await supabase.from("market_pool").upsert(
        {
          competition_id: COMPETITION_ID,
          team_id: teamId,
          total_mv: teamMv,
          player_count: players.length,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "competition_id,team_id" },
      );
      okTeams += 1;
      totalMv += teamMv;
    } catch {
      // Team best-effort — bestehender Wert bleibt erhalten.
    }
    await politeDelay();
  }

  await supabase
    .from("app_settings")
    .upsert({ key: AT_KEY, value: new Date().toISOString() }, { onConflict: "key" });
  return { synced: true, teams: okTeams, totalMv };
}
