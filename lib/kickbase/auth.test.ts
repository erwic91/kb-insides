import { describe, it, expect } from "vitest";
import { extractTokens, isExpiringSoon } from "./auth";
import { KickbaseAuthError } from "./errors";

describe("extractTokens", () => {
  it("liest kryptische v4-Keys (tkn/rtkn/tknex)", () => {
    const t = extractTokens({ tkn: "abc", rtkn: "ref", tknex: "2030-01-01T00:00:00Z" });
    expect(t.accessToken).toBe("abc");
    expect(t.refreshToken).toBe("ref");
    expect(t.expiresAt).toBe("2030-01-01T00:00:00Z");
  });

  it("liest generische Keys (token/accessToken)", () => {
    expect(extractTokens({ token: "x" }).accessToken).toBe("x");
    expect(extractTokens({ accessToken: "y" }).accessToken).toBe("y");
  });

  it("refreshToken/expiry sind optional", () => {
    const t = extractTokens({ tkn: "only" });
    expect(t.refreshToken).toBeNull();
    expect(t.expiresAt).toBeNull();
  });

  it("wirft, wenn kein Token gefunden wird", () => {
    expect(() => extractTokens({ foo: "bar" })).toThrow(KickbaseAuthError);
  });
});

describe("isExpiringSoon", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("true bei fehlendem/ungültigem Ablauf", () => {
    expect(isExpiringSoon(null, now)).toBe(true);
    expect(isExpiringSoon("nonsense", now)).toBe(true);
  });
  it("true innerhalb 24h", () => {
    expect(isExpiringSoon("2026-01-01T12:00:00Z", now)).toBe(true);
  });
  it("false bei > 24h Restlaufzeit", () => {
    expect(isExpiringSoon("2026-01-05T00:00:00Z", now)).toBe(false);
  });
});
