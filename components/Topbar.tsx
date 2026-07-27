"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LeagueLite } from "../lib/db/queries";
import LeagueSwitch from "./LeagueSwitch";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/liga", label: "Liga" },
  { href: "/markt", label: "Marktradar" },
];

export default function Topbar({
  leagues,
}: {
  leagues: Pick<LeagueLite, "id" | "name">[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const league = params.get("league");
  // Liga in Navigationslinks mitführen (Dashboard bleibt der Einstieg).
  const withLeague = (href: string) =>
    league && href !== "/" ? `${href}?league=${encodeURIComponent(league)}` : href;

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
      </div>
    </header>
  );
}
