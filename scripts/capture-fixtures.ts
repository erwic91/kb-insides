/**
 * Checkpoint B (lokale Variante): greift jeden Endpunkt aus SPEC §6 EINMAL ab
 * und speichert die (token-redigierten) Rohantworten unter /fixtures. Danach
 * werden alle Parser/Tests gegen diese echten JSONs gebaut.
 *
 *   pnpm exec tsx scripts/capture-fixtures.ts
 *
 * Für den rein gehosteten Weg ohne lokalen Lauf siehe stattdessen die Route
 * app/api/dev/capture-fixtures (im Vercel-Deployment auslösbar).
 *
 * Die eigentliche Capture-Logik liegt in lib/kickbase/captureFixtures.ts und
 * wird von beiden Aufrufern geteilt.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "../lib/env";
import { captureFixtures } from "../lib/kickbase/captureFixtures";

const FIX_DIR = resolve(process.cwd(), "fixtures");

async function main() {
  loadEnvFile();
  const { bundle, log } = await captureFixtures();

  for (const line of log) console.log(line);

  mkdirSync(FIX_DIR, { recursive: true });
  for (const [name, data] of Object.entries(bundle)) {
    writeFileSync(resolve(FIX_DIR, `${name}.json`), JSON.stringify(data, null, 2));
    console.log(`  → fixtures/${name}.json`);
  }

  console.log("\n✓ JSONs unter /fixtures committen (Checkpoint B).");
}

main().catch((e) => {
  console.error("✗ Fixture-Capture fehlgeschlagen:");
  console.error(e);
  process.exit(1);
});
