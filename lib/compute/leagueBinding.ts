/**
 * Regel „eine aktive Liga + 7-Tage-Wechselsperre" (Design §7.5). Reine Logik,
 * keine DB/Zeitquelle — `now` wird injiziert, damit sie deterministisch testbar
 * ist. Der Aufrufer lädt den aktuellen Zustand (aktive Liga + Sperr-Marker) und
 * setzt die Entscheidung um.
 */

export const SWITCH_COOLDOWN_DAYS = 7;
const DAY_MS = 86_400_000;

export type ActivationDecision =
  | { allowed: true; kind: "first" | "same" | "switch" }
  | { allowed: false; kind: "cooldown"; availableAt: string };

export interface ActivationState {
  targetLeagueId: string;
  /** Aktuell aktive Liga des Nutzers (null = keine/aktuell getrennt). */
  currentLeagueId: string | null;
  /** last_league_id aus league_switch_lock (überlebt Trennen). */
  lockLeagueId: string | null;
  /** activated_at aus league_switch_lock (ISO) — Basis der 7-Tage-Frist. */
  lockActivatedAt: string | null;
  /** Aktuelle Zeit (ms). */
  now: number;
  cooldownDays?: number;
}

/**
 * Entscheidet, ob Nutzer die Ziel-Liga aktivieren darf:
 *  - "first": noch nie eine Liga gebunden → erlaubt.
 *  - "same": Ziel = aktuell/zuletzt gebundene Liga → erlaubt, KEIN Reset der Frist.
 *  - "switch": andere Liga, Frist abgelaufen → erlaubt.
 *  - "cooldown": andere Liga, Frist läuft noch → abgelehnt (+ availableAt).
 */
export function decideActivation(state: ActivationState): ActivationDecision {
  const cooldownDays = state.cooldownDays ?? SWITCH_COOLDOWN_DAYS;
  const bound = state.currentLeagueId ?? state.lockLeagueId;

  // Noch nie eine Liga gebunden.
  if (!bound) return { allowed: true, kind: "first" };

  // Dieselbe Liga (aktiv ODER zuletzt gebunden) — Reconnect/Reaktivierung.
  if (bound === state.targetLeagueId) return { allowed: true, kind: "same" };

  // Wechsel auf eine ANDERE Liga: nur nach Ablauf der Sperre.
  if (state.lockActivatedAt) {
    const until = Date.parse(state.lockActivatedAt) + cooldownDays * DAY_MS;
    if (Number.isFinite(until) && state.now < until) {
      return { allowed: false, kind: "cooldown", availableAt: new Date(until).toISOString() };
    }
  }
  return { allowed: true, kind: "switch" };
}
