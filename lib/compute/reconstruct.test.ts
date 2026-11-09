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
  dropRevertedTransfers,
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

describe("maxBid (Maximalgebot-Formel, Faktor 0,33)", () => {
  it("cash + 0,33 × teamValue bei positivem Konto", () => {
    // 10.000.000 + 0,33 × 100.000.000 = 43.000.000
    expect(maxBid(10_000_000, 100_000_000)).toBe(43_000_000);
  });

  it("kürzt bei Minuskonto um die Schuld (min(cash,0))", () => {
    // -5.000.000 + 0,33 × (100.000.000 − 5.000.000) = -5.000.000 + 31.350.000
    expect(maxBid(-5_000_000, 100_000_000)).toBe(26_350_000);
  });

  it("Live-App-Beispiel (Eric W): Grenze bei 33 % des Kaderwerts", () => {
    // Konto 39.593.674 €, Kaderwert 107.278.929 €. Die App sperrt bei 75,0 Mio.
    //   39.593.674 + 0,33 × 107.278.929 = 74.995.721
    expect(maxBid(39_593_674, 107_278_929)).toBe(74_995_721);
  });

  it("FAQ-Beispiel bleibt im Rahmen: KW 100 Mio, Konto −10 Mio", () => {
    // -10.000.000 + 0,33 × (100.000.000 − 10.000.000) = 19.700.000 (Untergrenze −29,7 Mio ≈ −30)
    expect(maxBid(-10_000_000, 100_000_000)).toBe(19_700_000);
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


describe("dropRevertedTransfers", () => {
  type R = { p: string; d: "buy" | "sell"; ts: string; price: number };
  const get = (r: R) => ({ player: r.p, direction: r.d, ts: r.ts });

  it("Olise-Fall: zweiter Verkauf ohne Rückkauf → erster Verkauf entfällt", () => {
    const rows: R[] = [
      { p: "olise", d: "buy", ts: "2026-08-16T09:19:09Z", price: 95_789_463 },
      { p: "olise", d: "sell", ts: "2026-11-01T15:48:00Z", price: 65_246_886 },
      { p: "olise", d: "sell", ts: "2026-11-01T17:26:01Z", price: 65_246_886 },
    ];
    const out = dropRevertedTransfers(rows, get);
    expect(out.map((r) => r.ts)).toEqual(["2026-08-16T09:19:09Z", "2026-11-01T17:26:01Z"]);
  });

  it("korrekt gebuchte Rückabwicklung (Kauf, Verkauf, Kauf) bleibt komplett", () => {
    const rows: R[] = [
      { p: "nkunku", d: "buy", ts: "2026-11-01T15:47:44Z", price: 26_338_658 },
      { p: "nkunku", d: "sell", ts: "2026-11-01T17:19:22Z", price: 26_338_658 },
      { p: "nkunku", d: "buy", ts: "2026-11-01T17:25:43Z", price: 26_338_658 },
    ];
    expect(dropRevertedTransfers(rows, get)).toHaveLength(3);
  });

  it("Paar über den Saisonwechsel (Monate auseinander) bleibt unangetastet", () => {
    const rows: R[] = [
      { p: "karl", d: "buy", ts: "2025-12-22T23:41:00Z", price: 27_005_423 },
      { p: "karl", d: "buy", ts: "2026-02-11T10:59:00Z", price: 20_000_000 },
    ];
    expect(dropRevertedTransfers(rows, get)).toHaveLength(2);
  });
});
