/**
 * Prämien-/Einkommensmodell für die Kontorekonstruktion.
 *
 * Problem: `Konto = Startbudget − Käufe + Verkäufe + Prämien`. Käufe/Verkäufe
 * kommen exakt aus der Transferhistorie, aber die **Prämien** (Login-Bonus,
 * Spieltags-/Preisgeld im Lock-in-Modus) sind groß und ließen sich bisher nur
 * grob schätzen — daher die hohe Abweichung bei Gegnern.
 *
 * Dieses Modell nutzt den EINEN exakten Ankerpunkt, den wir haben — den eigenen
 * Kontostand aus /me/budget — und leitet daraus die Prämien für ALLE Manager ab:
 *
 *  B) Exakt über Kickbases eigene Prämienzahl `prft` (Dashboard). Sie wird gegen
 *     den Anker validiert: stimmt `Start − Käufe + Verkäufe + prft` (± ein
 *     kleiner Login-Offset) mit dem echten Konto überein, ist `prft` die exakte
 *     Gutschriften-Summe und gilt dann für jeden Manager.
 *  A) Fallback ohne (validiertes) prft: aus dem Anker die €/Punkt-Rate
 *     rückrechnen und je Manager mit seinen Punkten skalieren (+ Login-Bonus).
 *
 * Der eigene Kontostand bleibt immer der exakte Wert; dieses Modell verbessert
 * die REKONSTRUKTION der Gegner.
 */

export interface ManagerFin {
  /** Σ Käufe (Geld raus) seit Tracking-Start. */
  buys: number;
  /** Σ Verkäufe (Geld rein) seit Tracking-Start. */
  sells: number;
  /** Saisonpunkte (für die kalibrierte Rate). */
  points: number | null;
  /** Kickbase-Prämie `prft` dieses Managers (falls erfasst). */
  prft: number | null;
  /** Manuelle Korrektur (adjustments). */
  adjustment: number;
}

export type IncomeMode = "prft-full" | "prft-plusLogin" | "calibrated" | "estimate";

export interface IncomeModel {
  /** Welche Methode am Ende greift (für Diagnose/Panel). */
  mode: IncomeMode;
  loginBonus: number;
  /** Aus dem Anker kalibrierte €/Punkt-Rate (null, wenn kein Anker/Punkte). */
  ratePerPoint: number | null;
  /** Aus dem Anker abgeleitete tatsächliche Gesamtprämie (actual − start + buys − sells). */
  impliedPrizes: number | null;
  /** Prämien (Gutschriften) für einen Manager. */
  prizesFor(fin: ManagerFin): number;
}

/** Toleranz, ab der prft als „bestätigt" gilt (±1 Mio €). */
export const PRFT_TOLERANCE = 1_000_000;

export function buildIncomeModel(opts: {
  startBudget: number;
  loginBonus: number;
  /** Exakter Anker des eigenen Managers (null = keiner → reine Schätzung). */
  anchor?: {
    buys: number;
    sells: number;
    points: number | null;
    prft: number | null;
    actual: number;
  } | null;
}): IncomeModel {
  const { startBudget, loginBonus, anchor } = opts;

  // Tatsächliche Gesamtprämie des Ankers (exakt): alles, was Konto − Transfers
  // nicht erklärt, ist Prämie.
  let impliedPrizes: number | null = null;
  let ratePerPoint: number | null = null;
  if (anchor) {
    impliedPrizes = anchor.actual - startBudget + anchor.buys - anchor.sells;
    if (anchor.points && anchor.points > 0) {
      ratePerPoint = Math.max(0, (impliedPrizes - loginBonus) / anchor.points);
    }
  }

  // prft gegen den Anker validieren: entweder enthält prft schon alles (full)
  // oder es fehlt der Login-Bonus (plusLogin).
  let prftOffset: number | null = null; // 0 = full, loginBonus = plusLogin
  if (anchor && anchor.prft != null && impliedPrizes != null) {
    if (Math.abs(impliedPrizes - anchor.prft) <= PRFT_TOLERANCE) prftOffset = 0;
    else if (Math.abs(impliedPrizes - (anchor.prft + loginBonus)) <= PRFT_TOLERANCE) {
      prftOffset = loginBonus;
    }
  }

  const mode: IncomeMode =
    prftOffset != null
      ? prftOffset === 0
        ? "prft-full"
        : "prft-plusLogin"
      : ratePerPoint != null
        ? "calibrated"
        : "estimate";

  const prizesFor = (fin: ManagerFin): number => {
    // 1) prft validiert UND für diesen Manager vorhanden → exakt.
    if (prftOffset != null && fin.prft != null) {
      return fin.prft + prftOffset + fin.adjustment;
    }
    // 2) Kalibrierte Näherung: Login + Rate × Punkte.
    if (ratePerPoint != null) {
      return loginBonus + ratePerPoint * (fin.points ?? 0) + fin.adjustment;
    }
    // 3) Ohne Anker: nur Login-Bonus + Korrektur.
    return loginBonus + fin.adjustment;
  };

  return { mode, loginBonus, ratePerPoint, impliedPrizes, prizesFor };
}
