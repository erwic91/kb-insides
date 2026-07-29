/**
 * Regel „eine aktive Liga + 7-Tage-Wechselsperre" (Design §7.5). Reine Logik,
 * keine DB/Zeitquelle — `now` wird injiziert, damit sie deterministisch testbar
 * ist. Der Aufrufer lädt den aktuellen Zustand (aktive Liga + Sperr-Marker) und
 * setzt die Entscheidung um.
 */

export const SWITCH_COOLDOWN_DAYS = 7;
const DAY_MS = 86_400_000;

// ---------- Multi-Liga (Premium): bis zum Limit hinzufügen ----------

export interface AddLeagueState {
  targetLeagueId: string;
  /** Aktuell aktive Ligen des Nutzers (league_access). */
  activeLeagueIds: string[];
  /** Erlaubte Anzahl gleichzeitig aktiver Ligen (profiles.max_leagues). */
  maxLeagues: number;
}
export type AddDecision =
  | { allowed: true; kind: "present" | "added" }
  | { allowed: false; kind: "atCap"; maxLeagues: number };

/**
 * Entscheidet, ob eine Liga aktiviert (hinzugefügt) werden darf:
 *  - "present": bereits aktiv → erlaubt (No-op).
 *  - "added": unter dem Limit → erlaubt.
 *  - "atCap": Limit erreicht → abgelehnt (erst eine Liga entfernen).
 */
export function decideAddLeague(s: AddLeagueState): AddDecision {
  if (s.activeLeagueIds.includes(s.targetLeagueId)) return { allowed: true, kind: "present" };
  if (s.activeLeagueIds.length < Math.max(1, s.maxLeagues)) return { allowed: true, kind: "added" };
  return { allowed: false, kind: "atCap", maxLeagues: s.maxLeagues };
}

export interface RemoveLeagueState {
  /** Wann die zu entfernende Liga aktiviert wurde (ISO). */
  activatedAt: string | null;
  now: number;
  cooldownDays?: number;
}
export type RemoveDecision = { allowed: true } | { allowed: false; availableAt: string };

/**
 * Entfernen einer aktiven Liga ist erst nach der 7-Tage-Sperre erlaubt
 * (verhindert Liga-Hopping: hinzufügen → scrapen → entfernen → nächste).
 */
export function decideRemoveLeague(s: RemoveLeagueState): RemoveDecision {
  const cd = s.cooldownDays ?? SWITCH_COOLDOWN_DAYS;
  if (!s.activatedAt) return { allowed: true };
  const until = Date.parse(s.activatedAt) + cd * DAY_MS;
  if (Number.isFinite(until) && s.now < until) {
    return { allowed: false, availableAt: new Date(until).toISOString() };
  }
  return { allowed: true };
}

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
