import { describe, it, expect, vi } from "vitest";
import { paginateTransfers, TRANSFER_PAGE_SIZE } from "./transfers";
import type { TransferItem } from "../kickbase/schemas";

/** Baut eine Seite aus `n` synthetischen Transfers ab Index `offset`. */
function page(offset: number, n: number): TransferItem[] {
  return Array.from({ length: n }, (_, i) => ({
    dt: `2025-01-01T00:00:${String(offset + i).padStart(2, "0")}Z`,
    pi: String(1000 + offset + i),
    pn: "X",
    tid: "1",
    trp: 1000,
    tty: 1,
  })) as TransferItem[];
}
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTransfers } from "./transfers";

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "fixtures/manager_transfers.json"), "utf8"),
);

const LEAGUE = "6847281";
const MANAGER = "2172510";

describe("parseTransfers", () => {
  const rows = parseTransfers(fixture, LEAGUE, MANAGER);

  it("erzeugt je Transfer eine Zeile", () => {
    expect(rows).toHaveLength(25);
  });

  it("mappt tty=1 → buy (to_manager) und tty=2 → sell (from_manager)", () => {
    const buy = rows.find((r) => r.id === `${MANAGER}:7441:2025-12-20T05:13:16Z:1`);
    expect(buy?.direction).toBe("buy");
    expect(buy?.to_manager).toBe(MANAGER);
    expect(buy?.from_manager).toBeNull();
    expect(buy?.price).toBe(50000000);

    const sell = rows.find((r) => r.id === `${MANAGER}:2718:2025-11-21T18:49:54Z:2`);
    expect(sell?.direction).toBe("sell");
    expect(sell?.from_manager).toBe(MANAGER);
    expect(sell?.to_manager).toBeNull();
  });

  it("bildet stabile, eindeutige IDs (idempotent)", () => {
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.size).toBe(rows.length);
  });
});

describe("paginateTransfers", () => {
  const SIZE = TRANSFER_PAGE_SIZE;

  it("stoppt nach einer unvollständigen ersten Seite", async () => {
    const fetchPage = vi.fn(async (start: number) => (start === 0 ? page(0, 10) : []));
    const all = await paginateTransfers(fetchPage);
    expect(all).toHaveLength(10);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0);
  });

  it("hängt volle Seiten aneinander und fragt die richtigen Offsets ab", async () => {
    // 2 volle Seiten (25 + 25) + eine unvollständige (7) = 57.
    const fetchPage = vi.fn(async (start: number) => {
      if (start === 0) return page(0, SIZE);
      if (start === SIZE) return page(SIZE, SIZE);
      if (start === 2 * SIZE) return page(2 * SIZE, 7);
      return [];
    });
    const all = await paginateTransfers(fetchPage);
    expect(all).toHaveLength(57);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([0, SIZE, 2 * SIZE]);
  });

  it("bricht ab, wenn die API dieselbe Seite erneut liefert (Clamp)", async () => {
    // start=50 klammert auf die vorige Seite zurück statt leer zu liefern.
    const fetchPage = vi.fn(async (start: number) => {
      if (start === 0) return page(0, SIZE);
      return page(SIZE, SIZE); // start=25 UND start=50 liefern dieselbe Seite
    });
    const all = await paginateTransfers(fetchPage);
    expect(all).toHaveLength(2 * SIZE); // Seite 0 + Seite 1, keine Dublette
    expect(fetchPage).toHaveBeenCalledTimes(3); // 0, 25, 50(=Clamp erkannt)
  });

  it("respektiert das maxPages-Sicherheitslimit", async () => {
    const fetchPage = vi.fn(async (start: number) => page(start, SIZE)); // nie leer
    const all = await paginateTransfers(fetchPage, { maxPages: 3 });
    expect(all).toHaveLength(3 * SIZE);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("liefert [] bei leerer erster Seite", async () => {
    const all = await paginateTransfers(async () => []);
    expect(all).toEqual([]);
  });
});
