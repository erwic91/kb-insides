import { describe, it, expect } from "vitest";
import { buildIncomeModel } from "./income";

const START = 200_000_000;
const LOGIN = 6_000_000;
// Anker: echt 5 Mio, Käufe 850, Verkäufe 610 → implizite Prämie = 45 Mio.
const anchorBase = { buys: 850_000_000, sells: 610_000_000, actual: 5_000_000, points: 4000 };
const IMPLIED = anchorBase.actual - START + anchorBase.buys - anchorBase.sells; // 45 Mio

describe("buildIncomeModel", () => {
  it("ohne Anker: reine Schätzung (Login + Korrektur)", () => {
    const m = buildIncomeModel({ startBudget: START, loginBonus: LOGIN, anchor: null });
    expect(m.mode).toBe("estimate");
    expect(m.prizesFor({ buys: 0, sells: 0, points: 3000, prft: 10, adjustment: 1000 })).toBe(LOGIN + 1000);
  });

  it("kalibriert: Rate aus dem Anker, reproduziert die implizite Prämie", () => {
    const m = buildIncomeModel({
      startBudget: START,
      loginBonus: LOGIN,
      anchor: { ...anchorBase, prft: null },
    });
    expect(m.mode).toBe("calibrated");
    expect(m.impliedPrizes).toBe(IMPLIED);
    // Rate = (45 − 6) Mio / 4000 = 9750 €/Punkt
    expect(m.ratePerPoint).toBeCloseTo((IMPLIED - LOGIN) / 4000, 6);
    // Eigener Manager → exakt die implizite Prämie zurück.
    expect(m.prizesFor({ buys: 0, sells: 0, points: 4000, prft: null, adjustment: 0 })).toBeCloseTo(IMPLIED, 3);
    // Gegner mit halben Punkten → Login + halbe Matchday-Prämie.
    expect(m.prizesFor({ buys: 0, sells: 0, points: 2000, prft: null, adjustment: 0 })).toBeCloseTo(
      LOGIN + ((IMPLIED - LOGIN) / 4000) * 2000,
      3,
    );
  });

  it("prft-full: prft deckt die implizite Prämie → exakt für alle", () => {
    const m = buildIncomeModel({
      startBudget: START,
      loginBonus: LOGIN,
      anchor: { ...anchorBase, prft: IMPLIED },
    });
    expect(m.mode).toBe("prft-full");
    expect(m.prizesFor({ buys: 0, sells: 0, points: 1000, prft: 12_345_678, adjustment: 0 })).toBe(12_345_678);
    // Korrektur wird additiv berücksichtigt.
    expect(m.prizesFor({ buys: 0, sells: 0, points: 1000, prft: 12_345_678, adjustment: 500 })).toBe(12_346_178);
  });

  it("prft-plusLogin: prft ohne Login → Login wird ergänzt", () => {
    const m = buildIncomeModel({
      startBudget: START,
      loginBonus: LOGIN,
      anchor: { ...anchorBase, prft: IMPLIED - LOGIN },
    });
    expect(m.mode).toBe("prft-plusLogin");
    expect(m.prizesFor({ buys: 0, sells: 0, points: 1000, prft: 20_000_000, adjustment: 0 })).toBe(
      20_000_000 + LOGIN,
    );
  });

  it("prft-Modus, aber prft für einen Manager fehlt → kalibrierter Fallback", () => {
    const m = buildIncomeModel({
      startBudget: START,
      loginBonus: LOGIN,
      anchor: { ...anchorBase, prft: IMPLIED },
    });
    // prft null → Login + Rate × Punkte statt exaktem prft.
    expect(m.prizesFor({ buys: 0, sells: 0, points: 2000, prft: null, adjustment: 0 })).toBeCloseTo(
      LOGIN + ((IMPLIED - LOGIN) / 4000) * 2000,
      3,
    );
  });

  it("prft außerhalb der Toleranz → nicht vertraut, kalibriert stattdessen", () => {
    const m = buildIncomeModel({
      startBudget: START,
      loginBonus: LOGIN,
      anchor: { ...anchorBase, prft: IMPLIED - 10_000_000 }, // 10 Mio daneben
    });
    expect(m.mode).toBe("calibrated");
  });
});
