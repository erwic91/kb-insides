"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarketListing } from "../lib/db/queries";
import { eur, eurFull, date } from "../lib/format";

const FAV_KEY = "kbinsides:favorites";

function useFavorites(): [Set<string>, (id: string) => void] {
  const [favs, setFavs] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavs(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  return [favs, toggle];
}

/** Preis vs. Marktwert in Prozent (Overpay-Indikator). */
function priceVsMv(price: number | null, mv: number | null): { text: string; cls: string } {
  if (price == null || mv == null || mv === 0) return { text: "—", cls: "muted" };
  const diff = (price - mv) / mv;
  const sign = diff > 0 ? "+" : "";
  const cls = diff > 0.02 ? "neg" : diff < -0.02 ? "pos" : "muted";
  return { text: `${sign}${(diff * 100).toFixed(0)} %`, cls };
}

export default function MarketRadar({
  listings,
  leagueId,
}: {
  listings: MarketListing[];
  leagueId: string;
}) {
  const [favs, toggle] = useFavorites();
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [cadence, setCadence] = useState(14);

  const rows = onlyFavs ? listings.filter((l) => favs.has(l.playerId)) : listings;

  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onlyFavs}
              onChange={(e) => setOnlyFavs(e.target.checked)}
            />
            Nur Favoriten ({favs.size})
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 220 }}>
            <span className="muted">Kadenz</span>
            <input
              type="range"
              min={3}
              max={30}
              value={cadence}
              onChange={(e) => setCadence(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ width: 54, textAlign: "right" }}>{cadence} Tage</span>
          </div>
        </div>
        <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
          „Jetzt am Markt" ist exakt. Die Rückkehr-Prognose (letztes Listing + Kadenz)
          schärft sich, je länger <code>market_log</code> gesammelt wird.
        </p>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="l" style={{ width: 34 }} />
              <th className="l">Spieler</th>
              <th className="l">Pos</th>
              <th>Marktwert</th>
              <th>Preis</th>
              <th>vs. MV</th>
              <th className="l">Anbieter</th>
              <th className="l">Läuft ab</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const cmp = priceVsMv(l.price, l.marketValue);
              const isFav = favs.has(l.playerId);
              return (
                <tr key={l.playerId}>
                  <td className="l">
                    <button
                      onClick={() => toggle(l.playerId)}
                      title={isFav ? "Favorit entfernen" : "Als Favorit merken"}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 16,
                        color: isFav ? "var(--warn)" : "var(--mute)",
                      }}
                    >
                      {isFav ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="l">
                    <Link href={`/player/${l.playerId}?league=${encodeURIComponent(leagueId)}`}>
                      {l.playerName}
                    </Link>
                  </td>
                  <td className="l muted">{l.position ?? "—"}</td>
                  <td title={eurFull(l.marketValue)}>{eur(l.marketValue)}</td>
                  <td title={eurFull(l.price)}>{eur(l.price)}</td>
                  <td className={cmp.cls}>{cmp.text}</td>
                  <td className="l">{l.offeredByName ?? "Kickbase"}</td>
                  <td className="l muted">{date(l.expiry)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="l muted" style={{ padding: 24 }}>
                  {onlyFavs
                    ? "Keine Favoriten am Markt."
                    : "Aktuell niemand am Markt (oder Collector noch nicht gelaufen)."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
