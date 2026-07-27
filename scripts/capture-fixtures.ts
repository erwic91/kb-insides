/**
 * Checkpoint B: greift jeden Endpunkt aus SPEC §6 EINMAL mit gültigem Token ab
 * und speichert die Rohantworten unter /fixtures. Danach werden alle Parser/Tests
 * gegen diese echten JSONs gebaut.
 *
 *   pnpm exec tsx scripts/capture-fixtures.ts
 *
 * Defensiv: jeder Abgriff ist in try/catch; Fehler werden protokolliert, der Lauf
 * geht weiter. IDs (Liga/Manager/Spieler) werden aus vorherigen Antworten entdeckt.
 * Höfliche Pause zwischen Requests (Guardrail §2).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile, requireEnv, parseLeagueIds } from "../lib/env";
import { login } from "../lib/kickbase/auth";
import { kbFetch, politeDelay } from "../lib/kickbase/http";

const FIX_DIR = resolve(process.cwd(), "fixtures");

function save(name: string, data: unknown) {
  mkdirSync(FIX_DIR, { recursive: true });
  writeFileSync(resolve(FIX_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`  ✓ fixtures/${name}.json`);
}

async function capture(
  name: string,
  path: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await kbFetch<Record<string, unknown>>(path, { token });
    save(name, res);
    await politeDelay();
    return res;
  } catch (e) {
    console.log(`  ✗ ${name} (${path}): ${(e as Error).message}`);
    await politeDelay();
    return null;
  }
}

/** Findet rekursiv das erste String-Feld unter einem der Kandidaten-Keys. */
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

async function main() {
  loadEnvFile();
  console.log("→ Login …");
  const tokens = await login({
    email: requireEnv("KICKBASE_EMAIL"),
    password: requireEnv("KICKBASE_PASSWORD"),
  });
  const token = tokens.accessToken;
  save("login", tokens.raw);

  // Ligen-Listing (Kandidaten-Endpunkte).
  for (const [name, path] of [
    ["leagues_selection", "/v4/leagues/selection"],
    ["user_leagues", "/v4/user/leagues"],
  ] as const) {
    await capture(name, path, token);
  }

  const configured = parseLeagueIds();
  const leagueId =
    configured[0] ??
    findId(tokens.raw, ["i", "id", "lid", "leagueId"]) ??
    null;

  if (!leagueId) {
    console.log("\n⚠ Keine Liga-ID gefunden — setze KICKBASE_LEAGUE_IDS und wiederhole.");
    return;
  }
  console.log(`\n→ Verwende Liga ${leagueId} für ligagebundene Endpunkte …`);

  await capture("overview", `/v4/leagues/${leagueId}/overview`, token);
  const ranking = await capture("ranking", `/v4/leagues/${leagueId}/ranking`, token);
  await capture("market", `/v4/leagues/${leagueId}/market`, token);
  await capture("me_budget", `/v4/leagues/${leagueId}/me/budget`, token);

  // Manager-ID aus dem Ranking ableiten.
  const managerId = findId(ranking, ["ui", "mid", "managerId", "i", "id"]);
  if (managerId) {
    console.log(`→ Manager ${managerId}`);
    await capture("manager_transfers", `/v4/leagues/${leagueId}/managers/${managerId}/transfer`, token);
    const squad = await capture("manager_squad", `/v4/leagues/${leagueId}/managers/${managerId}/squad`, token);

    // Spieler-ID aus dem Kader ableiten.
    const playerId = findId(squad, ["pi", "pid", "playerId", "i", "id"]);
    if (playerId) {
      console.log(`→ Spieler ${playerId}`);
      await capture("player_marketvalue", `/v4/leagues/${leagueId}/players/${playerId}/marketvalue/365`, token);
    } else {
      console.log("  ⚠ Keine Spieler-ID im Kader gefunden.");
    }
  } else {
    console.log("  ⚠ Keine Manager-ID im Ranking gefunden.");
  }

  console.log("\n✓ Fixture-Capture fertig. JSONs unter /fixtures committen (Checkpoint B).");
}

main().catch((e) => {
  console.error("✗ Fixture-Capture fehlgeschlagen:");
  console.error(e);
  process.exit(1);
});
