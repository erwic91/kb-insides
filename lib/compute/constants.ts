/**
 * Domain constants for account reconstruction and bidding logic.
 * See SPEC §7 and CLAUDE_CODE_PROMPT §8.
 */

/** Startbudget je Manager: 200 Mio. (SPEC §2). */
export const START_BUDGET = 200_000_000;

/**
 * Maximalgebot-/Überzieh-Faktor der Kickbase-Regel: das Konto darf höchstens auf
 * −FAKTOR × Kaderwert fallen. Formel: maxBid = cash + FAKTOR × (Kaderwert +
 * min(cash, 0)).
 *
 * An LIVE-Daten der App verifiziert (die maßgebliche Quelle): Konto 39.593.674 €,
 * Kaderwert 107.278.929 €. Die App SPERRT das Gebot bei 75.000.000 € → Restkonto
 * −35.406.326 € = 33,0 % des Kaderwerts (35.406.326 / 107.278.929 = 0,3301).
 * Also greift die Grenze exakt bei 0,33 × Kaderwert, nicht bei ⅓:
 *   0,33 → max 74.995.721 € (App sperrt bei 75,0 Mio ✓)
 *   ⅓    → max 75.353.317 € (bei 75,0 Mio erst 33,0 % < 33,33 %, App würde erlauben ✗)
 * Das FAQ-Beispiel (100/−10 → −30) nutzt runde Zahlen und passt zu beidem
 * (0,33 × 90 = 29,7 ≈ 30). Die exakte Live-App entscheidet → 0,33.
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
