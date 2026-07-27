import { eur } from "../lib/format";

/**
 * Schlichtes, eigenständiges SVG-Liniendiagramm (keine externen Libs, kein
 * Tooltip). Zeichnet den Marktwertverlauf als dünne Linie in `--signal` auf
 * einer festen viewBox (600×height), skaliert responsiv auf 100 % Breite.
 */
export default function LineChart({
  points,
  height = 160,
}: {
  points: { date: string; mv: number }[];
  height?: number;
}) {
  const W = 600;
  const H = height;
  const PAD = 8;

  const values = points.map((p) => p.mv);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = points.length;

  const x = (i: number) => PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.mv).toFixed(1)}`)
    .join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label="Marktwertverlauf"
        style={{ display: "block" }}
      >
        {/* dezente Grundlinie */}
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          stroke="var(--line)"
          strokeWidth={1}
        />
        <line
          x1={PAD}
          y1={PAD}
          x2={PAD}
          y2={H - PAD}
          stroke="var(--line)"
          strokeWidth={1}
        />
        <path d={d} fill="none" stroke="var(--signal)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "0.35rem",
        }}
      >
        <span className="num" style={{ color: "var(--mute)" }}>
          Tief {eur(min)}
        </span>
        <span className="num" style={{ color: "var(--mute)" }}>
          Hoch {eur(max)}
        </span>
      </div>
    </div>
  );
}
