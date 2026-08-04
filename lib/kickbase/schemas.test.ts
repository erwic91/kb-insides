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

  it("SquadSchema liest die ECHTEN Feldnamen (pi/pn), nicht i/n", () => {
    // Exakt die Shape aus der echten /squad-Antwort (Capture-Bundle):
    // Spieler-ID = `pi`, Name = `pn`; KEINE Punkte-Felder.
    const raw = {
      it: [
        {
          mv: 11405235,
          pi: "13448",
          pn: "Aouchiche",
          st: 0,
          lst: 0,
          mvt: 1,
          pos: 3,
          tid: "8",
          iotm: false,
        },
        { pi: "2141", pn: "Musiala", mv: null, pos: "4", st: 1 },
      ],
    };
    const parsed = SquadSchema.parse(raw);
    expect(parsed.it).toHaveLength(2);
    // Die ID kommt aus `pi` — vorher fälschlich aus `i` gelesen → immer null.
    expect(parsed.it[0]?.pi).toBe("13448");
    expect(parsed.it[0]?.pn).toBe("Aouchiche");
    expect(parsed.it[0]?.mv).toBe(11405235);
    expect(parsed.it[0]?.st).toBe(0);
    // `i`/`n` existieren nicht mehr am geparsten Objekt.
    expect((parsed.it[0] as Record<string, unknown>).i).toBeUndefined();
    // leerer Kader bleibt 0
    expect(SquadSchema.parse({ it: [] }).it).toHaveLength(0);
  });
});
