import { resolveLeague, getMarket } from "../../lib/db/queries";
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
      <main className="page">
        <div className="empty">
          <h3>Keine Liga aktiv</h3>
          <p>Collector einmal laufen lassen (<code>/api/cron/collect</code>).</p>
        </div>
      </main>
    );
  }

  const listings = await getMarket(league);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Marktradar</h1>
        <p className="sub">
          {league.name} · {listings.length} Spieler am Markt
        </p>
      </div>
      <MarketRadar listings={listings} leagueId={league.id} />
    </main>
  );
}
