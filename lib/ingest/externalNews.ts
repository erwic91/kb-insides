import { getServiceClient } from "../db/client";
import { fetchInjuries, apiFootballKey, currentSeason } from "../news/apiFootball";

const SYNC_KEY = "__api_football_injuries_synced_at";
const RAW_KEY = "__api_football_injuries_raw";
const MIN_INTERVAL_MS = 6 * 3600_000; // höchstens alle 6 h → schont 100 Anfragen/Tag

/** Normalisiert Namen (klein, ohne Akzente/Sonderzeichen) für den Abgleich. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // kombinierende Akzente entfernen
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Nachname = letztes Token (api-football liefert „R. Lewandowski"). */
function lastName(full: string): string {
  const parts = normalize(full).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export interface SyncResult {
  synced: boolean;
  count?: number;
  matched?: number;
  reason?: string;
}

/**
 * Holt aktuelle Bundesliga-Ausfälle (api-football) und speichert sie global.
 * - No-op ohne API_FOOTBALL_KEY (Feature bleibt inaktiv).
 * - Freshness-Guard: höchstens alle 6 h (schützt das Tageslimit).
 * - Best-effort-Zuordnung Nachname → players.id (nur bei eindeutigem Treffer).
 * Wirft nicht — Fehler werden als { synced:false, reason } zurückgegeben.
 */
export async function syncExternalInjuries(force = false): Promise<SyncResult> {
  if (!apiFootballKey()) return { synced: false, reason: "kein API_FOOTBALL_KEY" };
  const supabase = getServiceClient();

  if (!force) {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SYNC_KEY)
      .maybeSingle();
    const last = data?.value ? Date.parse(data.value as string) : 0;
    if (last && Date.now() - last < MIN_INTERVAL_MS) {
      return { synced: false, reason: "kürzlich synchronisiert" };
    }
  }

  let items;
  let raw: unknown;
  try {
    ({ items, raw } = await fetchInjuries(currentSeason()));
  } catch (e) {
    return { synced: false, reason: (e as Error).message };
  }

  // Kickbase-Zuordnung: Nachname → players.id (eindeutig).
  const kbByLast = new Map<string, string>();
  {
    const { data } = await supabase.from("players").select("id, name");
    const byLast = new Map<string, Set<string>>();
    for (const p of data ?? []) {
      const ln = lastName((p.name as string) ?? "");
      if (!ln) continue;
      const set = byLast.get(ln) ?? new Set<string>();
      set.add(p.id as string);
      byLast.set(ln, set);
    }
    for (const [ln, ids] of byLast) {
      if (ids.size === 1) kbByLast.set(ln, [...ids][0]!);
    }
  }

  // Replace-all für die Quelle (voller Snapshot).
  await supabase.from("external_injuries").delete().eq("source", "api-football");
  let matched = 0;
  if (items.length > 0) {
    const rows = items.map((i) => {
      const kbId = i.playerName ? kbByLast.get(lastName(i.playerName)) ?? null : null;
      if (kbId) matched += 1;
      return {
        source: "api-football",
        player_ext_id: i.playerExtId,
        player_name: i.playerName,
        team_ext_id: i.teamExtId,
        team_name: i.teamName,
        type: i.type,
        reason: i.reason,
        fixture_date: i.fixtureDate,
        kb_player_id: kbId,
      };
    });
    await supabase.from("external_injuries").insert(rows);
  }

  const nowIso = new Date().toISOString();
  await supabase.from("app_settings").upsert({ key: SYNC_KEY, value: nowIso }, { onConflict: "key" });
  // Roh-Sample zur Verifikation der Feldnamen gegen die echte API.
  await supabase
    .from("app_settings")
    .upsert({ key: RAW_KEY, value: JSON.stringify(raw).slice(0, 20000) }, { onConflict: "key" });

  return { synced: true, count: items.length, matched };
}
