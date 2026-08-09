"use client";

import { useState } from "react";
import Link from "next/link";
import type { ManagerTableRow } from "../lib/db/queries";
import { eur, eurFull, num, pct } from "../lib/format";
import InfoDot from "./InfoDot";

type Key =
  | "teamValue"
  | "points"
  | "squadSize"
  | "lastActiveDays"
  | "cash"
  | "loginBonus"
  | "maxBid"
  | "liquidity"
  | "total";

/** Euro-Spalten: hier zeigt der Hover den exakten Wert bis auf den Euro. */
const EURO_KEYS = new Set<Key>(["teamValue", "cash", "loginBonus", "maxBid", "total"]);

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
}: {
  rows: ManagerTableRow[];
  showMoney: boolean;
  leagueId: string;
}) {
  // Spalte nur zeigen, wenn (a) im Modus valide und (b) mind. ein Wert vorhanden.
  const cols = COLS.filter((c) => {
    if (c.money && !showMoney) return false;
    return rows.some((r) => {
      const v = r[c.key];
      return v != null;
    });
  });

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

  const leagueHref = (base: string) => `${base}?league=${encodeURIComponent(leagueId)}`;

  return (
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
                return (
                  <td
                    key={c.key}
                    className="num"
                    title={exact}
                    style={c.highlight ? { fontWeight: 600, color: "var(--signal)" } : undefined}
                  >
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
  );
}
