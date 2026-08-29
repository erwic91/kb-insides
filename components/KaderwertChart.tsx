"use client";

import { useMemo, useState } from "react";
import type { ManagerSeries, ManagerSeriesPoint } from "../lib/db/queries";

type Metric = "teamValue" | "cash" | "total" | "points";
const METRICS: { key: Metric; label: string; money: boolean }[] = [
  { key: "teamValue", label: "Kaderwert", money: true },
  { key: "total", label: "Gesamtwert", money: true },
  { key: "cash", label: "Kontostand", money: true },
  { key: "points", label: "Punkte", money: false },
];

const PALETTE = ["#ff4600", "#2f6fed", "#0f7a5a", "#c0143a", "#8b5cf6", "#e0a100", "#0891b2", "#db2777"];

function valOf(p: ManagerSeriesPoint, m: Metric): number | null {
  if (m === "total") return p.teamValue != null && p.cash != null ? p.teamValue + p.cash : null;
  return p[m];
}
const fmt = (v: number, money: boolean) =>
  money ? `${(v / 1e6).toFixed(1).replace(".", ",")} Mio` : String(Math.round(v));

/**
 * Verlaufs-Liniendiagramm: eine Linie je Manager. Umschaltbar zwischen
 * Kaderwert / Gesamtwert / Konto / Punkte. Alle Linien liegen dezent grau im
 * Hintergrund; angeklickte Manager bekommen ihre Farbe (max. 8). Y-Achse startet
 * nicht bei 0, damit die täglichen Bewegungen sichtbar sind.
 */
export default function KaderwertChart({ data }: { data: ManagerSeries }) {
  const [metric, setMetric] = useState<Metric>("teamValue");
  const own = data.managers.find((m) => m.isMe)?.id;
  const [sel, setSel] = useState<Set<string>>(new Set(own ? [own] : []));
  const money = METRICS.find((m) => m.key === metric)!.money;

  const geo = useMemo(() => {
    let tMin = Infinity;
    let tMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const m of data.managers) {
      for (const p of data.byManager[m.id] ?? []) {
        const v = valOf(p, metric);
        if (v == null) continue;
        const t = Date.parse(p.date);
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }
    return { tMin, tMax, vMin, vMax };
  }, [data, metric]);

  const W = 900;
  const H = 340;
  const PL = 8;
  const PR = 8;
  const PT = 10;
  const PB = 22;
  const spanT = geo.tMax - geo.tMin || 1;
  const pad = (geo.vMax - geo.vMin) * 0.08 || 1;
  const lo = geo.vMin - pad;
  const hi = geo.vMax + pad;
  const spanV = hi - lo || 1;
  const x = (t: number) => PL + ((t - geo.tMin) / spanT) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - lo) / spanV) * (H - PT - PB);

  const pathFor = (id: string) => {
    const pts = (data.byManager[id] ?? [])
      .map((p) => ({ t: Date.parse(p.date), v: valOf(p, metric) }))
      .filter((p) => p.v != null) as { t: number; v: number }[];
    if (pts.length === 0) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  };

  const colorFor = (id: string) => {
    const arr = [...sel];
    const idx = arr.indexOf(id);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : null;
  };
  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 8) next.add(id);
      return next;
    });

  const enoughData = Number.isFinite(geo.tMin) && geo.tMax > geo.tMin;

  return (
    <div>
      <div className="mv-frames" style={{ margin: "0 0 10px" }}>
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`mv-frame ${m.key === metric ? "on" : ""}`}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {!enoughData ? (
        <p className="note">
          Noch zu wenig Verlaufsdaten — die Kurven bauen sich mit den nächtlichen Snapshots auf
          (mind. zwei Tage nötig).
        </p>
      ) : (
        <>
          <div className="chart-scroll">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Verlauf">
              <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--line)" strokeWidth={1} />
              {/* unselektierte grau */}
              {data.managers.filter((m) => !sel.has(m.id)).map((m) => (
                <path key={m.id} d={pathFor(m.id)} fill="none" stroke="var(--line)" strokeWidth={1.2} opacity={0.7} />
              ))}
              {/* selektierte farbig oben drauf */}
              {data.managers.filter((m) => sel.has(m.id)).map((m) => (
                <path key={m.id} d={pathFor(m.id)} fill="none" stroke={colorFor(m.id)!} strokeWidth={2.2} strokeLinejoin="round" />
              ))}
            </svg>
          </div>
          <div className="chart-axis">
            <span>{new Date(geo.tMin).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
            <span className="muted">{fmt(lo, money)} – {fmt(hi, money)}</span>
            <span>{new Date(geo.tMax).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
          </div>

          <div className="chart-legend">
            {data.managers.map((m) => {
              const c = colorFor(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`legend-chip ${c ? "on" : ""}`}
                  onClick={() => toggle(m.id)}
                  style={c ? { borderColor: c, color: c } : undefined}
                >
                  <span className="legend-dot" style={{ background: c ?? "var(--mute)" }} />
                  {m.name}
                  {m.isMe ? " (du)" : ""}
                </button>
              );
            })}
          </div>
          <p className="note" style={{ marginTop: 6, color: "var(--mute)" }}>
            Manager anklicken, um seine Linie einzufärben (max. 8). Y-Achse startet nicht bei 0.
          </p>
        </>
      )}
    </div>
  );
}
