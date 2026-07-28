import { describe, it, expect } from "vitest";
import { START_BUDGET, MAX_BID_FACTOR, DEFAULT_MARKET_CADENCE_DAYS } from "./constants";

describe("domain constants", () => {
  it("Startbudget ist 200 Mio.", () => {
    expect(START_BUDGET).toBe(200_000_000);
  });

  it("Maximalgebot-Faktor ist 0,33 (an Live-App verifiziert: 33 % des Kaderwerts)", () => {
    expect(MAX_BID_FACTOR).toBe(0.33);
  });

  it("Default-Kadenz ist 14 Tage", () => {
    expect(DEFAULT_MARKET_CADENCE_DAYS).toBe(14);
  });
});
