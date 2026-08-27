"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { eur } from "../lib/format";

function nowLocalInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface LeagueSettingsValues {
  gameMode: number | null;
  startBudget: number;
  trackingSince: string | null;
  includeHistory: boolean;
  bonusMode: string;
}

/**
 * Per-Liga-Einstellungen als Zahnrad-Icon (selten gebraucht → aus dem Weg).
 * Klick öffnet einen Modal-Dialog mit Liga-Typ, Start-Budget, Startzeitpunkt,
 * Historie und Bonusmodell. Speichert über /api/league/settings (per Session
 * authentifiziert; jedes verbundene Mitglied der Liga darf ändern).
 */
export default function LeagueSettings({
  leagueId,
  current,
}: {
  leagueId: string;
  current: LeagueSettingsValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [gameMode, setGameMode] = useState<number>(current.gameMode ?? 2);
  const [budgetMio, setBudgetMio] = useState<string>(String(Math.round(current.startBudget / 1e6)));
  const [since, setSince] = useState<string>(
    current.trackingSince ? current.trackingSince.slice(0, 16) : nowLocalInput(),
  );
  const [useStart, setUseStart] = useState<boolean>(current.trackingSince != null);
  const [includeHistory, setIncludeHistory] = useState<boolean>(current.includeHistory);
  const [bonusMode, setBonusMode] = useState<string>(current.bonusMode);

  // Escape schließt den Dialog (außer während des Speicherns).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function pickType(gm: number) {
    setGameMode(gm);
    // Standardbudget je Typ vorschlagen (überschreibbar).
    setBudgetMio(gm === 2 ? "200" : "50");
  }

  async function save() {
    setBusy(true);
    setMsg("Speichere …");
    try {
      const trackingSince = useStart && since ? new Date(since).toISOString() : null;
      const res = await fetch(`/api/league/settings?league=${encodeURIComponent(leagueId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameMode,
          startBudget: Math.round(Number(budgetMio) * 1e6),
          trackingSince,
          includeHistory,
          bonusMode,
        }),
      });
      if (res.status === 401) throw new Error("Nicht angemeldet — bitte neu einloggen.");
      if (res.status === 403) throw new Error("Keine Berechtigung für diese Liga.");
      const data = (await res.json()) as { ok?: boolean; error?: string; deletedTransfers?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMsg(
        `Gespeichert.${data.deletedTransfers ? ` ${data.deletedTransfers} ältere Transfers entfernt.` : ""} Jetzt „Aktualisieren".`,
      );
      setOpen(false);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function backfill() {
    if (!current.trackingSince) {
      setMsg("Bitte zuerst einen Startzeitpunkt setzen & speichern.");
      return;
    }
    setBusy(true);
    setMsg("Lade gesamte Historie ab Startzeitpunkt … (kann etwas dauern)");
    try {
      const res = await fetch(`/api/league/backfill?league=${encodeURIComponent(leagueId)}`, {
        method: "POST",
      });
      if (res.status === 401) throw new Error("Nicht angemeldet — bitte neu einloggen.");
      if (res.status === 403) throw new Error("Keine Berechtigung für diese Liga.");
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        transfers?: number;
        deletedTransfers?: number;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMsg(`Historie geladen: ${data.transfers ?? 0} Transfers erfasst. Konto ist jetzt rekonstruiert.`);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = (current.gameMode ?? 2) === 2 ? "200 Mio · Nullspieler" : "50 Mio · zugeloste Spieler";

  return (
    <>
      <button
        className="icon-btn"
        title="Liga-Einstellungen"
        aria-label="Liga-Einstellungen"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => !busy && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h3>Liga-Einstellungen</h3>
              <button className="modal-close" aria-label="Schließen" onClick={() => setOpen(false)} disabled={busy}>
                ×
              </button>
            </div>

            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 16, fontSize: 13 }}>
              <div className="note" style={{ color: "var(--mute)" }}>
                Aktuell: {typeLabel} · Start-Budget {eur(current.startBudget)} · Start {fmtDate(current.trackingSince)}
              </div>

              <Field label="Liga-Typ">
                <Radio checked={gameMode === 2} onChange={() => pickType(2)} label="200 Mio · Nullspieler (Manager)" />
                <Radio checked={gameMode === 1} onChange={() => pickType(1)} label="50 Mio · zugeloste Spieler (Classic)" />
              </Field>

              <Field label="Start-Budget (Mio €)">
                <input
                  type="number"
                  value={budgetMio}
                  onChange={(e) => setBudgetMio(e.target.value)}
                  style={inputStyle}
                  min={0}
                />
              </Field>

              <Field label="Historische Daten">
                <Radio checked={includeHistory} onChange={() => setIncludeHistory(true)} label="Einbeziehen (gesamte verfügbare Historie)" />
                <Radio checked={!includeHistory} onChange={() => setIncludeHistory(false)} label="Ab Startzeitpunkt (Ältere ignorieren & entfernen)" />
              </Field>

              <Field label="Liga-Start / Startzeitpunkt">
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={useStart} onChange={(e) => setUseStart(e.target.checked)} />
                  Startzeitpunkt setzen
                </label>
                {useStart && (
                  <input
                    type="datetime-local"
                    value={since}
                    onChange={(e) => setSince(e.target.value)}
                    style={inputStyle}
                  />
                )}
              </Field>

              <Field label="Bonusmodell">
                <Radio checked={bonusMode === "matchday"} onChange={() => setBonusMode("matchday")} label="Spieltagsboni" />
                <Radio checked={bonusMode === "lockin"} onChange={() => setBonusMode("lockin")} label="Nur Lock-In-Bonus" />
              </Field>

              <div>
                <button className="btn" onClick={save} disabled={busy}>
                  Speichern
                </button>
              </div>

              <Field label="Historie ab Reset laden (nur bei neu verbundenen Ligen nötig)">
                <p className="note" style={{ color: "var(--mute)", margin: 0 }}>
                  Lädt die <strong>gesamte Transferhistorie ab dem Startzeitpunkt</strong> nach und
                  rekonstruiert Konto &amp; Handelsbilanz vollständig. Erst Startzeitpunkt setzen &amp;
                  speichern, dann laden. Bestehende, korrekte Ligen brauchen das nicht.
                </p>
                <button
                  className="btn"
                  onClick={backfill}
                  disabled={busy || !current.trackingSince}
                  style={{ alignSelf: "flex-start" }}
                >
                  Volle Historie ab Startzeitpunkt laden
                </button>
              </Field>

              {msg && (
                <div className="note" style={{ color: "var(--ink-soft)" }}>
                  {msg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle: CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 3,
  padding: "7px 10px",
  fontFamily: "var(--mono)",
  fontSize: 13,
  color: "var(--ink)",
  maxWidth: 260,
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
      <input type="radio" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}
