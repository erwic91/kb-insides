import { login, refreshTokens, isExpiringSoon, type KbTokens } from "./auth";
import { loadAuth, saveAuth } from "../db/kbAuth";
import { requireEnv } from "../env";
import type { KbFetchOptions } from "./http";

/**
 * Liefert ein gültiges Access-Token und stellt sicher, dass es die
 * Cron-Läufe überdauert:
 *  1. gespeicherte Tokens aus kb_auth lesen,
 *  2. bei baldigem Ablauf refreshen,
 *  3. wenn beides scheitert / nichts vorhanden → frischer Login.
 * Der aktuelle Stand wird jeweils in kb_auth persistiert.
 */
export async function ensureToken(opts: KbFetchOptions = {}): Promise<string> {
  const stored = await loadAuth();

  if (stored?.accessToken && !isExpiringSoon(stored.expiresAt)) {
    return stored.accessToken;
  }

  if (stored?.accessToken && isExpiringSoon(stored.expiresAt)) {
    try {
      const refreshed = await refreshTokens(stored.accessToken, stored.refreshToken, opts);
      await saveAuth(refreshed);
      return refreshed.accessToken;
    } catch {
      // Refresh fehlgeschlagen → frischer Login unten.
    }
  }

  const tokens = await freshLogin(opts);
  await saveAuth(tokens);
  return tokens.accessToken;
}

export async function freshLogin(opts: KbFetchOptions = {}): Promise<KbTokens> {
  return login(
    { email: requireEnv("KICKBASE_EMAIL"), password: requireEnv("KICKBASE_PASSWORD") },
    opts,
  );
}
