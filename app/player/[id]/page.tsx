import Link from "next/link";
import { resolveLeague, getPlayerDetail } from "../../../lib/db/queries";
import { eur, eurFull, date } from "../../../lib/format";

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
      <main className="page">
        <div className="empty">
          <h3>Keine Liga aktiv</h3>
          <p>
            <Link href="/">Zurück zum Dashboard</Link>
          </p>
        </div>
      </main>
    );
  }

  const p = await getPlayerDetail(league, id);
  if (!p) {
    return (
      <main className="page">
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

  const maxMv = Math.max(1, ...p.mvHistory.map((h) => h.marketValue ?? 0));

  return (
    <main className="page">
      <div className="crumb">
        <Link href={leagueHref("/", league.id)}>Dashboard</Link> ·{" "}
        <Link href={leagueHref("/markt", league.id)}>Marktradar</Link>
      </div>
      <div className="page-head">
        <h1>{p.name}</h1>
        <p className="sub">
          {league.name}
          {p.position ? ` · ${p.position}` : ""}
          {p.team ? ` · Team ${p.team}` : ""}
        </p>
      </div>

      <div className="grid grid-3">
        <div className="card card-pad tile">
          <div className="label">Marktwert (aktuell)</div>
          <div className="value sm">{eur(p.latestMv)}</div>
          <div className="hint">{eurFull(p.latestMv)}</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">MV-Datenpunkte</div>
          <div className="value sm">{p.mvHistory.length}</div>
          <div className="hint">wächst mit jedem Collector-Lauf</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Ligaweite Transfers</div>
          <div className="value sm">{p.transfers.length}</div>
          <div className="hint">Käufe &amp; Verkäufe in dieser Liga</div>
        </div>
      </div>

      {p.mvHistory.length > 1 && (
        <section className="card card-pad section">
          <p className="card-title">Marktwertverlauf</p>
          {p.mvHistory.map((h) => (
            <div className="bar-row" key={h.day}>
              <div className="name">Spieltag {h.day}</div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${((h.marketValue ?? 0) / maxMv) * 100}%` }}
                />
              </div>
              <div className="amt">{eur(h.marketValue)}</div>
            </div>
          ))}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Ligaweite Besitzhistorie</h2>
          <span className="note">Overpay = Preis − MV (sobald MV-Historie vorliegt)</span>
        </div>
        {p.transfers.length === 0 ? (
          <div className="notice">
            Noch keine Transfers dieses Spielers in {league.name} erfasst.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="l">Datum</th>
                  <th className="l">Manager</th>
                  <th className="l">Richtung</th>
                  <th>Preis</th>
                </tr>
              </thead>
              <tbody>
                {p.transfers.map((t, i) => (
                  <tr key={`${t.managerId}-${t.ts}-${i}`}>
                    <td className="l muted">{date(t.ts)}</td>
                    <td className="l">
                      {t.managerId ? (
                        <Link href={leagueHref(`/manager/${t.managerId}`, league.id)}>
                          {t.managerName}
                        </Link>
                      ) : (
                        t.managerName
                      )}
                    </td>
                    <td className="l">
                      {t.direction === "buy" ? (
                        <span className="badge">Kauf</span>
                      ) : (
                        <span className="badge accent">Verkauf</span>
                      )}
                    </td>
                    <td>{eurFull(t.price)}</td>
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
