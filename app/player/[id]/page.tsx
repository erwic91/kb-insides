import Link from "next/link";
import { resolveLeague, getPlayerCard } from "../../../lib/db/queries";
import PlayerCard from "../../../components/PlayerCard";

export const dynamic = "force-dynamic";

function leagueHref(base: string, leagueId: string): string {
  return `${base}?league=${encodeURIComponent(leagueId)}`;
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const { id } = await params;
  const { league: requested } = await searchParams;
  const league = await resolveLeague(requested);

  if (!league) {
    return (
      <main className="wrap">
        <div className="empty">
          <h3>Keine Liga aktiv</h3>
          <p>
            <Link href="/">Zurück zum Dashboard</Link>
          </p>
        </div>
      </main>
    );
  }

  const data = await getPlayerCard(league, id);

  if (!data) {
    return (
      <main className="wrap">
        <div className="empty">
          <h3>Spieler nicht gefunden</h3>
          <p>
            Für #{id} liegen in {league.name} noch keine Daten vor.{" "}
            <Link href={leagueHref("/markt", league.id)}>Zum Marktradar</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <div className="crumb">
        <Link href={leagueHref("/", league.id)}>Dashboard</Link> ·{" "}
        <Link href={leagueHref("/markt", league.id)}>Marktradar</Link>
      </div>
      <div className="card card-pad" style={{ marginTop: 12 }}>
        <PlayerCard data={data} leagueId={league.id} />
      </div>
    </main>
  );
}
