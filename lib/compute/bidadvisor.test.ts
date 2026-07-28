import { describe, it, expect } from "vitest";
import { computeBidAdvice, type BidManager, type BidListing } from "./bidadvisor";

const managers: BidManager[] = [
  { id: "me", name: "Ich", isMe: true, maxBid: 50_000_000 },
  { id: "a", name: "Alpha", isMe: false, maxBid: 40_000_000 },
  { id: "b", name: "Beta", isMe: false, maxBid: 15_000_000 },
  { id: "c", name: "Gamma", isMe: false, maxBid: null }, // ohne Daten
];

function listing(playerId: string, floor: number, offeredBy: string | null = null): BidListing {
  return { playerId, floor, offeredBy };
}

describe("computeBidAdvice", () => {
  it("winnable: stärksten Gegner überbieten → mustBid = Rival + 1", () => {
    const a = computeBidAdvice(managers, [listing("p1", 20_000_000)]).get("p1")!;
    expect(a.verdict).toBe("winnable");
    expect(a.topRivalName).toBe("Alpha");
    expect(a.topRivalMaxBid).toBe(40_000_000);
    expect(a.mustBid).toBe(40_000_001);
  });

  it("contested: Gegner kann mich überbieten", () => {
    const weak: BidManager[] = [
      { id: "me", name: "Ich", isMe: true, maxBid: 30_000_000 },
      { id: "a", name: "Alpha", isMe: false, maxBid: 40_000_000 },
    ];
    const a = computeBidAdvice(weak, [listing("p1", 20_000_000)]).get("p1")!;
    expect(a.verdict).toBe("contested");
    expect(a.mustBid).toBeNull();
  });

  it("free: kein Gegner erreicht den Mindestpreis", () => {
    const a = computeBidAdvice(managers, [listing("p1", 20_000_000, "a")]).get("p1")!;
    // Alpha (40M) ist Anbieter → raus; stärkster Rest ist Beta (15M) < floor 20M.
    expect(a.verdict).toBe("free");
    expect(a.topRivalName).toBe("Beta");
  });

  it("tooExpensive: nicht mal der Mindestpreis bezahlbar", () => {
    const a = computeBidAdvice(managers, [listing("p1", 60_000_000)]).get("p1")!;
    expect(a.verdict).toBe("tooExpensive");
  });

  it("unknown: ohne eigenes Max-Gebot keine Aussage", () => {
    const noMe: BidManager[] = [{ id: "me", name: "Ich", isMe: true, maxBid: null }];
    const a = computeBidAdvice(noMe, [listing("p1", 20_000_000)]).get("p1")!;
    expect(a.verdict).toBe("unknown");
  });

  it("schließt den Anbieter aus (bietet nicht gegen sich selbst)", () => {
    const a = computeBidAdvice(managers, [listing("p1", 10_000_000, "a")]).get("p1")!;
    // Alpha ist Anbieter → stärkster Gegner ist Beta (15M).
    expect(a.topRivalName).toBe("Beta");
    expect(a.topRivalMaxBid).toBe(15_000_000);
  });
});
