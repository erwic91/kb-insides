/**
 * M1 Smoke-Test: echter Kickbase-Login → Token persistieren → Ligen + Startbudget.
 *
 *   pnpm exec tsx scripts/smoke.ts
 *
 * Benötigt: KICKBASE_EMAIL, KICKBASE_PASSWORD, SUPABASE_URL,
 *           SUPABASE_SERVICE_ROLE_KEY (für Token-Persistenz).
 *
 * Da die Kickbase-v4-Felder kryptisch/undokumentiert sind, gibt dieser Test die
 * Top-Level-Keys der Antworten aus (Token-Werte redigiert), damit die echten
 * Feldnamen sichtbar werden — Grundlage für die Parser (Checkpoint B).
 */
import { loadEnvFile, requireEnv, parseLeagueIds } from "../lib/env";
import { login } from "../lib/kickbase/auth";
import { kbFetch } from "../lib/kickbase/http";
import { saveAuth } from "../lib/db/kbAuth";

function redactKeys(obj: unknown): string {
  if (obj && typeof obj === "object") return Object.keys(obj as object).join(", ");
  return typeof obj;
}

async function main() {
  loadEnvFile();
  const email = requireEnv("KICKBASE_EMAIL");
  requireEnv("KICKBASE_PASSWORD");

  console.log(`→ Login als ${email} …`);
  const tokens = await login({
    email,
    password: requireEnv("KICKBASE_PASSWORD"),
  });

  console.log("✓ Login erfolgreich.");
  console.log(`  Access-Token: ${tokens.accessToken ? "gefunden" : "FEHLT"} (len ${tokens.accessToken.length})`);
  console.log(`  Refresh-Token: ${tokens.refreshToken ? "gefunden" : "nicht vorhanden"}`);
  console.log(`  Ablauf: ${tokens.expiresAt ?? "unbekannt"}`);
  console.log(`  Login-Response Top-Level-Keys: ${redactKeys(tokens.raw)}`);

  // Token persistieren (M1: Token-Persistenz in kb_auth).
  try {
    await saveAuth(tokens);
    console.log("✓ Token in kb_auth gespeichert.");
  } catch (e) {
    console.warn(`⚠ kb_auth speichern fehlgeschlagen: ${(e as Error).message}`);
  }

  // Ligen ermitteln: konfigurierte IDs bevorzugen, sonst Kandidaten-Endpunkte probieren.
  let leagueIds = parseLeagueIds();
  if (leagueIds.length === 0) {
    console.log("\n→ KICKBASE_LEAGUE_IDS leer — versuche Ligen aus der API zu lesen …");
    for (const path of ["/v4/leagues/selection", "/v4/user/leagues", "/v4/leagues"]) {
      try {
        const res = await kbFetch<Record<string, unknown>>(path, { token: tokens.accessToken });
        console.log(`  ${path} → OK, Keys: ${redactKeys(res)}`);
        console.log(`    ${JSON.stringify(res).slice(0, 600)}`);
      } catch (e) {
        console.log(`  ${path} → ${(e as Error).message}`);
      }
    }
  } else {
    console.log(`\n→ Konfigurierte Ligen: ${leagueIds.join(", ")}`);
    for (const lid of leagueIds) {
      try {
        const ov = await kbFetch<Record<string, unknown>>(`/v4/leagues/${lid}/overview`, {
          token: tokens.accessToken,
        });
        console.log(`  Liga ${lid} overview Keys: ${redactKeys(ov)}`);
        console.log(`    ${JSON.stringify(ov).slice(0, 600)}`);
      } catch (e) {
        console.log(`  Liga ${lid} overview → ${(e as Error).message}`);
      }
    }
  }

  console.log("\n✓ Smoke-Test fertig. Als Nächstes: scripts/capture-fixtures.ts für Checkpoint B.");
}

main().catch((e) => {
  console.error("✗ Smoke-Test fehlgeschlagen:");
  console.error(e);
  process.exit(1);
});
