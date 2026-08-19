import { kbFetch } from "./http";
import { getServiceClient } from "../db/client";

/**
 * Endpunkt-Discovery für das „Markt-Potenzial" (Voll-Pool aller Spieler mit
 * Marktwert). Kickbase dokumentiert keinen sauberen „alle Spieler"-Endpunkt;
 * der wahrscheinliche Weg ist ein Team-Profil je Bundesliga-Team. Diese Probe
 * ruft die Kandidaten EINMAL live ab und legt die echten Antwortformate in
 * app_settings ab — daraus wird anschließend der exakte Ingest gebaut.
 * Best-effort, mit Freshness-Guard (kein Spam), read-only (nur GET).
 */

const KEY = "__probe_fullpool";
const AT_KEY = "__probe_fullpool_at";
const MIN_INTERVAL_MS = 12 * 3600_000;
const COMPETITION_ID = "1"; // Bundesliga (zu verifizieren)

interface ProbeResult {
  path: string;
  ok: boolean;
  keys?: string[];
  sample?: string;
  error?: string;
}

async function tryGet(path: string, token: string): Promise<ProbeResult> {
  try {
    const raw = await kbFetch<unknown>(path, { token });
    const keys = raw && typeof raw === "object" ? Object.keys(raw as Record<string, unknown>) : [];
    return { path, ok: true, keys, sample: JSON.stringify(raw).slice(0, 4000) };
  } catch (e) {
    return { path, ok: false, error: (e as Error).message.slice(0, 200) };
  }
}

export async function probeFullPool(token: string): Promise<void> {
  const supabase = getServiceClient();

  const { data: at } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", AT_KEY)
    .maybeSingle();
  const last = at?.value ? Date.parse(at.value as string) : 0;
  if (last && Date.now() - last < MIN_INTERVAL_MS) return;

  // Eine echte Team-ID aus unseren Spielerdaten (players.team = Kickbase-Team-ID).
  const { data: prow } = await supabase
    .from("players")
    .select("team")
    .not("team", "is", null)
    .limit(1)
    .maybeSingle();
  const teamId = (prow?.team as string) ?? "2";
  const c = COMPETITION_ID;

  const candidates = [
    `/v4/competitions/${c}/teams/${teamId}/teamprofile`,
    `/v4/competitions/${c}/teams/${teamId}`,
    `/v4/competitions/${c}/table`,
    `/v4/competitions/${c}`,
    `/v4/competitions/${c}/teams`,
  ];
  const results: ProbeResult[] = [];
  for (const p of candidates) results.push(await tryGet(p, token));

  await supabase
    .from("app_settings")
    .upsert(
      { key: KEY, value: JSON.stringify({ competitionId: c, teamId, results }).slice(0, 60000) },
      { onConflict: "key" },
    );
  await supabase
    .from("app_settings")
    .upsert({ key: AT_KEY, value: new Date().toISOString() }, { onConflict: "key" });
}
