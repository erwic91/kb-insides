import { MATCHDAY_BONUS_PER_POINT } from "./constants";

/**
 * Prämienmodell für die Kontorekonstruktion.
 *
 *   Konto = Startbudget − Σ Käufe + Σ Verkäufe + Prämien
 *   Prämien = Login-Bonus (ab Reset, täglich aktiv) + 1.000 € × Saisonpunkte
 *             (nur Manager-Modus) + manuelle Korrekturen (Strafen etc.)
 *
 * Die Regel ist an LIVE-Daten verifiziert: Der exakte eigene Kontostand
 * (/me/budget) folgte ihr zu vier Zeitpunkten bis auf einen konstanten,
 * managerspezifischen Versatz auf den Euro (siehe MATCHDAY_BONUS_PER_POINT).
 *
 * Der eigene exakte Kontostand dient als PRÜFUNG (Rest-Differenz), nicht zum
 * Umrechnen einer Rate: ein eigener Sonderfall (verpasste Logins, nicht
 * eingetragene Strafe) darf nicht auf alle Gegner verteilt werden.
 */

export interface ManagerFin {
  /** Σ Käufe (Geld raus) seit Tracking-Start. */
  buys: number;
  /** Σ Verkäufe (Geld rein) seit Tracking-Start. */
  sells: number;
  /** Saisonpunkte. */
  points: number | null;
  /** Manuelle Korrektur (Summe aus manager_adjustments). */
  adjustment: number;
}

export type IncomeMode = "rule" | "estimate";

export interface IncomeModel {
  /** "rule" = Login + Spieltagsbonus; "estimate" = nur Login (kein Manager-Modus). */
  mode: IncomeMode;
  loginBonus: number;
  /** € je Saisonpunkt (1.000 im Manager-Modus, sonst 0). */
  perPoint: number;
  /** Tatsächliche Prämie des eigenen Kontos (echt − Start + Käufe − Verkäufe). */
  impliedPrizes: number | null;
  /** Rest-Differenz des eigenen Kontos: echt − Regel (null ohne Anker). */
  residual: number | null;
  /** Prämien (Gutschriften) für einen Manager. */
  prizesFor(fin: ManagerFin): number;
}

export interface OwnAnchorInput extends ManagerFin {
  /** Exakter Kontostand aus /me/budget. */
  actual: number;
}

export function buildIncomeModel(opts: {
  startBudget: number;
  loginBonus: number;
  gameMode: number | null;
  anchor?: OwnAnchorInput | null;
}): IncomeModel {
  const { startBudget, loginBonus, gameMode, anchor } = opts;
  const perPoint = gameMode === 2 ? MATCHDAY_BONUS_PER_POINT : 0;

  const prizesFor = (fin: ManagerFin): number =>
    loginBonus + perPoint * (fin.points ?? 0) + fin.adjustment;

  let impliedPrizes: number | null = null;
  let residual: number | null = null;
  if (anchor) {
    impliedPrizes = anchor.actual - startBudget + anchor.buys - anchor.sells;
    residual = impliedPrizes - prizesFor(anchor);
  }

  return {
    mode: perPoint > 0 ? "rule" : "estimate",
    loginBonus,
    perPoint,
    impliedPrizes,
    residual,
    prizesFor,
  };
}
