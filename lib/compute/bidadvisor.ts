/**
 * Bid-Advisor (inspiriert von LigaBase): Für ein Marktangebot das stärkste
 * konkurrierende Maximalgebot ermitteln — daraus „so hoch musst du bieten".
 *
 * Grundlage sind die (nach dem Reset für ALLE Manager exakten) Maximalgebote aus
 * der Kontorekonstruktion. Reine Funktion, keine DB — testbar.
 */

export type BidVerdict =
  | "free" // kein Gegner kann über dem Mindestpreis mitbieten → freie Bahn
  | "winnable" // du kannst den stärksten Gegner überbieten
  | "contested" // ein Gegner kann dich überbieten
  | "tooExpensive" // du kannst nicht mal den Mindestpreis zahlen
  | "unknown"; // keine belastbaren Max-Gebote (z. B. vor Reset)

export interface BidManager {
  id: string;
  name: string;
  isMe: boolean;
  maxBid: number | null;
}

export interface BidListing {
  playerId: string;
  /** Mindestgebot = Angebotspreis bzw. Marktwert. */
  floor: number | null;
  /** Anbietender Manager (bietet nicht gegen sich selbst). */
  offeredBy: string | null;
}

export interface BidAdvice {
  playerId: string;
  floor: number | null;
  myMaxBid: number | null;
  topRivalMaxBid: number | null;
  topRivalName: string | null;
  /** Minimalgebot, um den stärksten Gegner zu schlagen (nur bei "winnable"). */
  mustBid: number | null;
  verdict: BidVerdict;
}

export function computeBidAdvice(
  managers: BidManager[],
  listings: BidListing[],
): Map<string, BidAdvice> {
  const me = managers.find((m) => m.isMe);
  const myMaxBid = me?.maxBid ?? null;
  const out = new Map<string, BidAdvice>();

  for (const l of listings) {
    // Stärkster Gegner: alle außer mir und dem Anbieter, mit bekanntem Max-Gebot.
    let topRival: BidManager | null = null;
    for (const m of managers) {
      if (m.isMe || m.id === l.offeredBy || m.maxBid == null) continue;
      if (topRival == null || m.maxBid > (topRival.maxBid ?? -Infinity)) topRival = m;
    }
    const topRivalMaxBid = topRival?.maxBid ?? null;

    let verdict: BidVerdict;
    let mustBid: number | null = null;
    if (myMaxBid == null) {
      verdict = "unknown";
    } else if (l.floor != null && myMaxBid < l.floor) {
      verdict = "tooExpensive";
    } else if (topRivalMaxBid == null || (l.floor != null && topRivalMaxBid < l.floor)) {
      verdict = "free";
    } else if (myMaxBid > topRivalMaxBid) {
      verdict = "winnable";
      mustBid = topRivalMaxBid + 1;
    } else {
      verdict = "contested";
    }

    out.set(l.playerId, {
      playerId: l.playerId,
      floor: l.floor,
      myMaxBid,
      topRivalMaxBid,
      topRivalName: topRival?.name ?? null,
      mustBid,
      verdict,
    });
  }

  return out;
}
