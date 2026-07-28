import Link from "next/link";
import { resolveLeague, getManagerTable, getTopPlayers } from "../../lib/db/queries";
import { eur, eurFull, num } from "../../lib/format";

export const dynamic = "force-dynamic";

function leagueHref(base: string, leagueId: string): string {
  return `${base}?league=${encodeURIComponent(leagueId)}`;
}

export default async function LigaPage({
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
          <h3>Noch keine Liga-Daten</h3>
          <p>Collector einmal laufen lassen (<code>/api/cron/collect</code>).</p>
        </div>
      </main>
    );
  }

  const [{ day, rows }, topPlayers] = await Promise.all([
    getManagerTable(league),
    getTopPlayers(league, 50),
  ]);
  const active = rows.filter((r) => r.active);
  const byTv = [...active].sort((a, b) => (b.teamValue ?? 0) - (a.teamValue ?? 0));
  const maxTv = byTv[0]?.teamValue ?? 0;
  const href = (base: string) => `${base}?league=${encodeURIComponent(league.id)}`;

  return (
    <main className="wrap">
      <div className="crumb">{league.name} · Analyse</div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Ligaanalyse</span>
          <h1>Das Feld</h1>
          <p className="sub">
            {league.name}
            {day != null ? ` · Spieltag ${day}` : ""} · {active.length} aktive Manager
          </p>
        </div>
      </div>

      <section className="card card-pad">
        <p className="card-title">Marktband — Kaderwert</p>
        {byTv.map((r) => (
          <div className="bar-row" key={r.id}>
            <div className="name">
              <Link href={leagueHref(`/manager/${r.id}`, league.id)}>{r.name}</Link>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: maxTv > 0 ? `${((r.teamValue ?? 0) / maxTv) * 100}%` : "0%" }}
              />
            </div>
            <div className="amt" title={eurFull(r.teamValue)}>
              {eur(r.teamValue)}
            </div>
          </div>
        ))}
        {byTv.length === 0 && <p className="muted">Keine aktiven Manager.</p>}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Rangliste</h2>
          <span className="note">{active.length} aktive Manager</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="l">#</th>
                <th className="l">Manager</th>
                <th>Saisonpunkte</th>
                <th>Kaderwert</th>
                <th>Serie</th>
              </tr>
            </thead>
            <tbody>
              {active.map((r, i) => (
                <tr key={r.id}>
                  <td className="l rank">{i + 1}</td>
                  <td className="l">
                    <Link href={leagueHref(`/manager/${r.id}`, league.id)}>{r.name}</Link>
                    {r.isMe && <span className="badge me" style={{ marginLeft: 8 }}>du</span>}
                  </td>
                  <td>{num(r.points)}</td>
                  <td title={eurFull(r.teamValue)}>{eur(r.teamValue)}</td>
                  <td className="muted">{r.streak ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Top 50 Spieler</h2>
          <span className="note">beste Spieler der Liga nach Saisonpunkten</span>
        </div>
        {topPlayers.length === 0 ? (
          <div className="notice">
            Der Kaderbestand wird beim nächsten Sammel-Lauf erfasst — danach erscheinen
            hier die besten Spieler der Liga (inkl. Besitzer).
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="l">#</th>
                  <th className="l">Spieler</th>
                  <th className="l">Pos</th>
                  <th>Punkte</th>
                  <th>Ø</th>
                  <th>Marktwert</th>
                  <th className="l">Besitzer</th>
                </tr>
              </thead>
              <tbody>
                {topPlayers.map((p, i) => (
                  <tr key={p.playerId}>
                    <td className="l rank">{i + 1}</td>
                    <td className="l">
                      <Link href={href(`/player/${p.playerId}`)} className="linklike">
                        {p.name}
                      </Link>
                    </td>
                    <td className="l muted">{p.position ?? "—"}</td>
                    <td>{num(p.points)}</td>
                    <td className="muted">{num(p.avgPoints)}</td>
                    <td title={eurFull(p.marketValue)}>{eur(p.marketValue)}</td>
                    <td className="l">
                      <Link href={href(`/manager/${p.ownerId}`)}>{p.ownerName}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
