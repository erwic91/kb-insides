import { kbFetch, type KbFetchOptions } from "./http";
import { KickbaseAuthError } from "./errors";

export interface KbTokens {
  accessToken: string;
  refreshToken: string | null;
  /** ISO-Zeitstempel des Ablaufs, falls von der API geliefert. */
  expiresAt: string | null;
  /** Rohantwort — nützlich für Fixture-Capture & Feld-Discovery (M1/Checkpoint B). */
  raw: Record<string, unknown>;
}

/** Kandidaten-Feldnamen (Kickbase v4 nutzt kurze, kryptische Keys). */
const ACCESS_TOKEN_KEYS = ["tkn", "token", "accessToken", "at", "jwt"];
const REFRESH_TOKEN_KEYS = ["rtkn", "refreshToken", "rt", "rtk"];
const EXPIRY_KEYS = ["tknex", "expiresAt", "exp", "expiry", "tokenExpiry"];

function findString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/**
 * Extrahiert Token/Refresh/Expiry defensiv aus der Login-/Refresh-Antwort.
 * Die genauen Feldnamen werden am echten Fixture verifiziert (Checkpoint B);
 * bis dahin decken wir die wahrscheinlichen Kandidaten ab.
 */
export function extractTokens(raw: Record<string, unknown>): KbTokens {
  const accessToken = findString(raw, ACCESS_TOKEN_KEYS);
  if (!accessToken) {
    throw new KickbaseAuthError(
      `Kein Access-Token in der Antwort gefunden. Top-Level-Keys: ${Object.keys(raw).join(", ")}`,
    );
  }
  return {
    accessToken,
    refreshToken: findString(raw, REFRESH_TOKEN_KEYS),
    expiresAt: findString(raw, EXPIRY_KEYS),
    raw,
  };
}

export interface LoginArgs {
  email: string;
  password: string;
}

/** POST /v4/user/login — Body-Shape aus Prompt §6. */
export async function login(
  { email, password }: LoginArgs,
  opts: KbFetchOptions = {},
): Promise<KbTokens> {
  if (!email || !password) {
    throw new KickbaseAuthError("KICKBASE_EMAIL / KICKBASE_PASSWORD fehlen.");
  }
  const raw = await kbFetch<Record<string, unknown>>("/v4/user/login", {
    ...opts,
    method: "POST",
    body: { em: email, pass: password, loy: false, rep: {} },
  });
  return extractTokens(raw);
}

/**
 * POST /v4/user/refreshtokens — erneuert das Token vor Ablauf (~7 Tage).
 * Falls die API einen anderen Vertrag hat, wird das am Fixture nachgezogen.
 */
export async function refreshTokens(
  currentToken: string,
  refreshToken: string | null,
  opts: KbFetchOptions = {},
): Promise<KbTokens> {
  const raw = await kbFetch<Record<string, unknown>>("/v4/user/refreshtokens", {
    ...opts,
    method: "POST",
    token: currentToken,
    body: refreshToken ? { rtkn: refreshToken } : {},
  });
  return extractTokens(raw);
}

/** Token gilt als "bald ablaufend", wenn < 24h Restlaufzeit (oder unbekannt). */
export function isExpiringSoon(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return true;
  const exp = new Date(expiresAt).getTime();
  if (Number.isNaN(exp)) return true;
  return exp - now.getTime() < 24 * 60 * 60 * 1000;
}
