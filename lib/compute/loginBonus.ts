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

/** Zeitzone & Uhrzeit, zu der der Login-Bonus-Tag nachts umspringt. */
export const BONUS_TZ = "Europe/Berlin";
export const BONUS_ROLLOVER_MINUTES = 30; // 00:30 Ortszeit

/**
 * Ganzzahliger „Bonus-Tag"-Schlüssel für einen Zeitpunkt. Der Bonus-Tag
 * wechselt NICHT zur Reset-Uhrzeit, sondern jede Nacht um 00:30 deutscher Zeit.
 * Ein Zeitpunkt vor 00:30 Ortszeit gehört daher noch zum Vortag.
 *
 * Über `Intl` (Europe/Berlin) → DST-sicher: im Sommer springt der Tag um
 * 22:30 UTC, im Winter um 23:30 UTC. 00:30 liegt vor jedem DST-Sprung (02:00/
 * 03:00), die Grenze ist also immer eindeutig.
 */
function bonusDayKey(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BONUS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  const minutesOfDay = get("hour") * 60 + get("minute");
  // Reines Kalenderdatum (Ortszeit) als Tagesnummer; vor 00:30 zählt der Vortag.
  let key = Math.floor(Date.UTC(y, mo - 1, d) / DAY_MS);
  if (minutesOfDay < BONUS_ROLLOVER_MINUTES) key -= 1;
  return key;
}

/**
 * Kumulierter Login-Bonus seit dem Reset (`resetIso`) bis `nowMs`. Null-sicher:
 * fehlt das Reset-Datum, ist der Bonus 0 (kein Anker → keine Schätzung).
 * Die Tageszählung folgt dem 00:30-Ortszeit-Wechsel (siehe `bonusDayKey`),
 * NICHT der Reset-Uhrzeit.
 */
export function loginBonusSinceReset(resetIso: string | null, nowMs: number): number {
  if (!resetIso) return 0;
  const resetMs = Date.parse(resetIso);
  if (Number.isNaN(resetMs)) return 0;
  const days = bonusDayKey(nowMs) - bonusDayKey(resetMs);
  if (days <= 0) return 0;
  return loginBonusTotal(days);
}
