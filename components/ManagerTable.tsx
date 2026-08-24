"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ManagerTableRow } from "../lib/db/queries";
import { maxBid } from "../lib/compute/reconstruct";
import { eur, eurFull, eurSigned, num, pct } from "../lib/format";
import InfoDot from "./InfoDot";

type Key =
  | "teamValue"
  | "squadMvGrowth"
  | "points"
  | "squadSize"
  | "lastActiveDays"
  | "cash"
  | "loginBonus"
  | "maxBid"
  | "liquidity"
  | "total";

/** Euro-Spalten: hier zeigt der Hover den exakten Wert bis auf den Euro. */
const EURO_KEYS = new Set<Key>(["teamValue", "squadMvGrowth", "cash", "loginBonus", "maxBid", "total"]);

/** Standardmäßig ausgeblendete Spalten — über das Zahnrad einblendbar. */
const OPTIONAL_KEYS = new Set<Key>(["lastActiveDays", "loginBonus"]);

/** Spalten, für die ein Platzierungs-Pfeil (Rang vs. Vortag) sinnvoll ist. */
const RANK_KEYS = new Set<Key>(["teamValue", "points", "cash", "maxBid", "total", "liquidity"]);

/** Kurzlabel der sortierten Kennzahl — für den Tooltip des Rang-Pfeils. */
const RANK_LABEL: Partial<Record<Key, string>> = {
  teamValue: "Kaderwert",
  points: "Punkte",
  cash: "Kontostand",
  maxBid: "Maximalgebot",
  total: "Gesamtwert",
  liquidity: "Liquidität",
};

/** Heutiger Wert der Kennzahl `k` (für die Rang-Pfeile). */
function curVal(r: ManagerTableRow, k: Key): number | null {
  switch (k) {
    case "teamValue":
      return r.teamValue;
    case "points":
      return r.points;
    case "cash":
      return r.cash;
    case "maxBid":
      return r.maxBid;
    case "total":
      return r.total;
    case "liquidity":
      return r.liquidity;
    default:
      return null;
  }
}

/**
 * Wert der Kennzahl `k` am Vortag, aus dem Snapshot (prevTeamValue/prevCash/
 * prevPoints). Abgeleitete Kennzahlen (Max-Gebot, Gesamt, Liquidität) werden aus
 * Vortags-Kaderwert + Vortags-Konto nach denselben Regeln wie heute berechnet.
 */
function prevVal(r: ManagerTableRow, k: Key): number | null {
  const pt = r.prevTeamValue;
  const pc = r.prevCash;
  switch (k) {
    case "teamValue":
      return pt;
    case "points":
      return r.prevPoints;
    case "cash":
      return pc;
    case "maxBid":
      return pc != null && pt != null ? maxBid(pc, pt) : null;
    case "total":
      return pc != null && pt != null ? pc + pt : null;
    case "liquidity": {
      if (pc == null || pt == null) return null;
      const tot = pc + pt;
      return tot > 0 ? pc / tot : null;
    }
    default:
      return null;
  }
}

interface Col {
  key: Key;
  label: string;
  money?: boolean; // nur bei gpm:2 sinnvoll (aus Transfers rekonstruiert)
  render: (r: ManagerTableRow) => string;
  highlight?: boolean;
  /** Erklärung auf Hover (Spaltenkopf). */
  info?: string;
}

