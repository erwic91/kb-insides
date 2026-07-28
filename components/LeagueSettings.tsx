"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { eur } from "../lib/format";

const KEY_STORAGE = "kbinsides:collectKey";

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
 * Per-Liga-Einstellungen: Liga-Typ (200 Mio/Nullspieler vs. 50 Mio/zugeloste
 * Spieler), Start-Zeitpunkt, Start-Budget, Historie ein/aus, Bonusmodell.
 * Speichert über /api/league/settings; CRON_SECRET nur lokal (localStorage).
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

  function pickType(gm: number) {
    setGameMode(gm);
    // Standardbudget je Typ vorschlagen (überschreibbar).
    setBudgetMio(gm === 2 ? "200" : "50");
  }

  async function save() {
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
    setMsg("Speichere …");
    try {
      const trackingSince = useStart && since ? new Date(since).toISOString() : null;
      const res = await fetch(`/api/league/settings?league=${encodeURIComponent(leagueId)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          gameMode,
          startBudget: Math.round(Number(budgetMio) * 1e6),
          trackingSince,
          includeHistory,
          bonusMode,
        }),
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

  const typeLabel = (current.gameMode ?? 2) === 2 ? "200 Mio · Nullspieler" : "50 Mio · zugeloste Spieler";

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Liga-Einstellungen</h3>
        <button className="btn" onClick={() => setOpen((o) => !o)} disabled={busy}>
          {open ? "Abbrechen" : "Bearbeiten"}
        </button>
      </div>

      {!open ? (
        <div style={{ padding: "12px 18px", fontSize: 13, display: "flex", gap: 20, flexWrap: "wrap" }}>
          <span>
            <b>Typ:</b> {typeLabel}
          </span>
          <span>
            <b>Start-Budget:</b> {eur(current.startBudget)}
          </span>
          <span>
            <b>Start:</b> {fmtDate(current.trackingSince)}
          </span>
          <span>
            <b>Historie:</b> {current.includeHistory ? "einbezogen" : "ab Start"}
          </span>
          <span>
            <b>Bonus:</b> {current.bonusMode === "lockin" ? "nur Lock-In" : "Spieltagsboni"}
          </span>
        </div>
      ) : (
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 16, fontSize: 13 }}>
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
        </div>
      )}

      {msg && (
        <div className="note" style={{ padding: "0 18px 12px", color: "var(--ink-soft)" }}>
          {msg}
        </div>
      )}
    </div>
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
