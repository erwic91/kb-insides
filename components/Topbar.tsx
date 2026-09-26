"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LeagueLite } from "../lib/db/queries";
import LeagueSwitch from "./LeagueSwitch";

/** Icons (24er Raster, Strich) für die mobile Tab-Bar. */
const I = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
      <rect x="13.5" y="11" width="7.5" height="10" rx="1.5" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
    </>
  ),
  liga: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.6M17 6h2.5a2.5 2.5 0 0 1-2.6 3.6" />
      <path d="M12 14v3.5M8.5 21h7M9.5 17.5h5" />
    </>
  ),
  markt: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12l5.5-5.5" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
    </>
  ),
  news: (
    <>
      <path d="M5 4h11v16H6.5A1.5 1.5 0 0 1 5 18.5V4Z" />
      <path d="M16 8h3v10.5a1.5 1.5 0 0 1-3 0" />
      <path d="M8 8h5M8 11.5h5M8 15h3" />
    </>
  ),
};

const NAV: { href: string; label: string; short: string; icon: ReactNode }[] = [
  { href: "/", label: "Dashboard", short: "Dashboard", icon: I.dashboard },
  { href: "/liga", label: "Liga", short: "Liga", icon: I.liga },
  { href: "/markt", label: "Marktradar", short: "Markt", icon: I.markt },
  { href: "/analytics", label: "Analytics", short: "Analytics", icon: I.analytics },
  { href: "/news", label: "News", short: "News", icon: I.news },
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
  const router = useRouter();
  // Ohne Param dieselbe Liga wie die Seite (resolveLeague): sonst markiert der
  // Switch eine andere Liga als die angezeigte.
  const league = params.get("league") ?? defaultLeagueId ?? null;
  const leagueName = leagues.find((l) => l.id === league)?.name ?? leagues[0]?.name ?? "Liga";
  // Liga in ALLEN Navigationslinks mitführen (inkl. Dashboard) — sonst fällt
  // „Dashboard" ohne Param auf die Default-Liga zurück statt die gewählte.
  const withLeague = (href: string) =>
    league ? `${href}?league=${encodeURIComponent(league)}` : href;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Desktop: Zahnrad-Dropdown (Verbindung & Admin).
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

  // Mobile: Bottom-Sheet „Liga & Einstellungen". Schließt bei Routenwechsel und
  // Esc; sperrt den Body-Scroll, solange offen.
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname, league]);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const switchLeague = (id: string) => {
    setSheetOpen(false);
    if (id === league) return;
    router.push(`/?league=${encodeURIComponent(id)}`);
    router.refresh();
  };

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
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href={withLeague("/")} className="brand">
            Liga<span>monitor</span>
          </Link>
          <nav className="nav">
            {NAV.map((n) => (
              <Link key={n.href} href={withLeague(n.href)} className={isActive(n.href) ? "on" : ""}>
                {n.label}
              </Link>
            ))}
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

          {/* Mobile: aktuelle Liga als Pill → öffnet das Sheet (Liga wechseln, Einstellungen). */}
          <button
            type="button"
            className="league-pill"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(true)}
          >
            <span className="league-pill-name">{leagueName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile: native-artige Tab-Bar unten (Safe-Area-bewusst). */}
      <nav className="tabbar" aria-label="Hauptnavigation">
        {NAV.map((n) => {
          const on = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={withLeague(n.href)}
              className={on ? "on" : ""}
              aria-current={on ? "page" : undefined}
            >
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth={on ? 2.1 : 1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {n.icon}
              </svg>
              <span>{n.short}</span>
            </Link>
          );
        })}
      </nav>

      {sheetOpen && (
        <div
          className="sheet-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Liga & Einstellungen">
            <div className="sheet-grabber" aria-hidden="true" />
            <div className="sheet-head">
              <span className="sheet-title">Liga wählen</span>
              <button type="button" className="sheet-done" onClick={() => setSheetOpen(false)}>
                Fertig
              </button>
            </div>
            <div className="sheet-list">
              {leagues.map((l) => {
                const on = l.id === league;
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`sheet-item ${on ? "on" : ""}`}
                    onClick={() => switchLeague(l.id)}
                  >
                    <span>{l.name}</span>
                    {on && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="sheet-sub">Einstellungen</div>
            <div className="sheet-list">
              <Link href={withLeague("/connect")} className="sheet-item" onClick={() => setSheetOpen(false)}>
                <span>Kickbase-Verbindung</span>
                <span className="sheet-chev">›</span>
              </Link>
              {isAdmin && (
                <Link href="/admin" className="sheet-item" onClick={() => setSheetOpen(false)}>
                  <span>Admin</span>
                  <span className="sheet-chev">›</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
