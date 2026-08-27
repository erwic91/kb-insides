import type { MySquadPlayer } from "../lib/db/queries";

/**
 * Mini-Fußballfeld: zeigt die aktuelle Startelf eines Managers (Spieler mit
 * gesetzter lineup_order). Reihen nach Position (TW unten → Angriff oben),
 * Spieler je Reihe nach lineup_order sortiert. Reine Darstellung (kein State).
 */

const LINE_ORDER = ["ANG", "MF", "ABW", "TW"]; // von oben (Angriff) nach unten (Tor)
const LINE_LABEL: Record<string, string> = { TW: "TW", ABW: "ABW", MF: "MF", ANG: "ANG" };

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? name;
  return last.length > 11 ? `${last.slice(0, 10)}…` : last;
}

export default function LineupPitch({ rows }: { rows: MySquadPlayer[] }) {
  const eleven = rows
    .filter((p) => p.lineupOrder != null)
    .sort((a, b) => (a.lineupOrder ?? 0) - (b.lineupOrder ?? 0));
  if (eleven.length === 0) return null;

  // Nach Positionsreihe gruppieren.
  const byLine = new Map<string, MySquadPlayer[]>();
  for (const p of eleven) {
    const line = (p.position ?? "MF").toUpperCase();
    const key = LINE_ORDER.includes(line) ? line : "MF";
    const arr = byLine.get(key) ?? [];
    arr.push(p);
    byLine.set(key, arr);
  }
  const lines = LINE_ORDER.filter((l) => (byLine.get(l)?.length ?? 0) > 0);

  const W = 320;
  const H = 400;
  const padY = 34;
  const rowGap = (H - 2 * padY) / Math.max(1, lines.length - 1 || 1);

  return (
    <div className="pitch-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img" aria-label="Aufstellung" className="pitch-svg">
        {/* Rasen + Linien */}
        <rect x="0" y="0" width={W} height={H} rx="10" fill="var(--pitch-grass)" />
        <rect x="8" y="8" width={W - 16} height={H - 16} rx="6" fill="none" stroke="var(--pitch-line)" strokeWidth="1.5" />
        <line x1="8" y1={H / 2} x2={W - 8} y2={H / 2} stroke="var(--pitch-line)" strokeWidth="1.5" />
        <circle cx={W / 2} cy={H / 2} r="34" fill="none" stroke="var(--pitch-line)" strokeWidth="1.5" />
        {/* Strafräume oben/unten */}
        <rect x={W / 2 - 55} y="8" width="110" height="52" fill="none" stroke="var(--pitch-line)" strokeWidth="1.5" />
        <rect x={W / 2 - 55} y={H - 60} width="110" height="52" fill="none" stroke="var(--pitch-line)" strokeWidth="1.5" />

        {lines.map((line, li) => {
          const players = byLine.get(line) ?? [];
          const y = padY + li * rowGap;
          const step = W / (players.length + 1);
          return players.map((p, i) => {
            const x = step * (i + 1);
            const injured = p.status != null && p.status > 0;
            return (
              <g key={p.playerId}>
                <circle
                  cx={x}
                  cy={y}
                  r="12"
                  fill="var(--pitch-jersey)"
                  stroke={injured ? "var(--warn)" : "var(--pitch-jersey-line)"}
                  strokeWidth={injured ? 2.5 : 1.5}
                />
                <text x={x} y={y + 26} textAnchor="middle" className="pitch-name">
                  {shortName(p.name)}
                </text>
              </g>
            );
          });
        })}
      </svg>
      <div className="pitch-legend">
        Aufstellung · {eleven.length} Spieler ·{" "}
        {lines
          .slice()
          .reverse()
          .map((l) => `${byLine.get(l)?.length ?? 0} ${LINE_LABEL[l]}`)
          .join(" – ")}
      </div>
    </div>
  );
}
