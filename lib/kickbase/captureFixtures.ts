/**
 * Gemeinsame Checkpoint-B-Logik: loggt sich ein und greift jeden Endpunkt aus
 * SPEC §6 EINMAL ab. Wird von zwei Aufrufern genutzt:
 *   - scripts/capture-fixtures.ts  → schreibt die Rohantworten als Dateien nach /fixtures
 *   - app/api/dev/capture-fixtures/route.ts → gibt das Bundle als JSON zurück (hosted)
 *
 * Defensiv (Guardrail §2): jeder Abgriff in try/catch, höfliche Pause dazwischen,
 * bei Sperr-/Rate-Limit-Signal (403/429) bricht kbFetch ohnehin sofort ab.
 * Token-Felder werden vor der Ausgabe redigiert, damit kein Secret in ein
 * committetes Fixture oder eine HTTP-Antwort gelangt.
 */
import { login } from "./auth";
import { kbFetch, politeDelay } from "./http";
import { requireEnv, parseLeagueIds } from "../env";

/** Feldnamen, deren Werte Tokens enthalten können — überall rekursiv redigieren. */
const TOKEN_KEYS = new Set([
  "tkn",
  "token",
  "accessToken",
  "at",
  "jwt",
  "rtkn",
  "refreshToken",
  "rt",
  "rtk",
]);

/** Ersetzt Token-Werte durch einen Platzhalter, Struktur bleibt erhalten. */
export function redactTokens(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTokens);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] =
        TOKEN_KEYS.has(k) && typeof v === "string"
          ? `<redacted len=${v.length}>`
          : redactTokens(v);
    }
    return out;
  }
  return value;
}

/** Findet rekursiv das erste String-/Number-Feld unter einem der Kandidaten-Keys. */
function findId(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const el of obj) {
      const found = findId(el, keys);
      if (found) return found;
    }
    return null;
  }
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  for (const v of Object.values(rec)) {
    const found = findId(v, keys);
    if (found) return found;
  }
  return null;
}

export interface CaptureResult {
  /** name → redigierte Rohantwort (bzw. { error } bei Fehlschlag). */
  bundle: Record<string, unknown>;
  /** menschenlesbare Fortschrittszeilen. */
  log: string[];
  leagueId: string | null;
  managerId: string | null;
  playerId: string | null;
}

/**
 * Führt den kompletten Capture-Durchlauf aus und gibt alle (redigierten)
 * Rohantworten als Bundle zurück. Schreibt selbst nichts auf die Platte —
 * das übernimmt der Aufrufer (Skript = Datei, Route = HTTP-Antwort).
 */
export async function captureFixtures(): Promise<CaptureResult> {
  const bundle: Record<string, unknown> = {};
  const log: string[] = [];

  async function capture(name: string, path: string, token: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await kbFetch<Record<string, unknown>>(path, { token });
      bundle[name] = redactTokens(res);
      log.push(`✓ ${name} (${path})`);
      await politeDelay();
      return res;
    } catch (e) {
      bundle[name] = { error: (e as Error).message, path };
      log.push(`✗ ${name} (${path}): ${(e as Error).message}`);
      await politeDelay();
      return null;
    }
  }

  log.push("→ Login …");
  const tokens = await login({
    email: requireEnv("KICKBASE_EMAIL"),
    password: requireEnv("KICKBASE_PASSWORD"),
  });
  const token = tokens.accessToken;
  bundle["login"] = redactTokens(tokens.raw);
  log.push(`✓ login (Access-Token len ${token.length}, Refresh ${tokens.refreshToken ? "ja" : "nein"})`);

  // Ligen-Listing (Kandidaten-Endpunkte).
  for (const [name, path] of [
    ["leagues_selection", "/v4/leagues/selection"],
    ["user_leagues", "/v4/user/leagues"],
  ] as const) {
    await capture(name, path, token);
  }

  const configured = parseLeagueIds();
  const leagueId = configured[0] ?? findId(tokens.raw, ["i", "id", "lid", "leagueId"]) ?? null;

  let managerId: string | null = null;
  let playerId: string | null = null;

  if (!leagueId) {
    log.push("⚠ Keine Liga-ID gefunden — KICKBASE_LEAGUE_IDS setzen und wiederholen.");
    return { bundle, log, leagueId: null, managerId, playerId };
  }
  log.push(`→ Verwende Liga ${leagueId} für ligagebundene Endpunkte …`);

  await capture("overview", `/v4/leagues/${leagueId}/overview`, token);
  const ranking = await capture("ranking", `/v4/leagues/${leagueId}/ranking`, token);
  await capture("market", `/v4/leagues/${leagueId}/market`, token);
  await capture("me_budget", `/v4/leagues/${leagueId}/me/budget`, token);

  managerId = findId(ranking, ["ui", "mid", "managerId", "i", "id"]);
  if (managerId) {
    log.push(`→ Manager ${managerId}`);
    await capture("manager_transfers", `/v4/leagues/${leagueId}/managers/${managerId}/transfer`, token);
    const squad = await capture("manager_squad", `/v4/leagues/${leagueId}/managers/${managerId}/squad`, token);

    playerId = findId(squad, ["pi", "pid", "playerId", "i", "id"]);
    if (playerId) {
      log.push(`→ Spieler ${playerId}`);
      await capture("player_marketvalue", `/v4/leagues/${leagueId}/players/${playerId}/marketvalue/365`, token);
    } else {
      log.push("⚠ Keine Spieler-ID im Kader gefunden.");
    }
  } else {
    log.push("⚠ Keine Manager-ID im Ranking gefunden.");
  }

  log.push("✓ Fixture-Capture fertig.");
  return { bundle, log, leagueId, managerId, playerId };
}
