"use client";

import { useState } from "react";
import { maxBid as calcMaxBid } from "../lib/compute/reconstruct";
import { eur } from "../lib/format";

/**
 * Kaufrechner mit Aufschlags-Regler: zeigt, was ein Kauf mit dem eigenen Konto
 * macht. Maßgeblich ist nicht der Kontostand danach, sondern die „Luft bis zur
 * Grenze" (Konto + Limit, Limit = Kaderwert ÷ 3) — sie darf nicht negativ
 * werden. Kommende Login-Boni bis zum Spieltag werden optional mitgerechnet
 * (vorsichtig: 100.000 €/Tag im konstanten Bereich).
 */
const WEEKDAYS = [
  { v: 5, label: "Freitag" },
  { v: 6, label: "Samstag" },
  { v: 2, label: "Dienstag" },
];

export default function Kaufrechner({ cash, teamValue }: { cash: number; teamValue: number }) {
  const [mvMio, setMvMio] = useState("10");
  const [markup, setMarkup] = useState(0);
  const [withBonus, setWithBonus] = useState(true);
  const [matchday, setMatchday] = useState(5);

  const mv = Math.max(0, Number(mvMio.replace(",", ".")) * 1e6 || 0);
  const price = Math.round(mv * (1 + markup / 100));
  const today = new Date().getDay();
  const daysToMatchday = (matchday - today + 7) % 7;
  const bonus = withBonus ? daysToMatchday * 100_000 : 0;
  const cashAfter = cash - price + bonus;
  const tvAfter = teamValue + mv;
  const limitAfter = tvAfter / 3;
  const luft = cashAfter + limitAfter; // muss ≥ 0 bleiben
  const maxBidAfter = calcMaxBid(cashAfter, tvAfter);
  const affordable = luft >= 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Kaufrechner</h3>
        <span className="count">{affordable ? "machbar" : "zu teuer"}</span>
      </div>
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>Marktwert Zielspieler (Mio €)</span>
            <input
              type="number"
              value={mvMio}
              min={0}
              step={0.5}
              onChange={(e) => setMvMio(e.target.value)}
              className="kr-input"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, flex: 1, minWidth: 180 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>Aufschlag Kauf: {markup} %</span>
            <input type="range" min={0} max={50} value={markup} onChange={(e) => setMarkup(Number(e.target.value))} />
          </label>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
          <input type="checkbox" checked={withBonus} onChange={(e) => setWithBonus(e.target.checked)} />
          Kommende Login-Boni bis Spieltag mitrechnen
          <select value={matchday} onChange={(e) => setMatchday(Number(e.target.value))} className="kr-input" style={{ marginLeft: 4 }}>
            {WEEKDAYS.map((w) => (
              <option key={w.v} value={w.v}>{w.label}</option>
            ))}
          </select>
          {withBonus && (
            <span className="muted">
              ({daysToMatchday} {daysToMatchday === 1 ? "Tag" : "Tage"} · +{eur(bonus)})
            </span>
          )}
        </label>

        <div className="kr-grid">
          <div className="kr-tile">
            <div className="kr-lbl">Kaufpreis</div>
            <div className="kr-val">{eur(price)}</div>
          </div>
          <div className="kr-tile">
            <div className="kr-lbl">Konto danach</div>
            <div className="kr-val" style={{ color: cashAfter < 0 ? "var(--loss)" : undefined }}>{eur(cashAfter)}</div>
          </div>
          <div className="kr-tile">
            <div className="kr-lbl">Max-Gebot danach</div>
            <div className="kr-val">{eur(maxBidAfter)}</div>
          </div>
          <div className="kr-tile">
            <div className="kr-lbl">Luft bis Grenze</div>
            <div className="kr-val" style={{ color: affordable ? "var(--gain)" : "var(--loss)", fontWeight: 600 }}>
              {eur(luft)}
            </div>
          </div>
        </div>
        <p className="note" style={{ color: "var(--mute)" }}>
          „Luft bis Grenze" = Konto + Kaderwert ÷ 3 (das erlaubte Minus). Ein gekaufter Spieler zählt
          zum Kaderwert und hebt die Grenze — negativ = nicht machbar ohne vorherigen Verkauf.
        </p>
      </div>
    </div>
  );
}
