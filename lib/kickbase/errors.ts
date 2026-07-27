/** Kickbase-Client-Fehlerklassen. */

/**
 * Sperr-/Rate-Limit-Signal (403, 429, wiederholtes 401 im Nicht-Login-Kontext).
 * Guardrail: bei diesen Signalen ABBRECHEN statt hämmern.
 */
export class KickbaseBlockedError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`Kickbase blockiert Zugriff (HTTP ${status}) bei ${path} — Abbruch.`);
    this.name = "KickbaseBlockedError";
  }
}

/** Generischer HTTP-Fehler nach erschöpften Retries. */
export class KickbaseHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body?: string,
  ) {
    super(`Kickbase HTTP ${status} bei ${path}`);
    this.name = "KickbaseHttpError";
  }
}

/** Login/Token-Problem (fehlende Credentials, ungültige Antwort). */
export class KickbaseAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KickbaseAuthError";
  }
}
