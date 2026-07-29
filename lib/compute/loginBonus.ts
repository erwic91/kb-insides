/**
 * Täglicher Kickbase-Login-Bonus (NICHT die Spieltagsprämie). Beim Liga-Reset
 * wird die Login-Streak zurückgesetzt: am Reset-Tag (Tag 0) gibt es 10.000 €,
 * jeden weiteren Tag +10.000 €, gedeckelt bei 100.000 €/Tag — solange täglich
 * eingeloggt wird.
 *
 * Der BETRAG ist am Reset-Datum verankert (Tage seit Reset), nicht an Transfers.
 * Reine Funktionen — Zeit/Reset werden übergeben, damit testbar.
 */

export const LOGIN_BONUS_START = 10_000;
export const LOGIN_BONUS_STEP = 10_000;
export const LOGIN_BONUS_CAP = 100_000;

/** Tag, ab dem der Deckel (100k) erreicht ist: (CAP−START)/STEP = 9. */
const CAP_DAY = (LOGIN_BONUS_CAP - LOGIN_BONUS_START) / LOGIN_BONUS_STEP;

/** Login-Bonus an Tag `dayIndex` (0 = Reset-Tag) bei täglicher Aktivität. */
export function dailyLoginBonus(dayIndex: number): number {
  if (dayIndex < 0) return 0;
  return Math.min(LOGIN_BONUS_START + dayIndex * LOGIN_BONUS_STEP, LOGIN_BONUS_CAP);
}

/**
 * Kumulierter Login-Bonus von Tag 0 bis einschließlich `daysSinceReset` bei
 * täglicher Aktivität (Standardannahme). Geschlossene Form (kein Loop).
 */
export function loginBonusTotal(daysSinceReset: number): number {
  const D = Math.floor(daysSinceReset);
  if (D < 0) return 0;
  if (D <= CAP_DAY) {
    // Σ_{d=0}^{D} (START + d·STEP)
    return (D + 1) * LOGIN_BONUS_START + (LOGIN_BONUS_STEP * D * (D + 1)) / 2;
  }
  // Volle Rampe (Tag 0..CAP_DAY) + Deckel für die restlichen Tage.
  const ramp = (CAP_DAY + 1) * LOGIN_BONUS_START + (LOGIN_BONUS_STEP * CAP_DAY * (CAP_DAY + 1)) / 2;
  return ramp + LOGIN_BONUS_CAP * (D - CAP_DAY);
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
