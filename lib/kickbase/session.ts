import { login, refreshTokens, isExpiringSoon, type KbTokens } from "./auth";
import { loadAuth, saveAuth } from "../db/kbAuth";
import { getSetting, setSetting } from "../db/settings";
import { requireEnv } from "../env";
import type { KbFetchOptions } from "./http";

const OWN_USER_ID_KEY = "own_user_id";

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
  const tokens = await login(
    { email: requireEnv("KICKBASE_EMAIL"), password: requireEnv("KICKBASE_PASSWORD") },
    opts,
  );
  if (tokens.ownUserId) {
    try {
      await setSetting(OWN_USER_ID_KEY, tokens.ownUserId);
    } catch {
      // Caching der eigenen ID ist best-effort.
    }
  }
  return tokens;
}

/**
 * Eigene User-ID (für is_me / Kalibrierung). Zuerst aus dem Cache (app_settings),
 * sonst per frischem Login ermitteln und cachen. Null, wenn nicht ermittelbar.
 */
export async function ensureOwnUserId(opts: KbFetchOptions = {}): Promise<string | null> {
  const cached = await getSetting(OWN_USER_ID_KEY);
  if (cached) return cached;
  try {
    const tokens = await freshLogin(opts);
    await saveAuth(tokens);
    return tokens.ownUserId;
  } catch {
    return null;
  }
}
