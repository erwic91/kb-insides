"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarketListing } from "../lib/db/queries";
import { eur, date } from "../lib/format";

const FAV_KEY = "kbinsides:favorites";

/**
 * Kompaktes „Marktradar · deine Favoriten"-Panel fürs Dashboard. Liest die
 * Favoriten aus localStorage (gleicher Schlüssel wie der Marktradar) und zeigt,
 * welche davon gerade am Markt sind. Rein clientseitig — die Marktangebote
 * kommen serverseitig als Prop.
 */
export default function DashboardFavorites({
  listings,
  leagueId,
}: {
  listings: MarketListing[];
  leagueId: string;
}) {
  const [favs, setFavs] = useState<Set<string> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      setFavs(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setFavs(new Set());
    }
  }, []);

  const href = (base: string) => `${base}?league=${encodeURIComponent(leagueId)}`;

  // Vor dem ersten Client-Render nichts zeigen (SSR-Mismatch vermeiden).
  if (favs === null) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Marktradar · deine Favoriten</h3>
          <Link href={href("/markt")} className="more">
            alle →
          </Link>
        </div>
        <div className="mrow muted">lädt …</div>
      </div>
    );
  }

  const favListings = listings.filter((l) => favs.has(l.playerId));

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Marktradar · deine Favoriten</h3>
        <Link href={href("/markt")} className="more">
          alle →
        </Link>
      </div>
      <div>
        {favListings.length > 0 ? (
          favListings.map((l) => (
            <div className="mrow" key={l.playerId}>
              <span>
                <span className="pos-chip">{l.position ?? "—"}</span>
                <Link href={href(`/player/${l.playerId}`)} className="nm linklike">
                  {l.playerName}
                </Link>
              </span>
              <span
                className="pill"
                style={{ background: "rgba(255,70,0,.12)", color: "var(--signal)" }}
              >
                jetzt · {date(l.expiry)}
              </span>
            </div>
          ))
        ) : (
          <div className="mrow muted">
            {favs.size === 0
              ? "Noch keine Favoriten — im Marktradar Spieler mit ★ merken."
              : `${favs.size} Favorit(en) gemerkt, aktuell keiner am Markt.`}
          </div>
        )}
      </div>
    </div>
  );
}
