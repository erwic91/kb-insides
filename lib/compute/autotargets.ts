/**
 * Auto-Targets (inspiriert von LigaBase): empfohlene Kaufziele aus dem
 * Transfermarkt — bezahlbar UND mit positivem Signal (unter Marktwert, steigend,
 * oder „freie Bahn" beim Gebot). Reine Funktion, keine DB — testbar.
 */
import type { BidVerdict } from "./bidadvisor";

export interface AutoTargetInput {
  playerId: string;
  playerName: string;
  position: string | null;
  marketValue: number | null;
  price: number | null;
  trend: number | null; // 1 = steigend, 2 = fallend
  verdict: BidVerdict; // aus dem Bid-Advisor
}

export interface AutoTarget {
  playerId: string;
  playerName: string;
  position: string | null;
  marketValue: number | null;
  price: number | null;
  underpricePct: number; // (MW − Preis) / MW  (>0 = günstiger als MW)
  rising: boolean;
  score: number;
  reasons: string[];
}

const UNDERPRICE_MIN = 0.01; // ab 1 % unter MW zählt es als „unter MW"

export function computeAutoTargets(
  items: AutoTargetInput[],
  limit = 6,
): AutoTarget[] {
  const targets: AutoTarget[] = [];

  for (const it of items) {
    // Muss bezahlbar sein — sonst kein Ziel.
    if (it.verdict === "tooExpensive" || it.verdict === "unknown") continue;

    const underpricePct =
      it.marketValue != null && it.marketValue > 0 && it.price != null
        ? (it.marketValue - it.price) / it.marketValue
        : 0;
    const rising = it.trend === 1;

    const reasons: string[] = [];
    if (underpricePct > UNDERPRICE_MIN) reasons.push("unter MW");
    if (rising) reasons.push("steigend");
    if (it.verdict === "free") reasons.push("freie Bahn");
    else if (it.verdict === "winnable") reasons.push("gewinnbar");

    // Nur echte Chancen: mind. ein positives Signal.
    const hasSignal =
      underpricePct > UNDERPRICE_MIN || rising || it.verdict === "free";
    if (!hasSignal) continue;

    const score =
      Math.max(0, underpricePct) +
      (rising ? 0.06 : 0) +
      (it.verdict === "free" ? 0.05 : it.verdict === "winnable" ? 0.02 : 0);

    targets.push({
      playerId: it.playerId,
      playerName: it.playerName,
      position: it.position,
      marketValue: it.marketValue,
      price: it.price,
      underpricePct,
      rising,
      score,
      reasons,
    });
  }

  targets.sort((a, b) => b.score - a.score);
  return targets.slice(0, limit);
}
