import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMarket } from "./market";
import { parseLeaguesSelection } from "./leaguesSelection";

const market = JSON.parse(
  readFileSync(resolve(process.cwd(), "fixtures/market.json"), "utf8"),
);
const selection = JSON.parse(
  readFileSync(resolve(process.cwd(), "fixtures/leagues_selection.json"), "utf8"),
);

const OBSERVED = "2026-07-27T08:00:00Z";

describe("parseMarket", () => {
  const r = parseMarket(market, "6847281", OBSERVED);

  it("erzeugt Spieler, Marktlog und MV je Listing", () => {
    expect(r.players).toHaveLength(6);
    expect(r.marketLog).toHaveLength(6);
    expect(r.playerMv).toHaveLength(6);
  });

  it("übernimmt Anbieter und Preis ins market_log", () => {
    const baku = r.marketLog.find((m) => m.player_id === "2141");
    expect(baku?.offered_by).toBe("1465441");
    expect(baku?.offered_by_name).toBe("Stefano");
    expect(baku?.price).toBe(26283463);
    expect(baku?.market_value).toBe(17652276);
    expect(baku?.expiry_ts).toBe("2026-05-16T12:24:28Z");
  });

  it("baut Spielernamen aus Vor- und Nachname und mappt die Position", () => {
    const friedl = r.players.find((p) => p.id === "1996");
    expect(friedl?.name).toBe("Marco Friedl");
    expect(friedl?.position).toBe("ABW");
  });

  it("legt MV am aktuellen Spieltag ab", () => {
    const mv = r.playerMv.find((m) => m.player_id === "6668");
    expect(mv?.day).toBe(1);
    expect(mv?.market_value).toBe(10963587);
  });
});

describe("parseLeaguesSelection", () => {
  const rows = parseLeaguesSelection(selection);

  it("liefert alle Ligen des Nutzers", () => {
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id).sort()).toEqual(["1762865", "6847281"]);
  });

  it("markiert die Default-Liga und übernimmt das Budget", () => {
    const kblux = rows.find((r) => r.id === "6847281");
    expect(kblux?.name).toBe("KBLux Liga 2");
    expect(kblux?.is_default).toBe(true);
    expect(kblux?.start_budget).toBe(200250000);

    const flf = rows.find((r) => r.id === "1762865");
    expect(flf?.is_default).toBe(false);
  });

  it("übernimmt den Spielmodus (gpm) — 2 = Manager-Liga, 1 = Classic", () => {
    const parsed = parseLeaguesSelection({
      it: [
        { i: "1", n: "Manager-Liga", b: 200000000, idf: true, gpm: 2 },
        { i: "2", n: "Classic-Liga", b: 50000000, idf: false, gpm: 1 },
        { i: "3", n: "Ohne gpm", b: 100000000, idf: false },
      ],
    });
    expect(parsed.find((r) => r.id === "1")?.game_mode).toBe(2);
    expect(parsed.find((r) => r.id === "2")?.game_mode).toBe(1);
    expect(parsed.find((r) => r.id === "3")?.game_mode).toBeNull();
  });
});
