/**
 * Gemeinsame Checkpoint-B-Logik: loggt sich ein und greift jeden Endpunkt aus
 * SPEC §6 EINMAL ab. Wird von zwei Aufrufern genutzt:
 *   - scripts/capture-fixtures.ts  → schreibt die Rohantworten als Dateien nach /fixtures
 *   - app/api/dev/capture-fixtures/route.ts → gibt das Bundle als JSON zurück (hosted)
 *
 * Defensiv (Guardrail §2): jeder Abgriff in try/catch, höfliche Pause dazwischen,
 * bei Sperr-/Rate-Limit-Signal (403/429) bricht kbFetch ohnehin sofort ab.
 * Token- und E-Mail-Felder werden vor der Ausgabe redigiert, damit kein Secret
 * und keine PII in ein committetes Fixture oder eine HTTP-Antwort gelangt.
 */
import { login } from "./auth";
import { kbFetch, politeDelay } from "./http";
import { requireEnv, parseLeagueIds } from "../env";

/** Feldnamen, deren Werte Tokens enthalten können — überall rekursiv redigieren. */
const TOKEN_KEYS = new Set([
  "tkn",
  "chttkn",
  "token",
  "accessToken",
  "at",
  "jwt",
  "rtkn",
  "refreshToken",
  "rt",
  "rtk",
]);

/** Feldnamen mit E-Mail/PII → durch Platzhalter ersetzen (Struktur bleibt). */
const EMAIL_KEYS = new Set(["email", "vemail", "emve"]);

/** Ersetzt Token-/E-Mail-Werte durch Platzhalter, Struktur bleibt erhalten. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (TOKEN_KEYS.has(k) && typeof v === "string") {
        out[k] = `<redacted len=${v.length}>`;
      } else if (EMAIL_KEYS.has(k) && typeof v === "string") {
        out[k] = "redacted@example.com";
      } else {
        out[k] = redactSecrets(v);
      }
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

/** Eigene User-ID aus der Login-Antwort (u.id) — garantiert Liga-Mitglied. */
function ownUserId(raw: Record<string, unknown>): string | null {
  const u = raw.u;
  if (u && typeof u === "object") {
    const id = (u as Record<string, unknown>).id;
    if (typeof id === "string" && id) return id;
    if (typeof id === "number") return String(id);
  }
  return null;
}

/** Liga-IDs: konfigurierte bevorzugen, sonst aus der echten Liga-Liste `srvl`. */
function discoverLeagueIds(
  raw: Record<string, unknown>,
  selection: Record<string, unknown> | null,
  configured: string[],
): string[] {
  if (configured.length) return configured;
  const ids: string[] = [];
  const srvl = raw.srvl;
  if (Array.isArray(srvl)) {
    for (const l of srvl) {
      const id = (l as Record<string, unknown>)?.id;
      if (id != null) ids.push(String(id));
    }
  }
  if (ids.length) return ids;
  const it = selection?.it;
  if (Array.isArray(it)) {
    for (const l of it) {
      const i = (l as Record<string, unknown>)?.i;
      if (i != null) ids.push(String(i));
    }
  }
  return ids;
}

export interface CaptureResult {
  /** name → redigierte Rohantwort (bzw. { error } bei Fehlschlag). */
  bundle: Record<string, unknown>;
  /** menschenlesbare Fortschrittszeilen. */
  log: string[];
  /** entdeckte Ligen (id → name), für Nachverfolgung. */
  leagueIds: string[];
  leagueId: string | null;
  managerId: string | null;
  playerId: string | null;
}

/**
 * Führt den kompletten Capture-Durchlauf aus und gibt alle (redigierten)
 * Rohantworten als Bundle zurück. Schreibt selbst nichts auf die Platte —
 * das übernimmt der Aufrufer (Skript = Datei, Route = HTTP-Antwort).
 */
