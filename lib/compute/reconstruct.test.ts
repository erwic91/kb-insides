import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTransfers } from "../ingest/transfers";
import {
  sumTransfers,
  reconstructCash,
  maxBid,
  overpay,
  realizedProfitFIFO,
} from "./reconstruct";

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "fixtures/manager_transfers.json"), "utf8"),
);
const rows = parseTransfers(fixture, "6847281", "2172510");

describe("Kontorekonstruktion (echte 25 Transfers)", () => {
  it("summiert Käufe und Verkäufe korrekt", () => {
    const { bought, sold } = sumTransfers(rows);
    expect(bought).toBe(113335232);
    expect(sold).toBe(80573273);
  });

  it("rekonstruiert das Konto (ohne Prämien) = 200M − Käufe + Verkäufe", () => {
    expect(reconstructCash(rows)).toBe(167238041);
  });

  it("berücksichtigt Prämien additiv", () => {
    expect(reconstructCash(rows, { prizes: 33011959 })).toBe(200250000);
  });
});

describe("maxBid (Maximalgebot-Formel)", () => {
  it("cash + 0.33 × teamValue bei positivem Konto", () => {
    // 10.000.000 + 0.33 × 100.000.000 = 43.000.000
    expect(maxBid(10_000_000, 100_000_000)).toBe(43_000_000);
  });

  it("kürzt bei Minuskonto um die Schuld (min(cash,0))", () => {
    // -5.000.000 + 0.33 × (100.000.000 − 5.000.000) = -5.000.000 + 31.350.000
    expect(maxBid(-5_000_000, 100_000_000)).toBe(26_350_000);
  });
});

describe("overpay", () => {
  it("Preis − Marktwert; null wenn Marktwert unbekannt", () => {
    expect(overpay(50_000_000, 42_000_000)).toBe(8_000_000);
    expect(overpay(50_000_000, null)).toBeNull();
  });
});

describe("realizedProfitFIFO (echte Daten)", () => {
  const r = realizedProfitFIFO(rows);

  it("paart 5 abgeschlossene Trades und errechnet den Gewinn", () => {
    // Moerstedt −186.182, Zesiger +197.984, Leitsch +501.221,
    // Couto +1.054.389, Weiper −793.325  → Summe +774.087
    expect(r.closedTrades).toBe(5);
    expect(r.profit).toBe(774087);
  });

  it("errechnet die Trefferquote (3 von 5 mit Gewinn)", () => {
    expect(r.wins).toBe(3);
    expect(r.hitRate).toBeCloseTo(0.6, 5);
  });
});
