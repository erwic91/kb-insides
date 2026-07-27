import { KickbaseBlockedError, KickbaseHttpError } from "./errors";

export const KICKBASE_BASE_URL = "https://api.kickbase.com";

/** Realistischer User-Agent (Guardrail §2). */
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Kickbase/6.0 Mobile/15E148";

/** Echte Sperre → sofort abbrechen (nicht retryen). 429 gehört NICHT hierher:
 * das ist ein Rate-Limit und wird mit Backoff/Retry-After erneut versucht. */
const BLOCK_STATUSES = new Set([403]);

export interface KbFetchOptions {
  method?: "GET" | "POST";
  token?: string;
  body?: unknown;
  /** Max. Retry-Versuche bei transienten Fehlern (Netz/5xx). Default 3. */
  maxRetries?: number;
  /** Injizierbar für Tests. */
  fetchImpl?: typeof fetch;
  /** Injizierbar für Tests (statt echtem Warten). */
  sleepImpl?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Kleine höfliche Pause zwischen sequentiellen Requests (Guardrail §2). */
export function politeDelay(ms = 500, sleep = defaultSleep): Promise<void> {
  return sleep(ms);
}

/**
 * Kickbase-HTTP mit exponentiellem Backoff bei transienten Fehlern.
 * Bricht nur bei 403 sofort ab (KickbaseBlockedError); 429 (Rate-Limit) und 5xx
 * werden mit Backoff/Retry-After erneut versucht.
 */
export async function kbFetch<T = unknown>(
  path: string,
  opts: KbFetchOptions = {},
): Promise<T> {
  const {
    method = "GET",
    token,
    body,
    maxRetries = 3,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
  } = opts;

  const url = path.startsWith("http") ? path : `${KICKBASE_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      // Sperrsignal → nicht retryen, sofort abbrechen.
      if (BLOCK_STATUSES.has(res.status)) {
        throw new KickbaseBlockedError(res.status, path);
      }

      if (res.ok) {
        const text = await res.text();
        return (text ? JSON.parse(text) : {}) as T;
      }

      // 429 (Rate-Limit) oder 5xx → transient, mit Backoff erneut versuchen.
      // Bei 429 nach Möglichkeit den Retry-After-Header honorieren.
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        lastErr = new KickbaseHttpError(res.status, path);
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait =
          res.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : backoffMs(attempt);
        await sleepImpl(wait);
        continue;
      }

      // 4xx (außer Block) → nicht retryen.

      const errBody = await res.text().catch(() => undefined);
      throw new KickbaseHttpError(res.status, path, errBody);
    } catch (err) {
      // Blocksignal und HTTP-4xx nicht weiter retryen.
      if (err instanceof KickbaseBlockedError) throw err;
      if (err instanceof KickbaseHttpError && err.status < 500) throw err;

      // Netzwerkfehler / 5xx → Backoff & erneut versuchen.
      lastErr = err;
      if (attempt < maxRetries) {
        await sleepImpl(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`kbFetch fehlgeschlagen: ${path}`);
}

/** Exponentielles Backoff: 1s, 2s, 4s, … (+ etwas Jitter). */
function backoffMs(attempt: number): number {
  const base = 1000 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}
