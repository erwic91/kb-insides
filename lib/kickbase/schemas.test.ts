import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RankingSchema, OverviewSchema, MeBudgetSchema, SquadSchema } from "./schemas";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), `fixtures/${name}.json`), "utf8"));
}

describe("Kickbase-Schemas gegen echte Fixtures", () => {
  it("RankingSchema akzeptiert die echte Antwort (aktiv + inaktiv gemischt)", () => {
    const parsed = RankingSchema.parse(fixture("ranking"));
    expect(parsed.ti).toBe("KBLux Liga 2");
    expect(parsed.day).toBe(34);
    expect(parsed.us.length).toBeGreaterThan(0);
    // Zusatzfelder (z. B. sn, cpi) überleben dank passthrough.
    expect((parsed as Record<string, unknown>).sn).toBe("25/26");
  });

  it("OverviewSchema liest Liga-Name und Mitgliederzahl", () => {
    const parsed = OverviewSchema.parse(fixture("overview"));
    expect(parsed.lnm).toBe("KBLux Liga 2");
    expect(parsed.cpn).toBe("Bundesliga");
    expect(parsed.mgc).toBe(18);
  });

  it("MeBudgetSchema liest den exakten Kontostand", () => {
    const parsed = MeBudgetSchema.parse(fixture("me_budget"));
    expect(parsed.b).toBe(200250000);
  });

  it("SquadSchema wirft NICHT bei nicht-leeren Kadern mit unsauberen Typen", () => {
    // Realistische Varianz: numerische ID, null-Felder, String-Zahlen.
    const raw = {
      it: [
        { i: 118, n: null, pos: "3", mv: 12357935, tid: 5, extra: "x" },
        { i: "2141", mv: null },
      ],
    };
    const parsed = SquadSchema.parse(raw);
    expect(parsed.it).toHaveLength(2);
    expect(parsed.it[0]?.mv).toBe(12357935);
    // leerer Kader bleibt 0
    expect(SquadSchema.parse({ it: [] }).it).toHaveLength(0);
  });
});
