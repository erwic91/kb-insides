import { describe, it, expect, vi } from "vitest";
import { kbFetch } from "./http";
import { KickbaseBlockedError, KickbaseHttpError } from "./errors";

const noSleep = () => Promise.resolve();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("kbFetch", () => {
  it("gibt geparstes JSON bei 200 zurück", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: 1 }));
    const res = await kbFetch<{ ok: number }>("/x", { fetchImpl, sleepImpl: noSleep });
    expect(res.ok).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("bricht bei 429 sofort ab (kein Retry)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429, {}));
    await expect(kbFetch("/x", { fetchImpl, sleepImpl: noSleep })).rejects.toBeInstanceOf(
      KickbaseBlockedError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("bricht bei 403 sofort ab (kein Retry)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(403, {}));
    await expect(kbFetch("/x", { fetchImpl, sleepImpl: noSleep })).rejects.toBeInstanceOf(
      KickbaseBlockedError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retryt bei 5xx bis maxRetries und wirft dann", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    await expect(
      kbFetch("/x", { fetchImpl, sleepImpl: noSleep, maxRetries: 2 }),
    ).rejects.toBeInstanceOf(KickbaseHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 Retries
  });

  it("erholt sich nach transientem 5xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const res = await kbFetch<{ ok: boolean }>("/x", { fetchImpl, sleepImpl: noSleep });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retryt nicht bei 4xx (außer Block)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    await expect(kbFetch("/x", { fetchImpl, sleepImpl: noSleep })).rejects.toBeInstanceOf(
      KickbaseHttpError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("setzt Bearer-Header, wenn Token übergeben wird", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await kbFetch("/x", { fetchImpl, sleepImpl: noSleep, token: "tok" });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
});
