import { describe, it, expect } from "vitest";
import { decideActivation, SWITCH_COOLDOWN_DAYS } from "./leagueBinding";

const T0 = Date.parse("2026-07-01T12:00:00Z");
const DAY = 86_400_000;

describe("decideActivation (eine Liga + 7-Tage-Wechselsperre)", () => {
  it("erste Aktivierung ohne Vorgeschichte → erlaubt (first)", () => {
    const d = decideActivation({
      targetLeagueId: "A",
      currentLeagueId: null,
      lockLeagueId: null,
      lockActivatedAt: null,
      now: T0,
    });
    expect(d).toEqual({ allowed: true, kind: "first" });
  });

  it("dieselbe aktive Liga erneut → erlaubt (same), kein Frist-Reset", () => {
    const d = decideActivation({
      targetLeagueId: "A",
      currentLeagueId: "A",
      lockLeagueId: "A",
      lockActivatedAt: new Date(T0).toISOString(),
      now: T0 + DAY,
    });
    expect(d).toEqual({ allowed: true, kind: "same" });
  });

  it("Wechsel vor Ablauf der 7 Tage → abgelehnt (cooldown) mit availableAt", () => {
    const activated = new Date(T0).toISOString();
    const d = decideActivation({
      targetLeagueId: "B",
      currentLeagueId: "A",
      lockLeagueId: "A",
      lockActivatedAt: activated,
      now: T0 + 3 * DAY,
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.kind).toBe("cooldown");
      expect(d.availableAt).toBe(new Date(T0 + SWITCH_COOLDOWN_DAYS * DAY).toISOString());
    }
  });

  it("Wechsel exakt nach Ablauf der Frist → erlaubt (switch)", () => {
    const d = decideActivation({
      targetLeagueId: "B",
      currentLeagueId: "A",
      lockLeagueId: "A",
      lockActivatedAt: new Date(T0).toISOString(),
      now: T0 + SWITCH_COOLDOWN_DAYS * DAY,
    });
    expect(d).toEqual({ allowed: true, kind: "switch" });
  });

  it("getrennt + Reconnect derselben Liga → erlaubt (same) trotz laufender Frist", () => {
    // currentLeagueId null (getrennt), Lock zeigt noch auf A, Ziel = A
    const d = decideActivation({
      targetLeagueId: "A",
      currentLeagueId: null,
      lockLeagueId: "A",
      lockActivatedAt: new Date(T0).toISOString(),
      now: T0 + 2 * DAY,
    });
    expect(d).toEqual({ allowed: true, kind: "same" });
  });

  it("Anti-Umgehung: getrennt + andere Liga vor Ablauf → weiter cooldown", () => {
    const d = decideActivation({
      targetLeagueId: "B",
      currentLeagueId: null, // getrennt, um die Sperre zu umgehen
      lockLeagueId: "A",
      lockActivatedAt: new Date(T0).toISOString(),
      now: T0 + 2 * DAY,
    });
    expect(d.allowed).toBe(false);
  });
});
