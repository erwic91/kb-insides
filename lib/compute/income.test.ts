import { describe, it, expect } from "vitest";
import { buildIncomeModel } from "./income";

const START = 200_000_000;

// Echte Werte (Eric W, FLF, 07.10.): exakt −46.893.228 €, Käufe 896.744.810,
// Verkäufe 638.297.582, 4.704 Punkte, Login-Bonus 7.350.000 (78 Tage).
const ERIC = {
  actual: -46_893_228,
  buys: 896_744_810,
  sells: 638_297_582,
  points: 4704,
  adjustment: 0,
};

describe("buildIncomeModel (Kickbase-Regel)", () => {
  it("Manager-Modus: Login + 1.000 €/Punkt + Korrektur", () => {
    const m = buildIncomeModel({ startBudget: START, loginBonus: 7_350_000, gameMode: 2 });
    expect(m.mode).toBe("rule");
    expect(m.perPoint).toBe(1000);
    expect(m.prizesFor({ buys: 0, sells: 0, points: 3000, adjustment: -1_000_000 })).toBe(
      7_350_000 + 3_000_000 - 1_000_000,
    );
  });

  it("ohne Manager-Modus: nur Login + Korrektur", () => {
    const m = buildIncomeModel({ startBudget: START, loginBonus: 500_000, gameMode: 1 });
    expect(m.mode).toBe("estimate");
    expect(m.prizesFor({ buys: 0, sells: 0, points: 3000, adjustment: 0 })).toBe(500_000);
  });

  it("echter Anker: Regel trifft bis auf den konstanten −500.000-€-Versatz", () => {
    const m = buildIncomeModel({ startBudget: START, loginBonus: 7_350_000, gameMode: 2, anchor: ERIC });
    expect(m.impliedPrizes).toBe(11_554_000);
    expect(m.residual).toBe(-500_000);
  });

  it("der eigene Versatz wird NICHT auf Gegner verteilt (feste Rate)", () => {
    const m = buildIncomeModel({ startBudget: START, loginBonus: 7_350_000, gameMode: 2, anchor: ERIC });
    // Gegner mit 3.000 Punkten bekommt exakt 1.000 €/Punkt, unabhängig vom Anker.
    expect(m.prizesFor({ buys: 0, sells: 0, points: 3000, adjustment: 0 })).toBe(7_350_000 + 3_000_000);
  });
});
