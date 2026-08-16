"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LeagueLite } from "../lib/db/queries";
import LeagueSwitch from "./LeagueSwitch";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/liga", label: "Liga" },
  { href: "/markt", label: "Marktradar" },
  { href: "/news", label: "News" },
  { href: "/connect", label: "Verbindung" },
];

export default function Topbar({
  leagues,
  defaultLeagueId,
  isAdmin = false,
}: {
  leagues: Pick<LeagueLite, "id" | "name">[];
  /** Liga, die die Seite ohne ?league-Param anzeigt (= resolveLeague-Default). */
  defaultLeagueId?: string | null;
  /** Zeigt den Admin-Link (nur für Admin-Accounts). */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  // Ohne Param dieselbe Liga wie die Seite (resolveLeague): sonst markiert der
  // Switch eine andere Liga als die angezeigte.
  const league = params.get("league") ?? defaultLeagueId ?? null;
  // Liga in Navigationslinks mitführen (Dashboard bleibt der Einstieg).
  const withLeague = (href: string) =>
    league && href !== "/" ? `${href}?league=${encodeURIComponent(league)}` : href;

  // Ohne zugängliche Liga (nicht angemeldet / noch nicht verbunden) nur die Marke
  // zeigen — Login-/Verbinden-Seiten brauchen keine Liga-Navigation.
  if (leagues.length === 0) {
    return (
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="brand">
            Liga<span>monitor</span>
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          Liga<span>monitor</span>
        </Link>
        <nav className="nav">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={withLeague(n.href)} className={active ? "on" : ""}>
                {n.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link href="/admin" className={pathname.startsWith("/admin") ? "on" : ""}>
              Admin
            </Link>
          )}
        </nav>
        <div className="topbar-spacer" />
        <div className="lswitch">
          <span className="lbl">Liga</span>
          <LeagueSwitch leagues={leagues} defaultId={league ?? undefined} />
        </div>
      </div>
    </header>
  );
}
