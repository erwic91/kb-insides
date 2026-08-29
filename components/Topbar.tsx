"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { LeagueLite } from "../lib/db/queries";
import LeagueSwitch from "./LeagueSwitch";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/liga", label: "Liga" },
  { href: "/markt", label: "Marktradar" },
  { href: "/analytics", label: "Analytics" },
  { href: "/news", label: "News" },
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
  // Liga in ALLEN Navigationslinks mitführen (inkl. Dashboard) — sonst fällt
  // „Dashboard" ohne Param auf die Default-Liga zurück statt die gewählte.
  const withLeague = (href: string) =>
    league ? `${href}?league=${encodeURIComponent(league)}` : href;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

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
        </nav>
        <div className="topbar-spacer" />
        <div className="lswitch">
          <span className="lbl">Liga</span>
          <LeagueSwitch leagues={leagues} defaultId={league ?? undefined} />
        </div>
        <div className="topbar-menu" ref={menuRef}>
          <button
            type="button"
            className={`topbar-gear ${menuOpen ? "on" : ""}`}
            aria-label="Einstellungen"
            title="Verbindung & Admin"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {menuOpen && (
            <div className="topbar-dropdown">
              <Link
                href={withLeague("/connect")}
                className={pathname.startsWith("/connect") ? "on" : ""}
                onClick={() => setMenuOpen(false)}
              >
                Verbindung
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={pathname.startsWith("/admin") ? "on" : ""}
                  onClick={() => setMenuOpen(false)}
                >
                  Admin
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
