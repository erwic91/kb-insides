/**
 * Täglicher Kickbase-Login-Bonus (NICHT die Spieltagsprämie). Beim Liga-Reset
 * wird die Login-Streak zurückgesetzt. WICHTIG: Am Reset-Tag selbst (Tag 0)
 * gibt es noch KEINEN Bonus — der erste 10.000er kommt erst am Tag DANACH.
 * Ab dann +10.000 €/Tag, gedeckelt bei 100.000 €/Tag — solange täglich
 * eingeloggt wird.
 *
 *   Tag 0 (Reset) → 0 · Tag 1 → 10.000 · Tag 2 → 20.000 · … · ab Tag 10 → 100.000
 *
 * Der BETRAG ist am Reset-Datum verankert (Tage seit Reset), nicht an Transfers.
 * Reine Funktionen — Zeit/Reset werden übergeben, damit testbar.
 */

export const LOGIN_BONUS_START = 10_000;
export const LOGIN_BONUS_STEP = 10_000;
export const LOGIN_BONUS_CAP = 100_000;

/** Tag, ab dem der Deckel (100k) erreicht ist: CAP/STEP = 10 (Tag 10 = 100k). */
const CAP_DAY = LOGIN_BONUS_CAP / LOGIN_BONUS_STEP;

/**
 * Login-Bonus AN Tag `dayIndex` (0 = Reset-Tag) bei täglicher Aktivität.
 * Reset-Tag und alles davor = 0; ab Tag 1 lineare Rampe bis zum Deckel.
 */
export function dailyLoginBonus(dayIndex: number): number {
  if (dayIndex <= 0) return 0;
  return Math.min(dayIndex * LOGIN_BONUS_STEP, LOGIN_BONUS_CAP);
}

/**
 * Kumulierter Login-Bonus von Tag 0 bis einschließlich `daysSinceReset` bei
 * täglicher Aktivität (Standardannahme). Tag 0 trägt 0 bei; die Rampe läuft
 * über die Tage 1..D. Geschlossene Form (kein Loop).
 */
export function loginBonusTotal(daysSinceReset: number): number {
  const D = Math.floor(daysSinceReset);
  if (D <= 0) return 0;
  // Tage 1..min(D, CAP_DAY) steigen linear (d·STEP); Rest ist gedeckelt.
  const rampDays = Math.min(D, CAP_DAY);
  // Σ_{d=1}^{rampDays} d·STEP = STEP · rampDays · (rampDays + 1) / 2
  const ramp = (LOGIN_BONUS_STEP * rampDays * (rampDays + 1)) / 2;
  const cappedDays = Math.max(0, D - CAP_DAY);
  return ramp + LOGIN_BONUS_CAP * cappedDays;
}

const DAY_MS = 86_400_000;

/**
 * Kumulierter Login-Bonus seit dem Reset (`resetIso`) bis `nowMs`. Null-sicher:
 * fehlt das Reset-Datum, ist der Bonus 0 (kein Anker → keine Schätzung).
 */
export function loginBonusSinceReset(resetIso: string | null, nowMs: number): number {
  if (!resetIso) return 0;
  const resetMs = Date.parse(resetIso);
  if (Number.isNaN(resetMs) || nowMs < resetMs) return 0;
  const days = Math.floor((nowMs - resetMs) / DAY_MS);
  return loginBonusTotal(days);
}
