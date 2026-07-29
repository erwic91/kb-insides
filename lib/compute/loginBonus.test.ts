import { describe, it, expect } from "vitest";
import { dailyLoginBonus, loginBonusTotal, loginBonusSinceReset } from "./loginBonus";

const DAY = 86_400_000;

describe("dailyLoginBonus (Rampe 10k → 100k)", () => {
  it("Reset-Tag = 10k", () => expect(dailyLoginBonus(0)).toBe(10_000));
  it("Tag 1 = 20k", () => expect(dailyLoginBonus(1)).toBe(20_000));
  it("Tag 9 = 100k (Deckel erreicht)", () => expect(dailyLoginBonus(9)).toBe(100_000));
  it("Tag 30 = 100k (gedeckelt)", () => expect(dailyLoginBonus(30)).toBe(100_000));
  it("negativ = 0", () => expect(dailyLoginBonus(-1)).toBe(0));
});

describe("loginBonusTotal (kumuliert, täglich aktiv)", () => {
  it("Tag 0 = 10k", () => expect(loginBonusTotal(0)).toBe(10_000));
  it("Tag 1 = 30k", () => expect(loginBonusTotal(1)).toBe(30_000));
  it("Tag 9 = 550k (volle Rampe)", () => expect(loginBonusTotal(9)).toBe(550_000));
  it("Tag 10 = 650k (Rampe + 1×Deckel)", () => expect(loginBonusTotal(10)).toBe(650_000));

  it("stimmt mit der Brute-Force-Summe überein", () => {
    for (const D of [0, 3, 8, 9, 12, 40, 100]) {
      let sum = 0;
      for (let d = 0; d <= D; d++) sum += dailyLoginBonus(d);
      expect(loginBonusTotal(D)).toBe(sum);
    }
  });
});

describe("loginBonusSinceReset", () => {
  const reset = "2026-07-01T00:00:00Z";
  it("kein Reset-Datum → 0", () => {
    expect(loginBonusSinceReset(null, Date.parse(reset))).toBe(0);
  });
  it("am Reset-Tag → 10k", () => {
    expect(loginBonusSinceReset(reset, Date.parse(reset) + 3 * 3600_000)).toBe(10_000);
  });
  it("10 Tage nach Reset → 650k", () => {
    expect(loginBonusSinceReset(reset, Date.parse(reset) + 10 * DAY)).toBe(650_000);
  });
  it("vor dem Reset → 0", () => {
    expect(loginBonusSinceReset(reset, Date.parse(reset) - DAY)).toBe(0);
  });
});
