import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requireEnv } from "../env";

/**
 * App-seitige Verschlüsselung für Kickbase-Tokens (Design §5). AES-256-GCM mit
 * einem Schlüssel aus der Umgebung (`KB_TOKEN_ENC_KEY`, 32 Byte base64). In der
 * DB liegt nur das Chiffrat + IV + Auth-Tag (jeweils base64) — ohne den
 * Env-Schlüssel wertlos. Rein server-seitig verwenden.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM-Standard-Nonce
const KEY_LEN = 32; // AES-256

/** Liest & validiert den 32-Byte-Schlüssel aus KB_TOKEN_ENC_KEY (base64). */
export function encryptionKey(): Buffer {
  const raw = requireEnv("KB_TOKEN_ENC_KEY");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `KB_TOKEN_ENC_KEY muss ${KEY_LEN} Byte (base64) sein, ist aber ${buf.length}.`,
    );
  }
  return buf;
}

export interface Sealed {
  /** base64(Chiffrat) */
  ct: string;
  /** base64(IV/Nonce) */
  iv: string;
  /** base64(GCM Auth-Tag) */
  tag: string;
}

/** Verschlüsselt Klartext → { ct, iv, tag } (alles base64). */
export function seal(plaintext: string, key: Buffer = encryptionKey()): Sealed {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ct: ct.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** Entschlüsselt { ct, iv, tag } → Klartext. Wirft bei Manipulation (Tag). */
export function open(sealed: Sealed, key: Buffer = encryptionKey()): string {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(sealed.ct, "base64")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

/** Erzeugt einen neuen 32-Byte-Schlüssel als base64 (für KB_TOKEN_ENC_KEY-Setup). */
export function generateKeyBase64(): string {
  return randomBytes(KEY_LEN).toString("base64");
}
