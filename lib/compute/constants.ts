/**
 * Domain constants for account reconstruction and bidding logic.
 * See SPEC §7 and CLAUDE_CODE_PROMPT §8.
 */

/** Startbudget je Manager: 200 Mio. (SPEC §2). */
export const START_BUDGET = 200_000_000;

/**
 * Maximalgebot-Faktor: offizielle Kickbase-Regel = 33 % des Kaderwerts.
 * Kalibrierung 0.33 vs. 1/3 ist noch offen (SPEC §12) — daher als benannte,
 * leicht änderbare Konstante gehalten.
 */
export const MAX_BID_FACTOR = 0.33;

/** Default-Kadenz für die Markt-Rückkehr-Prognose in Tagen (SPEC §7). */
export const DEFAULT_MARKET_CADENCE_DAYS = 14;

/**
 * Transfer-Typ (`tty`) aus der Kickbase-Antwort — an echten Fixtures verifiziert
 * (Checkpoint B): bei jedem gekauften UND verkauften Spieler steht `tty=1`
 * zeitlich vor `tty=2`. Also 1 = Kauf, 2 = Verkauf (SPEC §12 geklärt).
 */
export const TTY_BUY = 1;
export const TTY_SELL = 2;
