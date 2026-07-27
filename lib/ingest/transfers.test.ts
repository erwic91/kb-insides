import { describe, it, expect } from "vitest";
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