export async function captureFixtures(
  opts: { preferredLeague?: string } = {},
): Promise<CaptureResult> {
  const bundle: Record<string, unknown> = {};
  const log: string[] = [];

  async function capture(name: string, path: string, token: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await kbFetch<Record<string, unknown>>(path, { token });
      bundle[name] = redactSecrets(res);
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
  bundle["login"] = redactSecrets(tokens.raw);
  log.push(`✓ login (Access-Token len ${token.length}, Refresh ${tokens.refreshToken ? "ja" : "nein"})`);

  // Liga-Listing (das funktionierende Selection-Endpoint).
  const selection = await capture("leagues_selection", "/v4/leagues/selection", token);

  let leagueIds = discoverLeagueIds(tokens.raw, selection, parseLeagueIds());
  // Optional eine bestimmte Liga zur Primärliga machen (Diagnose einer aktiven
  // Liga: dann werden deren ranking/market/dashboard-Shapes abgegriffen).
  if (opts.preferredLeague) {
    leagueIds = [opts.preferredLeague, ...leagueIds.filter((id) => id !== opts.preferredLeague)];
  }
  const managerId = ownUserId(tokens.raw);

  if (leagueIds.length === 0) {
    log.push("⚠ Keine Liga-ID gefunden — KICKBASE_LEAGUE_IDS setzen und wiederholen.");
    return { bundle, log, leagueIds, leagueId: null, managerId, playerId: null };
  }

  const primary = leagueIds[0]!;
  log.push(`→ Ligen: ${leagueIds.join(", ")} — primär ${primary}, eigene Manager-ID ${managerId ?? "?"}`);

  // Overview für die Primärliga (kanonisch) + weitere Ligen (Multi-Liga-Beleg, max 3).
  await capture("overview", `/v4/leagues/${primary}/overview`, token);
  for (const lid of leagueIds.slice(1, 3)) {
    await capture(`overview_${lid}`, `/v4/leagues/${lid}/overview`, token);
  }

  const ranking = await capture("ranking", `/v4/leagues/${primary}/ranking`, token);
  await capture("market", `/v4/leagues/${primary}/market`, token);
  await capture("me_budget", `/v4/leagues/${primary}/me/budget`, token);

  // Manager-Endpunkte mit der eigenen ID (garantiert Mitglied); sonst aus Ranking.
  const mid = managerId ?? findId(ranking, ["ui", "mid", "managerId", "i", "id"]);
  let playerId: string | null = null;
  if (mid) {
    log.push(`→ Manager ${mid}`);
    await capture("manager_transfers", `/v4/leagues/${primary}/managers/${mid}/transfer`, token);
    const squad = await capture("manager_squad", `/v4/leagues/${primary}/managers/${mid}/squad`, token);

    // Prämien-Endpunkt (Checkpoint C). Per Discovery bestätigt:
    // `/managers/{mid}/dashboard` liefert 200 mit `prft` (+ `mds`/`mdw` je
    // Spieltag); `achievements`/`profile` sind 404. Post-Reset sind alle Werte 0
    // → ein In-Saison-Lauf zeigt die gefüllte `mds`-Shape und klärt, ob `prft`
    // Erfolgsprämien oder Handelsgewinn ist.
    await capture("manager_dashboard", `/v4/leagues/${primary}/managers/${mid}/dashboard`, token);

    // Discovery: Kandidaten für Admin-Aktivitäten/Strafen & Liga-Feed. Jeder
    // Treffer (200) zeigt seine Shape, 404 landet als Fehler im Bundle — so
    // klärt ein Lauf, ob Admin-Strafen/-Boni über die API abrufbar sind.
    const probes: [string, string][] = [
      ["probe_activitiesfeed", `/v4/leagues/${primary}/activitiesFeed`],
      ["probe_activities", `/v4/leagues/${primary}/activities`],
      ["probe_feed", `/v4/leagues/${primary}/feed`],
      ["probe_mgr_activities", `/v4/leagues/${primary}/managers/${mid}/activities`],
      ["probe_mgr_transactions", `/v4/leagues/${primary}/managers/${mid}/transactions`],
      ["probe_mgr_finances", `/v4/leagues/${primary}/managers/${mid}/finances`],
    ];
    for (const [name, path] of probes) await capture(name, path, token);

    playerId = findId(squad, ["pi", "pid", "playerId", "i", "id"]);
    if (playerId) {
      log.push(`→ Spieler ${playerId}`);
      await capture("player_marketvalue", `/v4/leagues/${primary}/players/${playerId}/marketvalue/365`, token);
    } else {
      log.push("⚠ Keine Spieler-ID im Kader gefunden.");
    }
  } else {
    log.push("⚠ Keine Manager-ID gefunden.");
  }

  log.push("✓ Fixture-Capture fertig.");
  return { bundle, log, leagueIds, leagueId: primary, managerId: mid, playerId };
}
