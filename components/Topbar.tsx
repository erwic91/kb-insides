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
  // Liga in Navigationslinks mitführen (außer Dashboard bleibt Einstieg).
  const withLeague = (href: string) =>
    league && href !== "/" ? `${href}?league=${encodeURIComponent(league)}` : href;

  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-dot" />
        Ligamonitor
      </Link>
      <nav className="nav">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={withLeague(n.href)} className={active ? "active" : ""}>
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="topbar-spacer" />
      <LeagueSwitch leagues={leagues} defaultId={league ?? undefined} />
    </header>
  );
}
