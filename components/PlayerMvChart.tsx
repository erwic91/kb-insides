"use client";

import { useState } from "react";
import LineChart from "./LineChart";
import { eur } from "../lib/format";

type Frame = { key: string; label: string; days: number | null };
const FRAMES: Frame[] = [
  { key: "7", label: "7T", days: 7 },
  { key: "30", label: "1M", days: 30 },
  { key: "90", label: "3M", days: 90 },
  { key: "180", label: "6M", days: 180 },
  { key: "365", label: "1J", days: 365 },
];

/**
 * Marktwertverlauf mit Zeitfenster-Umschaltung (7T/1M/3M/6M/1J). Schneidet die
 * volle Tageskurve clientseitig auf das gewählte Fenster zu und zeichnet sie mit
 * dem bestehenden LineChart. Höchst-/Tiefstwert beziehen sich aufs Fenster.
 */
export default function PlayerMvChart({ curve }: { curve: { date: string; mv: number }[] }) {
  const [frame, setFrame] = useState<Frame>(FRAMES[1]!); // Default 1M
  if (curve.length < 2) {
    return (
      <p className="note">
        Die Marktwert-Kurve wird noch aufgebaut — sobald genügend Datenpunkte vorliegen,
        erscheint hier der Verlauf.
      </p>
    );
  }

  const lastMs = Date.parse(curve[curve.length - 1]!.date);
  const cutoff = frame.days != null ? lastMs - frame.days * 86_400_000 : -Infinity;
  const sliced = curve.filter((p) => Date.parse(p.date) >= cutoff);
  const points = sliced.length >= 2 ? sliced : curve.slice(-2);

  const values = points.map((p) => p.mv);
  const hi = Math.max(...values);
  const lo = Math.min(...values);

  return (
    <div>
      <div className="mv-frames">
        {FRAMES.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`mv-frame ${f.key === frame.key ? "on" : ""}`}
            onClick={() => setFrame(f)}
          >
            {f.label}
          </button>
        ))}
        <span className="mv-hilo">
          ▲ {eur(hi)} · ▼ {eur(lo)}
        </span>
      </div>
      <LineChart points={points} />
    </div>
  );
}
