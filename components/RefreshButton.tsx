"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "running" | "done" | "error";

/**
 * On-Demand-„Aktualisieren"-Button (Multi-User). Fordert frische Daten für die
 * aktive Liga des angemeldeten Nutzers an (POST /api/me/refresh, per
 * Session-Cookie authentifiziert — kein Secret nötig) und aktualisiert danach
 * die Ansicht.
 */
export default function RefreshButton({ leagueId }: { leagueId?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function run() {
    setStatus("running");
    setMessage("Sammle Ranking, Transfers und Markt …");
    try {
      const url = leagueId
        ? `/api/me/refresh?league=${encodeURIComponent(leagueId)}`
        : "/api/me/refresh";
      const res = await fetch(url, { method: "POST" });
      if (res.status === 401) {
        setStatus("error");
        setMessage("Nicht angemeldet — bitte neu einloggen.");
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        leagues?: {
          managers?: number;
          transfers?: number;
          market?: number;
          error?: string;
          budgetError?: string;
        }[];
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const l = data.leagues?.[0];
      if (l?.error) throw new Error(l.error);
      setStatus(l?.budgetError ? "error" : "done");
      setMessage(
        l?.budgetError
          ? `Daten aktualisiert, aber exakter Kontostand NICHT (${l.budgetError}). Der angezeigte Konto-Wert ist von vorher.`
          : `Fertig: ${l?.managers ?? 0} Manager, ${l?.transfers ?? 0} Transfers, ${l?.market ?? 0} am Markt.`,
      );
      router.refresh();
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    }
  }

  const running = status === "running";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button onClick={() => void run()} disabled={running} className="btn" aria-busy={running}>
        {running ? "Lädt …" : "Aktualisieren"}
      </button>
      {message && (
        <span
          className={status === "error" ? "down" : "muted"}
          style={{ fontSize: 12, maxWidth: 320, textAlign: "right" }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
