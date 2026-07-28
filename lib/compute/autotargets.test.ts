import { describe, it, expect } from "vitest";
import { computeAutoTargets, type AutoTargetInput } from "./autotargets";

function item(over: Partial<AutoTargetInput>): AutoTargetInput {
  return {
    playerId: "p",
    playerName: "Spieler",
    position: "MF",
    marketValue: 10_000_000,
    price: 10_000_000,
    trend: null,
    verdict: "winnable",
    ...over,
  };
}

describe("computeAutoTargets", () => {
  it("nimmt unterbewertete, bezahlbare Spieler auf (unter MW)", () => {
    const t = computeAutoTargets([
      item({ playerId: "a", price: 8_000_000, marketValue: 10_000_000 }),
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]!.reasons).toContain("unter MW");
    expect(t[0]!.underpricePct).toBeCloseTo(0.2);
  });

  it("erkennt steigende Spieler (Trend) und freie Bahn", () => {
    const t = computeAutoTargets([
      item({ playerId: "a", trend: 1, verdict: "free" }),
    ]);
    expect(t[0]!.reasons).toEqual(expect.arrayContaining(["steigend", "freie Bahn"]));
    expect(t[0]!.rising).toBe(true);
  });

  it("schließt unbezahlbare Angebote aus", () => {
    const t = computeAutoTargets([
      item({ playerId: "a", verdict: "tooExpensive", price: 5_000_000 }),
      item({ playerId: "b", verdict: "unknown" }),
    ]);
    expect(t).toHaveLength(0);
  });

  it("ignoriert Angebote ohne positives Signal (fair bepreist, kein Trend, umkämpft)", () => {
    const t = computeAutoTargets([
      item({ playerId: "a", price: 10_000_000, marketValue: 10_000_000, trend: 2, verdict: "contested" }),
    ]);
    expect(t).toHaveLength(0);
  });

  it("sortiert nach Score (stärkstes Ziel zuerst) und begrenzt", () => {
    const t = computeAutoTargets(
      [
        item({ playerId: "weak", price: 9_900_000, verdict: "winnable" }), // ~1% unter MW
        item({ playerId: "strong", price: 6_000_000, trend: 1, verdict: "free" }),
      ],
      1,
    );
    expect(t).toHaveLength(1);
    expect(t[0]!.playerId).toBe("strong");
  });
});
