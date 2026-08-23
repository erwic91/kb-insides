import { resolveLeague, getPlayerCard } from "../../../../lib/db/queries";
import PlayerModalShell from "../../../../components/PlayerModalShell";
import PlayerCard from "../../../../components/PlayerCard";

export const dynamic = "force-dynamic";

/**
 * Intercepting Route: Klicks auf /player/[id] innerhalb der App öffnen die
 * Spielerkarte als Overlay. Direktaufruf/Reload zeigt weiterhin die volle Seite
 * (app/player/[id]/page.tsx).
 */
export default async function PlayerModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const { id } = await params;
  const { league: requested } = await searchParams;
  const league = await resolveLeague(requested);
  const data = league ? await getPlayerCard(league, id) : null;

  return (
    <PlayerModalShell>
      {league && data ? (
        <PlayerCard data={data} leagueId={league.id} />
      ) : (
        <div className="pc">
          <p className="note">
            {league ? "Für diesen Spieler liegen noch keine Daten vor." : "Keine Liga aktiv."}
          </p>
        </div>
      )}
    </PlayerModalShell>
  );
}
