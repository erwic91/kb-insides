import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { seal, open, generateKeyBase64 } from "./crypto";

const key = () => Buffer.from(generateKeyBase64(), "base64");

describe("crypto (AES-256-GCM Token-Verschlüsselung)", () => {
  it("Round-Trip: open(seal(x)) === x", () => {
    const k = key();
    const secret = "eyJhbGciOi.kickbase.token-123";
    const sealed = seal(secret, k);
    expect(open(sealed, k)).toBe(secret);
  });

  it("Chiffrat unterscheidet sich vom Klartext und ist base64", () => {
    const k = key();
    const sealed = seal("geheim", k);
    expect(sealed.ct).not.toContain("geheim");
    // base64 dekodierbar
    expect(Buffer.from(sealed.iv, "base64").length).toBe(12);
    expect(Buffer.from(sealed.tag, "base64").length).toBe(16);
  });

  it("zwei Verschlüsselungen desselben Klartexts erzeugen unterschiedliche IVs/Chiffrate", () => {
    const k = key();
    const a = seal("gleich", k);
    const b = seal("gleich", k);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("falscher Schlüssel schlägt fehl", () => {
    const sealed = seal("geheim", key());
    expect(() => open(sealed, key())).toThrow();
  });

  it("manipuliertes Chiffrat schlägt am Auth-Tag fehl", () => {
    const k = key();
    const sealed = seal("geheim", k);
    const tampered = { ...sealed, ct: randomBytes(16).toString("base64") };
    expect(() => open(tampered, k)).toThrow();
  });

  it("generateKeyBase64 erzeugt 32-Byte-Schlüssel", () => {
    expect(Buffer.from(generateKeyBase64(), "base64").length).toBe(32);
  });
});