const COLS: Col[] = [
  { key: "teamValue", label: "Kaderwert", render: (r) => eur(r.teamValue) },
  {
    key: "squadMvGrowth",
    label: "Kader-Momentum",
    info: "Summe der heutigen Marktwert-Änderungen aller Kaderspieler (jeder Spieler wird ~22 Uhr aktualisiert). Zeigt, wie viel Marktwert der Kader gerade gewinnt oder verliert — ein Maß dafür, wie attraktiv die Spieler dieses Managers aktuell sind.",
    render: (r) => (r.squadMvGrowth != null ? eurSigned(r.squadMvGrowth) : "—"),
  },
  { key: "points", label: "Punkte", render: (r) => num(r.points) },
  { key: "squadSize", label: "Spieler", render: (r) => (r.squadSize != null ? String(r.squadSize) : "—") },
  {
    key: "lastActiveDays",
    label: "Aktivität",
    info: "Tage seit dem letzten erfassten Transfer dieses Managers.",
    render: (r) =>
      r.lastActiveDays == null
        ? "—"
        : r.lastActiveDays === 0
          ? "heute"
          : `vor ${r.lastActiveDays} T`,
  },
  {
    key: "cash",
    label: "Kontostand",
    money: true,
    info: "Dein Konto exakt aus Kickbase. Bei Gegnern rekonstruiert: Start-Budget − Käufe + Verkäufe + geschätzter Login-Bonus.",
    render: (r) => eur(r.cash),
  },
  {
    key: "loginBonus",
    label: "Login-Bonus",
    money: true,
    info: "Geschätzter täglicher Login-Bonus, aufsummiert ab Reset (10.000 €, +10.000/Tag, max. 100.000/Tag). Annahme: täglich aktiv. Fließt in Konto & Max-Gebot der Gegner ein.",
    render: (r) => eur(r.loginBonus),
  },
  {
    key: "maxBid",
    label: "Maximalgebot",
    money: true,
    info: "Höchstes Gebot: Konto + 33 % × (Kaderwert + min(Konto, 0)) — die Kickbase-Regel.",
    render: (r) => eur(r.maxBid),
  },
  {
    key: "liquidity",
    label: "Liquidität",
    money: true,
    info: "Anteil flüssiges Geld am Gesamtwert (Konto ÷ (Konto + Kaderwert)). Niedrig = viel Wert im Kader gebunden.",
    render: (r) => (r.liquidity != null ? pct(r.liquidity) : "—"),
  },
  {
    key: "total",
    label: "Gesamt",
    money: true,
    info: "Gesamtwert = Kontostand + Kaderwert.",
    render: (r) => eur(r.total),
  },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ManagerTable({
  rows,
  showMoney,
  leagueId,
  title,
  info,
  note,
}: {
  rows: ManagerTableRow[];
  showMoney: boolean;
  leagueId: string;
  /** Optionale Kopfzeile (Titel + Info + Hinweis + Zahnrad auf einer Zeile). */
  title?: string;
  info?: string;
  note?: string;
}) {
  // Optionale Spalten (Aktivität, Login-Bonus) sind per Default aus und werden
  // über das Zahnrad einzeln eingeblendet.
  const [optional, setOptional] = useState<Record<string, boolean>>({});
  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!gearOpen) return;
    const onClick = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [gearOpen]);

  // Spalte nur zeigen, wenn (a) im Modus valide, (b) nicht als optional
  // ausgeblendet und (c) mind. ein Wert vorhanden.
  const cols = COLS.filter((c) => {
    if (c.money && !showMoney) return false;
    if (OPTIONAL_KEYS.has(c.key) && !optional[c.key]) return false;
    return rows.some((r) => {
      const v = r[c.key];
      return v != null;
    });
  });

  // Optionale Spalten, die überhaupt Daten haben — nur die im Zahnrad anbieten.
  const optionalCols = COLS.filter(
    (c) => OPTIONAL_KEYS.has(c.key) && (!c.money || showMoney) && rows.some((r) => r[c.key] != null),
  );

  const defaultKey: Key = showMoney ? "total" : "points";
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: defaultKey, dir: -1 });

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls immer ans Ende
    if (bv == null) return -1;
    return (av - bv) * sort.dir;
  });

  const clickSort = (k: Key) =>
    setSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: -1 }));
  const arrow = (k: Key) => (sort.key === k ? (sort.dir < 0 ? " ↓" : " ↑") : "");

  // Platzierungs-Pfeile REAGIEREN auf die sortierte Spalte: Rang der aktuell
  // sortierten Kennzahl (heute) vs. Rang, den der Vortags-Snapshot derselben
  // Kennzahl ergibt. Positiv = seit gestern hochgerückt. Nur aktive Manager mit
  // heutigem UND Vortags-Wert (sonst kein sinnvoller Vergleich).
  const rankDeltas = useMemo(() => {
    const out = new Map<string, number>();
    if (!RANK_KEYS.has(sort.key)) return out;
    const pool = rows.filter(
      (r) => r.active && curVal(r, sort.key) != null && prevVal(r, sort.key) != null,
    );
    if (pool.length < 2) return out;
    const rankBy = (get: (r: ManagerTableRow) => number | null) => {
      const arr = [...pool].sort((a, b) => (get(b) ?? 0) - (get(a) ?? 0) || a.id.localeCompare(b.id));
      const m = new Map<string, number>();
      arr.forEach((x, i) => m.set(x.id, i + 1));
      return m;
    };
    const now = rankBy((r) => curVal(r, sort.key));
    const prev = rankBy((r) => prevVal(r, sort.key));
    for (const r of pool) {
      const n = now.get(r.id);
      const p = prev.get(r.id);
      if (n != null && p != null && n !== p) out.set(r.id, p - n);
    }
    return out;
  }, [rows, sort.key]);
  const rankLabel = RANK_LABEL[sort.key] ?? "Kennzahl";

  const leagueHref = (base: string) => `${base}?league=${encodeURIComponent(leagueId)}`;

  const gear =
    optionalCols.length > 0 ? (
      <div className="gear-wrap" ref={gearRef}>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Spalten ein-/ausblenden"
          title="Spalten ein-/ausblenden"
          aria-expanded={gearOpen}
          onClick={() => setGearOpen((o) => !o)}
        >
          ⚙
        </button>
        {gearOpen && (
          <div className="gear-menu">
            <div className="gear-menu-head">Weitere Spalten</div>
            {optionalCols.map((c) => (
              <label key={c.key} className="gear-opt">
                <input
                  type="checkbox"
                  checked={Boolean(optional[c.key])}
                  onChange={(e) => setOptional((o) => ({ ...o, [c.key]: e.target.checked }))}
                />
                {c.label}
              </label>
            ))}
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className="mgr-table">
      {(title || note || gear) && (
        <div className="section-head mgr-head">
          {title ? (
            <h2>
              {title}
              {info && <InfoDot text={info} />}
            </h2>
          ) : (
            <span />
          )}
          <div className="mgr-head-right">
            {note && <span className="note">{note}</span>}
            {gear}
          </div>
        </div>
      )}
      <div className="table-wrap">
      <table className="tbl click">
        <thead>
          <tr>
            <th className="l" />
            <th className="l">Manager</th>
            {cols.map((c) => (
              <th key={c.key} data-sk={c.key}>
                <span onClick={() => clickSort(c.key)} style={{ cursor: "pointer" }}>
                  {c.label}
                  {arrow(c.key)}
                </span>
                {c.info && <InfoDot text={c.info} align="right" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id}>
              <td className="rank l">{r.active ? i + 1 : "—"}</td>
              <td className="l">
                <div className="mgr">
                  <span className="avatar">{initials(r.name)}</span>
                  <Link href={leagueHref(`/manager/${r.id}`)} className="nm linklike">
                    {r.name}
                  </Link>
                  {(() => {
                    const d = rankDeltas.get(r.id);
                    if (d == null || d === 0) return null;
                    return (
                      <span
                        title={`${rankLabel}: ${d > 0 ? "+" : "−"}${Math.abs(d)} Plätze seit gestern`}
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 11,
                          fontWeight: 600,
                          color: d > 0 ? "var(--gain)" : "var(--loss)",
                        }}
                      >
                        {d > 0 ? "▲" : "▼"}
                        {Math.abs(d)}
                      </span>
                    );
                  })()}
                  {r.isMe && <span className="tag">du</span>}
                  {!r.active && <span className="warnflag">inaktiv</span>}
                </div>
              </td>
              {cols.map((c) => {
                const raw = r[c.key];
                const exact = EURO_KEYS.has(c.key) && raw != null ? eurFull(raw) : undefined;
                // Delta nur zeigen, wenn es nicht auf 0,0 % rundet — ein „+0,0 %"
                // (z. B. kein neues Marktwert-Update seit dem letzten Snapshot)
                // wirkt wie ein Fehler und wird daher weggelassen.
                const rawDelta = c.key === "teamValue" ? r.teamValueDeltaPct : null;
                const delta = rawDelta != null && Math.abs(rawDelta) * 100 >= 0.05 ? rawDelta : null;
                // Negativer Kontostand / negative Liquidität = im Minus → rot.
                const negative =
                  (c.key === "cash" || c.key === "liquidity") && typeof raw === "number" && raw < 0;
                // Kader-Momentum vorzeichenfarbig (grün steigend, rot fallend).
                const signed =
                  c.key === "squadMvGrowth" && typeof raw === "number" && raw !== 0
                    ? raw > 0
                      ? "var(--gain)"
                      : "var(--loss)"
                    : null;
                const style = c.highlight
                  ? { fontWeight: 600, color: "var(--signal)" }
                  : negative
                    ? { fontWeight: 600, color: "var(--loss)" }
                    : signed
                      ? { fontWeight: 600, color: signed }
                      : undefined;
                return (
                  <td key={c.key} className="num" title={exact} style={style}>
                    {c.render(r)}
                    {delta != null && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 11,
                          color: delta >= 0 ? "var(--gain)" : "var(--loss)",
                        }}
                      >
                        {delta >= 0 ? "+" : "−"}
                        {(Math.abs(delta) * 100).toFixed(1)} %
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={cols.length + 2} className="l muted" style={{ padding: 24 }}>
                Keine Snapshots für diese Liga. Über „Aktualisieren" Daten anfordern.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
