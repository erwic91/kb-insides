"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * „Deadline Day"-Toggle neben dem Aktualisieren-Button. Ist er aktiv, wird die
 * aktive Liga alle 5 Minuten automatisch aktualisiert — gedacht für Transfer-
 * Stichtage mit vielen Bewegungen. Läuft rein clientseitig (nur bei offenem,
 * sichtbarem Tab), ohne Überlappung. Bei einer Kickbase-Drosselung (403/Sperre)
 * schaltet er sich selbst ab. Zustand bleibt in localStorage erhalten.
 */
const INTERVAL_MS = 5 * 60 * 1000;
const BLOCK_RE = /403|blockiert|blocked|gesperrt|drossel|rate.?limit|429/i;

export default function DeadlineDayToggle({ leagueId }: { leagueId?: string }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [msg, setMsg] = useState("");
  const runningRef = useRef(false);

  useEffect(() => {
    try {
      setActive(localStorage.getItem("deadlineDay") === "1");
    } catch {
      /* localStorage kann blockiert sein */
    }
  }, []);

  const persist = (v: boolean) => {
    try {
      localStorage.setItem("deadlineDay", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const stop = (reason: string) => {
    setActive(false);
    persist(false);
    setMsg(reason);
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const runOnce = async () => {
      if (runningRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return; // nur sichtbarer Tab
      runningRef.current = true;
      try {
        const url = leagueId
          ? `/api/me/refresh?league=${encodeURIComponent(leagueId)}`
          : "/api/me/refresh";
        const res = await fetch(url, { method: "POST" });
        if (res.status === 401) return stop("Nicht angemeldet — Deadline Day gestoppt.");
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          leagues?: { transfers?: number; error?: string }[];
        };
        const err = data.error ?? data.leagues?.find((l) => l.error)?.error ?? null;
        if (err && BLOCK_RE.test(err)) return stop("Kickbase hat gedrosselt — Deadline Day gestoppt.");
        if (!res.ok || !data.ok || err) {
          setMsg(err ?? `Fehler ${res.status}`);
          return;
        }
        const now = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        setMsg(`Auto-Update ${now}: ${data.leagues?.[0]?.transfers ?? 0} Transfers`);
        if (!cancelled) router.refresh();
      } catch (e) {
        setMsg((e as Error).message);
      } finally {
        runningRef.current = false;
      }
    };

    void runOnce(); // sofort einmal beim Aktivieren
    const id = setInterval(() => void runOnce(), INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, leagueId, router]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        className={`btn ghost ${active ? "dd-on" : ""}`}
        onClick={() => {
          const v = !active;
          setActive(v);
          persist(v);
          setMsg(v ? "Deadline Day aktiv — Update alle 5 Min." : "");
        }}
        title="Alle 5 Minuten automatisch aktualisieren (nur bei offenem Tab)"
      >
        {active ? "● Deadline Day" : "Deadline Day"}
      </button>
      {active && msg && (
        <span className="muted" style={{ fontSize: 11, textAlign: "right", maxWidth: 260 }}>
          {msg}
        </span>
      )}
    </div>
  );
}
