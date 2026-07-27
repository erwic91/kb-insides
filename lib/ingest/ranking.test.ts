import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRanking } from "./ranking";

const rankingFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "fixtures/ranking.json"), "utf8"),
);

const LEAGUE = "6847281";

describe("parseRanking", () => {
  const rows = parseRanking(rankingFixture, LEAGUE);

  it("leitet Liga-Name und -ID ab", () => {
    expect(rows.league).toEqual({ id: LEAGUE, name: "KBLux Liga 2" });
  });

  it("erzeugt je Manager eine Zeile (auch inaktive)", () => {
    expect(rows.managers).toHaveLength(4);
    expect(rows.snapshots).toHaveLength(4);
    expect(rows.managers.map((m) => m.id)).toContain("2172510"); // inaktiver Manager
  });

  it("mappt Kaderwert (tv) und Saisonpunkte (sp) für aktive Manager", () => {
    const active = rows.snapshots.find((s) => s.manager_id === "221035");
    expect(active).toMatchObject({
      league_id: LEAGUE,
      manager_id: "221035",
      day: 34,
      team_value: 161901347,
      points: 15983,
    });
  });

  it("setzt tv/points auf null bei inaktiven Managern (kein tv/sp)", () => {
    const inactive = rows.snapshots.find((s) => s.manager_id === "2172510");
    expect(inactive?.team_value).toBeNull();
    expect(inactive?.points).toBeNull();
    expect(inactive?.day).toBe(34);
  });

  it("übernimmt den Manager-Namen", () => {
    const m = rows.managers.find((m) => m.id === "221035");
    expect(m?.name).toBe("esmüllert");
    expect(m?.league_id).toBe(LEAGUE);
  });

  it("verwendet beim Backfill (M3) den angeforderten Spieltag statt res.day", () => {
    const backfilled = parseRanking(rankingFixture, LEAGUE, { dayOverride: 12 });
    expect(backfilled.snapshots.every((s) => s.day === 12)).toBe(true);
  });

  it("verträgt null-Werte in der frühen Saison (lp/tv/sp), wie bei aktiven Ligen", () => {
    // FFL-artige Antwort: `lp` mit null-Einträgen, tv/sp explizit null.
    const earlySeason = {
      ti: "Future Football League",
      day: 2,
      sn: "26/27",
      us: [
        { i: "1370582", n: "Alpha", tv: 51000000, sp: 340, lp: [180, null, null] },
        { i: "2172510", n: "Eric W", tv: null, sp: null, lp: [null, null] },
      ],
    };
    const rows = parseRanking(earlySeason, "11320459");
    expect(rows.managers).toHaveLength(2);
    expect(rows.snapshots.find((s) => s.manager_id === "2172510")).toMatchObject({
      team_value: null,
      points: null,
      day: 2,
    });
    expect(rows.snapshots.find((s) => s.manager_id === "1370582")?.team_value).toBe(51000000);
  });
});
