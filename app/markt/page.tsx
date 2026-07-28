import { resolveLeague, getBidAdvisor } from "../../lib/db/queries";
import MarketRadar from "../../components/MarketRadar";

export const dynamic = "force-dynamic";

export default async function MarktPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league: requested } = await searchParams;
  const league = await resolveLeague(requested);

  if (!league) {
    return (
      <main className="wrap">
        <div className="empty">
          <h3>Keine Liga aktiv</h3>
          <p>
            Collector einmal laufen lassen (über „Aktualisieren" auf dem Dashboard).
          </p>
        </div>
      </main>
    );
  }

  const { listings, advice } = await getBidAdvisor(league);
  // Gebotsberatung ist nur belastbar, wenn Max-Gebote vorliegen (Start-Budget
  // gesetzt / nach dem Reset).
  const showBids = league.startBudget > 0;
  // Map ist nicht serialisierbar → als Objekt an die Client-Komponente.
  const adviceObj = Object.fromEntries(advice);

  return (
    <main className="wrap">
      <div className="crumb">{league.name} · Marktradar</div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Transfermarkt</span>
          <h1>Marktradar</h1>
          <p className="sub">
            {league.name} · {listings.length} Spieler am Markt
          </p>
        </div>
      </div>
      <MarketRadar
        listings={listings}
        advice={adviceObj}
        showBids={showBids}
        leagueId={league.id}
      />
    </main>
  );
}
