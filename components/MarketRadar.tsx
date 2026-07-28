"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarketListing } from "../lib/db/queries";
import type { BidAdvice } from "../lib/compute/bidadvisor";
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

/** Bid-Advisor-Zelle: „so hoch musst du bieten" je Angebot. */
function bidTip(a: BidAdvice | undefined): { text: string; cls: string; title?: string } {
  if (!a || a.verdict === "unknown") return { text: "—", cls: "muted" };
  switch (a.verdict) {
    case "free":
      return { text: "freie Bahn", cls: "up", title: "Kein Gegner kann über dem Mindestpreis mitbieten." };
    case "winnable":
      return {
        text: `≥ ${eur(a.mustBid)}`,
        cls: "linklike",
        title: `Stärkster Gegner: ${a.topRivalName} bis ${eur(a.topRivalMaxBid)}. Biete mehr, um sicher zu gewinnen.`,
      };
    case "contested":
      return {
        text: `${a.topRivalName} bis ${eur(a.topRivalMaxBid)}`,
        cls: "down",
        title: "Dieser Gegner kann dich überbieten.",
      };
    case "tooExpensive":
      return { text: "über deinem Limit", cls: "muted" };
    default:
      return { text: "—", cls: "muted" };
  }
}

export default function MarketRadar({
  listings,
  advice,
  showBids,
  leagueId,
}: {
  listings: MarketListing[];
  advice: Record<string, BidAdvice>;
  showBids: boolean;
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
          „Jetzt am Markt" ist exakt.{" "}
          {showBids
            ? "Gebots-Tipp = höchstes konkurrierendes Maximalgebot (aus der Kontorekonstruktion). Freie Bahn heißt: dir kann keiner gefährlich werden."
            : "Der Gebots-Tipp erscheint, sobald Start-Budget/Reset gesetzt sind (dann sind die Max-Gebote belastbar)."}
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
              {showBids && <th className="l">Gebots-Tipp</th>}
              <th className="l">Anbieter</th>
              <th className="l">Läuft ab</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const cmp = priceVsMv(l.price, l.marketValue);
              const isFav = favs.has(l.playerId);
              const tip = showBids ? bidTip(advice[l.playerId]) : null;
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
                  {tip && (
                    <td className={`l ${tip.cls}`} title={tip.title}>
                      {tip.text}
                    </td>
                  )}
                  <td className="l">{l.offeredByName ?? "Kickbase"}</td>
                  <td className="l muted">{date(l.expiry)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showBids ? 9 : 8} className="l muted" style={{ padding: 24 }}>
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
