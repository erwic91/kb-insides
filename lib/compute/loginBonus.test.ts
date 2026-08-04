import { describe, it, expect } from "vitest";
import { dailyLoginBonus, loginBonusTotal, loginBonusSinceReset } from "./loginBonus";

const DAY = 86_400_000;

describe("dailyLoginBonus (Rampe ab Tag 1: 10k → 100k)", () => {
  it("Reset-Tag = 0 (noch kein Bonus)", () => expect(dailyLoginBonus(0)).toBe(0));
  it("Tag 1 = 10k (erster Bonus)", () => expect(dailyLoginBonus(1)).toBe(10_000));
  it("Tag 2 = 20k", () => expect(dailyLoginBonus(2)).toBe(20_000));
  it("Tag 10 = 100k (Deckel erreicht)", () => expect(dailyLoginBonus(10)).toBe(100_000));
  it("Tag 30 = 100k (gedeckelt)", () => expect(dailyLoginBonus(30)).toBe(100_000));
  it("negativ = 0", () => expect(dailyLoginBonus(-1)).toBe(0));
});

describe("loginBonusTotal (kumuliert, täglich aktiv)", () => {
  it("Tag 0 = 0 (Reset-Tag zählt nicht)", () => expect(loginBonusTotal(0)).toBe(0));
  it("Tag 1 = 10k", () => expect(loginBonusTotal(1)).toBe(10_000));
  it("Tag 6 = 210k (gemeldeter Fall: Reset vor 6 Tagen)", () =>
    expect(loginBonusTotal(6)).toBe(210_000));
  it("Tag 10 = 550k (volle Rampe)", () => expect(loginBonusTotal(10)).toBe(550_000));
  it("Tag 11 = 650k (Rampe + 1×Deckel)", () => expect(loginBonusTotal(11)).toBe(650_000));

  it("stimmt mit der Brute-Force-Summe überein", () => {
    for (const D of [0, 3, 8, 10, 12, 40, 100]) {
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
  it("am Reset-Tag → 0 (noch kein Bonus)", () => {
    expect(loginBonusSinceReset(reset, Date.parse(reset) + 3 * 3600_000)).toBe(0);
  });
  it("1 Tag nach Reset → 10k (erster Bonus)", () => {
    expect(loginBonusSinceReset(reset, Date.parse(reset) + DAY)).toBe(10_000);
  });
  it("6 Tage nach Reset → 210k", () => {
    expect(loginBonusSinceReset(reset, Date.parse(reset) + 6 * DAY)).toBe(210_000);
  });
  it("11 Tage nach Reset → 650k", () => {
    expect(loginBonusSinceReset(reset, Date.parse(reset) + 11 * DAY)).toBe(650_000);
  });
  it("vor dem Reset → 0", () => {
    expect(loginBonusSinceReset(reset, Date.parse(reset) - DAY)).toBe(0);
  });
});

describe("loginBonusSinceReset — Tageswechsel um 00:30 deutscher Zeit", () => {
  // Liga 4A: Reset 2026-07-28 07:40 UTC (= 09:40 Berlin, Sommerzeit).
  const reset = "2026-07-28T07:40:00Z";

  it("kurz VOR 00:30 Berlin (22:29 UTC) → noch Tag 6 = 210k", () => {
    // 2026-08-03 22:29 UTC = 2026-08-04 00:29 Berlin (CEST) → zählt zum 03.08.
    expect(loginBonusSinceReset(reset, Date.parse("2026-08-03T22:29:00Z"))).toBe(210_000);
  });
  it("kurz NACH 00:30 Berlin (22:31 UTC) → Tag 7 = 280k", () => {
    // 2026-08-03 22:31 UTC = 2026-08-04 00:31 Berlin (CEST) → neuer Bonus-Tag.
    expect(loginBonusSinceReset(reset, Date.parse("2026-08-03T22:31:00Z"))).toBe(280_000);
  });
  it("die alte Reset-Uhrzeit (07:40 UTC) löst KEINEN Wechsel mehr aus", () => {
    // Vor 07:40 UTC am selben Tag ist der Wert schon der des neuen Bonus-Tags.
    const before = loginBonusSinceReset(reset, Date.parse("2026-08-04T06:00:00Z"));
    const after = loginBonusSinceReset(reset, Date.parse("2026-08-04T08:00:00Z"));
    expect(before).toBe(280_000);
    expect(after).toBe(280_000);
  });
});

describe("loginBonusSinceReset — DST-Grenze im Winter (00:30 = 23:30 UTC)", () => {
  const reset = "2025-12-01T12:00:00Z"; // 13:00 Berlin (CET)
  it("kurz VOR 23:30 UTC → noch Tag 4", () => {
    // 2025-12-05 23:29 UTC = 2025-12-06 00:29 Berlin (CET) → zählt zum 05.12.
    expect(loginBonusSinceReset(reset, Date.parse("2025-12-05T23:29:00Z"))).toBe(
      loginBonusTotal(4),
    );
  });
  it("kurz NACH 23:30 UTC → Tag 5", () => {
    expect(loginBonusSinceReset(reset, Date.parse("2025-12-05T23:31:00Z"))).toBe(
      loginBonusTotal(5),
    );
  });
});
