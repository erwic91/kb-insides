import { describe, it, expect } from "vitest";
import { pickMvAnchorDay } from "./mvAnchor";

/** n Spieler; `changedOn` = Anzahl Spieler, deren Wert sich gegenüber dem Vortag ändert. */
function day(n: number, base: number, changed: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < n; i++) m.set(`p${i}`, base + i + (i < changed ? 1000 : 0));
  return m;
}

describe("pickMvAnchorDay", () => {
  it("echter Tag (208 von 236 geändert) wird genommen", () => {
    const byDate = new Map([
      ["2026-10-30", day(236, 1_000_000, 0)],
      ["2026-10-31", day(236, 1_000_000, 208)],
    ]);
    expect(pickMvAnchorDay(byDate)).toEqual({ day: "2026-10-31", prev: "2026-10-30" });
  });

  it("Duplikat-Tag mit 1 von 227 Änderungen wird übersprungen (Lalux-Fall)", () => {
    const d30 = day(236, 1_000_000, 0);
    const d31 = day(236, 1_000_000, 208);
    const d01 = new Map(d31);
    d01.set("p0", (d01.get("p0") ?? 0) + 88_191); // ein einzelner nachgefüllter Spieler
    const byDate = new Map([
      ["2026-10-30", d30],
      ["2026-10-31", d31],
      ["2026-11-01", d01],
    ]);
    expect(pickMvAnchorDay(byDate)).toEqual({ day: "2026-10-31", prev: "2026-10-30" });
  });

  it("Duplikat-Tag ganz ohne Änderung wird übersprungen (FLF-Fall)", () => {
    const d31 = day(232, 1_000_000, 223);
    const byDate = new Map([
      ["2026-10-30", day(232, 1_000_000, 0)],
      ["2026-10-31", d31],
      ["2026-11-01", new Map(d31)],
    ]);
    expect(pickMvAnchorDay(byDate)?.day).toBe("2026-10-31");
  });

  it("ohne Vortag kein Paar", () => {
    const byDate = new Map([["2026-11-01", day(50, 1_000_000, 50)]]);
    expect(pickMvAnchorDay(byDate)).toBeNull();
  });
});
