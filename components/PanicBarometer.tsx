"use client";

import { useState } from "react";
import Link from "next/link";
import type { PanicBarometer as PanicData, PanicPoint } from "../lib/db/queries";
import { eurFull } from "../lib/format";

/** Stimmungsband aus dem Panik-Score (0..1). */
function mood(score: number): { label: string; color: string } {
  if (score >= 0.75) return { label: "Panik", color: "var(--loss)" };
  if (score >= 0.5) return { label: "Überhitzt", color: "#d1560b" };
  if (score >= 0.25) return { label: "Erhöht", color: "var(--warn)" };
  return { label: "Ruhig", color: "var(--gain)" };
}

const fmtPct1 = (x: number) =>
  `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")} %`;

/**
 * Simple Panik-Verlauf-Sparkline aus den rollierenden Tages-Overpay-Anteilen.
 * Skaliert auf min..max der vorhandenen Punkte; Nulllinie (0 % Overpay) dezent
 * markiert. Rendert nichts bei < 2 Datenpunkten.
 */
function PanicSparkline({ series }: { series: PanicPoint[] }) {
  const pts = series.filter((p): p is { date: string; ratio: number } => p.ratio != null);
  if (pts.length < 2) return null;

  const W = 260;
  const H = 40;
  const PAD = 3;
  const vals = pts.map((p) => p.ratio);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.ratio).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD).toFixed(1)} Z`;
  const zeroY = y(0);
  const last = pts[pts.length - 1]!;
  const lastColor = last.ratio > 0 ? "var(--loss)" : "var(--gain)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Panik-Verlauf">
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="var(--line)" strokeWidth={1} strokeDasharray="3 3" />
      <path d={area} fill="var(--signal)" opacity={0.1} />
      <path d={line} fill="none" stroke="var(--signal)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(last.ratio)} r={2.6} fill={lastColor} />
    </svg>
  );
}

/**
 * Panik-Barometer: Tacho für die Overpay-Stimmung der Liga. Grün = ruhig,
 * Rot = überhitzt/panisch. Über 1/3/7-Tage-Fenster umschaltbar (Daten für alle
 * Fenster kommen vorberechnet vom Server, Umschalten ohne Roundtrip).
 */
export default function PanicBarometer({
  set,
  series,
  windows,
  leagueId,
}: {
  set: Record<number, PanicData>;
  series: PanicPoint[];
  windows: number[];
  leagueId: string;
}) {
  const [win, setWin] = useState<number>(windows[windows.length - 1] ?? 7);
  const data = set[win] ?? { ratio: null, score: 0, count: 0, windowDays: win, avgOverpay: null, topBuys: [] };

  const href = (b: string) => `${b}?league=${encodeURIComponent(leagueId)}`;
  const enough = data.count >= 3 && data.ratio != null;
  const m = mood(data.score);
  const markerLeft = `${Math.max(0, Math.min(100, data.score * 100)).toFixed(1)}%`;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Panik-Barometer</h3>
        <div className="mv-frames" style={{ margin: 0 }}>
          {windows.map((w) => (
            <button
              key={w}
              type="button"
              className={`mv-frame ${w === win ? "on" : ""}`}
              onClick={() => setWin(w)}
            >
              {w} T
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          letzte {data.windowDays} {data.windowDays === 1 ? "Tag" : "Tage"} · {data.count} Käufe
        </div>
        {!enough ? (
          <div className="notice">
            Noch zu wenig Transferdaten mit Marktwert-Basis in diesem Fenster. Wähle ein größeres
            Zeitfenster oder warte, bis mehr Käufe erfasst sind (vor allem ab Saisonstart).
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <span
                style={{
                  fontFamily: "var(--display)",
                  fontVariationSettings: '"wght" 800',
                  fontWeight: 800,
                  fontSize: 22,
                  textTransform: "uppercase",
                  color: m.color,
                }}
              >
                {m.label}
              </span>
              <span className="num" style={{ color: m.color, fontWeight: 600 }}>
                {fmtPct1(data.ratio!)}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>Ø über Marktwert (wertgewichtet)</span>
            </div>

            {/* Skala grün → rot mit Markierung */}
            <div
              style={{
                position: "relative",
                height: 14,
                borderRadius: 7,
                background: "linear-gradient(90deg, var(--gain) 0%, var(--warn) 50%, var(--loss) 100%)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -5,
                  bottom: -5,
                  left: `calc(${markerLeft} - 1.5px)`,
                  width: 3,
                  background: "var(--ink)",
                  borderRadius: 2,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: "var(--mono)",
                fontSize: 10.5,
                color: "var(--mute)",
                marginTop: 5,
              }}
            >
              <span>ruhig</span>
              <span>überhitzt</span>
              <span>Panik</span>
            </div>

            {data.avgOverpay != null && (
              <div className="note" style={{ marginTop: 10, color: "var(--mute)" }}>
                Ø {data.avgOverpay >= 0 ? "+" : "−"}
                {eurFull(Math.abs(data.avgOverpay))} Aufpreis je Kauf
              </div>
            )}

            {series.filter((p) => p.ratio != null).length >= 2 && (
              <div style={{ marginTop: 14 }}>
                <div className="eyebrow" style={{ fontSize: 10, marginBottom: 2 }}>
                  Panik-Verlauf · 14 Tage
                </div>
                <PanicSparkline series={series} />
              </div>
            )}

            {data.topBuys.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>
                  Größte Panikkäufe
                </div>
                {data.topBuys.map((b, i) => (
                  <div className="mrow" key={`${b.playerId}-${i}`}>
                    <span className="nm">
                      <Link href={href(`/player/${b.playerId}`)} className="linklike">
                        {b.playerName}
                      </Link>{" "}
                      <span className="muted">· {b.managerName}</span>
                    </span>
                    <span
                      className="num sm"
                      style={{ color: "var(--loss)" }}
                      title={`${eurFull(b.price)} gezahlt · Marktwert ${eurFull(b.mv)}`}
                    >
                      {fmtPct1(b.overpayPct)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
