import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const { id } = await params;
  const { league } = await searchParams;
  const back = league ? `/?league=${encodeURIComponent(league)}` : "/";

  return (
    <main className="page">
      <div className="crumb">
        <Link href={back}>Dashboard</Link>
      </div>
      <div className="page-head">
        <h1>Spieler #{id}</h1>
        <p className="sub">Marktwertverlauf · Besitzhistorie · Overpay-Index</p>
      </div>
      <div className="notice">
        <strong>Kommt in M6.</strong> Die Spieler-Detailseite zeigt dann den
        Marktwertverlauf (7/14/Saison), die ligaweite Besitzhistorie mit Overpay und wie
        viele Manager den Spieler halten. Grundlage sind <code>player_mv</code> und
        <code> market_log</code>.
      </div>
    </main>
  );
}
