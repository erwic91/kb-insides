import { START_BUDGET, MAX_BID_FACTOR } from "./constants";
import type { TransferRow } from "../ingest/transfers";

/**
 * M4 — Berechnungslogik (SPEC §7/§8). Reine Funktionen, keine DB.
 */

/** Käufe (Geld raus) und Verkäufe (Geld rein) aufsummieren. */
export function sumTransfers(transfers: Pick<TransferRow, "direction" | "price">[]): {
  bought: number;
  sold: number;
} {
  let bought = 0;
  let sold = 0;
  for (const t of transfers) {
    if (t.direction === "buy") bought += t.price;
    else sold += t.price;
  }
  return { bought, sold };
}

/**
 * Kontorekonstruktion (SPEC §7):
 *   Konto = Startbudget − Σ Käufe + Σ Verkäufe + Σ Prämien
 * `prizes` = Erfolgs-/Auflaufprämien (in dieser Liga Auflaufprämie aus → 0,
 * Erfolgsprämien separat zu ermitteln).
 *
 * ⚠ Verlässlich nur mit VOLLSTÄNDIGER Transfer-Historie. Die API deckelt die
 * Transfer-Liste (~25) → bei langer Historie fehlen ältere Transfers, dann ist
 * die Rekonstruktion unvollständig (siehe README / Checkpoint C).
 */
export function reconstructCash(
  transfers: Pick<TransferRow, "direction" | "price">[],
  opts: { startBudget?: number; prizes?: number } = {},
): number {
  const startBudget = opts.startBudget ?? START_BUDGET;
  const prizes = opts.prizes ?? 0;
  const { bought, sold } = sumTransfers(transfers);
  return startBudget - bought + sold + prizes;
}

/**
 * Maximalgebot (SPEC §8, offizielle Kickbase-Regel):
 *   maxBid = cash + FAKTOR × (teamValue + min(cash, 0))
 * Der min(cash,0)-Term kürzt bei Minuskonto um die Schuld.
 */
export function maxBid(cash: number, teamValue: number, factor = MAX_BID_FACTOR): number {
  return Math.round(cash + factor * (teamValue + Math.min(cash, 0)));
}

/** Overpay eines Kaufs (SPEC §8): gezahlter Preis − Marktwert zum Zeitpunkt. */
export function overpay(price: number, mvAtTime: number | null): number | null {
  if (mvAtTime == null) return null;
  return price - mvAtTime;
}

export interface RealizedProfit {
  profit: number; // Σ (Verkaufspreis − Einkaufspreis) über abgeschlossene Paare
  closedTrades: number; // Anzahl abgeschlossener Kauf→Verkauf-Paare
  wins: number; // davon mit Gewinn (> 0)
  hitRate: number | null; // wins / closedTrades (null wenn keine Paare)
}

/**
 * Realisierter Gewinn (SPEC §7): Käufe und Verkäufe desselben Spielers per FIFO
 * paaren; Gewinn = Verkaufspreis − Einkaufspreis. Trefferquote = Anteil
 * Gewinn-Verkäufe. Nicht abgeschlossene Positionen (Kauf ohne Verkauf oder
 * umgekehrt, z. B. wegen der ~25er-Deckelung) bleiben unberücksichtigt.
 */
export function realizedProfitFIFO(
  transfers: Pick<TransferRow, "player_id" | "direction" | "price" | "ts">[],
): RealizedProfit {
  const byPlayer = new Map<string, typeof transfers>();
  for (const t of transfers) {
    const arr = byPlayer.get(t.player_id) ?? [];
    arr.push(t);
    byPlayer.set(t.player_id, arr);
  }

  let profit = 0;
  let closedTrades = 0;
  let wins = 0;

  for (const list of byPlayer.values()) {
    const sorted = [...list].sort((a, b) => a.ts.localeCompare(b.ts));
    const buyQueue: number[] = []; // Einkaufspreise (FIFO)
    for (const t of sorted) {
      if (t.direction === "buy") {
        buyQueue.push(t.price);
      } else {
        const buyPrice = buyQueue.shift();
        if (buyPrice == null) continue; // Verkauf ohne bekannten Kauf (Historie gedeckelt)
        const gain = t.price - buyPrice;
        profit += gain;
        closedTrades += 1;
        if (gain > 0) wins += 1;
      }
    }
  }

  return {
    profit,
    closedTrades,
    wins,
    hitRate: closedTrades > 0 ? wins / closedTrades : null,
  };
}
