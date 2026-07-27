"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const KEY_STORAGE = "kbinsides:collectKey";

type Status = "idle" | "running" | "done" | "error";

/**
 * On-Demand-„Aktualisieren"-Button. Fordert frische Daten für die aktive Liga
 * an (POST /api/collect?league=…). Das CRON_SECRET wird einmalig eingegeben und
 * nur lokal (localStorage) gehalten — es liegt nicht im ausgelieferten Bundle.
 */
export default function RefreshButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const [collectKey, setCollectKey] = useState<string | null>(null);
  const [askKey, setAskKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      setCollectKey(localStorage.getItem(KEY_STORAGE));
    } catch {
      /* ignore */
    }
  }, []);

  async function run(key: string) {
    setStatus("running");
    setMessage("Sammle Ranking, Transfers und Markt …");
    try {
      const res = await fetch(`/api/collect?league=${encodeURIComponent(leagueId)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        try {
          localStorage.removeItem(KEY_STORAGE);
        } catch {
          /* ignore */
        }
        setCollectKey(null);
        setAskKey(true);
        setStatus("error");
        setMessage("Schlüssel abgelehnt — bitte erneut eingeben.");
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        leagues?: { managers?: number; transfers?: number; market?: number; error?: string }[];
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const l = data.leagues?.[0];
      if (l?.error) throw new Error(l.error);
      setStatus("done");
      setMessage(
        `Fertig: ${l?.managers ?? 0} Manager, ${l?.transfers ?? 0} Transfers, ${l?.market ?? 0} am Markt.`,
      );
      router.refresh();
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    }
  }

  function onClick() {
    if (collectKey) void run(collectKey);
    else setAskKey(true);
  }

  function saveKeyAndRun() {
    const k = keyInput.trim();
    if (!k) return;
    try {
      localStorage.setItem(KEY_STORAGE, k);
    } catch {
      /* ignore */
    }
    setCollectKey(k);
    setAskKey(false);
    setKeyInput("");
    void run(k);
  }

  const running = status === "running";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      {askKey ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveKeyAndRun();
          }}
          style={{ display: "flex", gap: 6 }}
        >
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="CRON_SECRET"
            autoFocus
            style={{
              background: "var(--paper)",
              border: "1px solid var(--line)",
              borderRadius: 3,
              padding: "7px 10px",
              color: "var(--ink)",
              fontFamily: "var(--mono)",
              fontSize: 13,
              width: 220,
            }}
          />
          <button type="submit" className="btn">
            Speichern &amp; Laden
          </button>
        </form>
      ) : (
        <button onClick={onClick} disabled={running} className="btn" aria-busy={running}>
          {running ? "Lädt …" : "Aktualisieren"}
        </button>
      )}
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
