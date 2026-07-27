"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const KEY_STORAGE = "kbinsides:collectKey";

function nowLocalInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmt(iso: string | null): string {
  if (!iso) return "kein Startpunkt (gesamte verfügbare Historie)";
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Setzt den Monitoring-Startpunkt einer Liga (Datum/Uhrzeit). Daten davor werden
 * nicht geladen und beim Setzen gelöscht — nützlich für Ligen ohne Reset mit
 * riesiger Historie. Das CRON_SECRET wird (wie beim Aktualisieren) nur lokal
 * gehalten.
 */
export default function TrackingControl({
  leagueId,
  current,
}: {
  leagueId: string;
  current: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ? current.slice(0, 16) : nowLocalInput());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(since: string | null) {
    let key: string | null = null;
    try {
      key = localStorage.getItem(KEY_STORAGE);
    } catch {
      /* ignore */
    }
    if (!key) {
      key = typeof window !== "undefined" ? window.prompt("CRON_SECRET eingeben") : null;
      if (!key) return;
      try {
        localStorage.setItem(KEY_STORAGE, key);
      } catch {
        /* ignore */
      }
    }

    setBusy(true);
    setMsg(since ? "Setze Startpunkt & entferne ältere Transfers …" : "Lösche Startpunkt …");
    try {
      const res = await fetch(`/api/league/tracking?league=${encodeURIComponent(leagueId)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ since }),
      });
      if (res.status === 401) {
        try {
          localStorage.removeItem(KEY_STORAGE);
        } catch {
          /* ignore */
        }
        throw new Error("Schlüssel abgelehnt — bitte erneut versuchen.");
      }
      const data = (await res.json()) as { ok?: boolean; error?: string; deletedTransfers?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMsg(
        since
          ? `Startpunkt gesetzt. ${data.deletedTransfers ?? 0} ältere Transfers entfernt. Jetzt „Aktualisieren".`
          : "Startpunkt gelöscht.",
      );
      setOpen(false);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="note-banner" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span>
          <b>Tracking-Start:</b> {fmt(current)}
        </span>
        <button className="btn" onClick={() => setOpen((o) => !o)} disabled={busy}>
          {open ? "Abbrechen" : "Ändern"}
        </button>
        {current && (
          <button className="btn" onClick={() => submit(null)} disabled={busy}>
            Löschen
          </button>
        )}
      </div>
      {open && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{
              background: "var(--paper)",
              border: "1px solid var(--line)",
              borderRadius: 3,
              padding: "6px 9px",
              fontFamily: "var(--mono)",
              fontSize: 13,
              color: "var(--ink)",
            }}
          />
          <button
            className="btn"
            disabled={busy || !value}
            onClick={() => submit(new Date(value).toISOString())}
          >
            Ab hier tracken
          </button>
          <span className="note">Ältere Transfers werden entfernt.</span>
        </div>
      )}
      {msg && (
        <span className="note" style={{ color: "var(--ink-soft)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
