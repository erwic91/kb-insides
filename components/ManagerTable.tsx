"use client";

import { useState } from "react";
import Link from "next/link";
import type { ManagerTableRow } from "../lib/db/queries";
import { eur, num, pct } from "../lib/format";

type Key =
  | "teamValue"
  | "points"
  | "squadSize"
  | "lastActiveDays"
  | "cash"
  | "maxBid"
  | "liquidity"
  | "total";

interface Col {
  key: Key;
  label: string;
  money?: boolean; // nur bei gpm:2 sinnvoll (aus Transfers rekonstruiert)
  render: (r: ManagerTableRow) => string;
  highlight?: boolean;
}

const COLS: Col[] = [
  { key: "teamValue", label: "Kaderwert", render: (r) => eur(r.teamValue) },
  { key: "points", label: "Punkte", render: (r) => num(r.points) },
  { key: "squadSize", label: "Spieler", render: (r) => (r.squadSize != null ? String(r.squadSize) : "—") },
  {
    key: "lastActiveDays",
    label: "Aktivität",
    render: (r) =>
      r.lastActiveDays == null
        ? "—"
        : r.lastActiveDays === 0
          ? "heute"
          : `vor ${r.lastActiveDays} T`,
  },
  { key: "cash", label: "Kontostand", money: true, render: (r) => eur(r.cash) },
  { key: "maxBid", label: "Maximalgebot", money: true, highlight: true, render: (r) => eur(r.maxBid) },
  {
    key: "liquidity",
    label: "Liquidität",
    money: true,
    render: (r) => (r.liquidity != null ? pct(r.liquidity) : "—"),
  },
  { key: "total", label: "Gesamt", money: true, render: (r) => eur(r.total) },
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
  gameMode,
  leagueId,
}: {
  rows: ManagerTableRow[];
  gameMode: number | null;
  leagueId: string;
}) {
  const showMoney = gameMode === 2;
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
              <th key={c.key} data-sk={c.key} onClick={() => clickSort(c.key)}>
                {c.label}
                {arrow(c.key)}
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
              {cols.map((c) => (
                <td
                  key={c.key}
                  className="num"
                  style={c.highlight ? { fontWeight: 600, color: "var(--signal)" } : undefined}
                >
                  {c.render(r)}
                </td>
              ))}
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
