import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Lädt .env.local in process.env (nur fehlende Keys), damit standalone-Skripte
 * (tsx) lokal ohne zusätzliche Abhängigkeit funktionieren. In der Cloud/Vercel
 * kommen die Werte ohnehin aus process.env — dann ist das ein No-op.
 */
export function loadEnvFile(file = ".env.local"): void {
  try {
    const content = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Datei fehlt → ignorieren (Werte kommen aus der Umgebung).
  }
}

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Fehlende Umgebungsvariable: ${key}`);
  return v;
}

export function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

/** KICKBASE_LEAGUE_IDS ("123,456") → ["123","456"]. Leer = []. */
export function parseLeagueIds(raw = process.env.KICKBASE_LEAGUE_IDS): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
