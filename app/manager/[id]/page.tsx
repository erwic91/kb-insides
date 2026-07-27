import Link from "next/link";
import { resolveLeague, getManagerDetail } from "../../../lib/db/queries";
import { eur, eurFull, eurSigned, num, pct, date } from "../../../lib/format";

export const dynamic = "force-dynamic";

function leagueHref(base: string, leagueId: string): string {
  return `${base}?league=${encodeURIComponent(leagueId)}`;
}

export default async function ManagerPage({
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

  const m = await getManagerDetail(league, id);
  if (!m) {
    return (
      <main className="page">
        <div className="empty">
          <h3>Manager nicht gefunden</h3>
          <p>
            In {league.name} gibt es keinen Manager mit ID {id}.{" "}
            <Link href={leagueHref("/", league.id)}>Zum Dashboard</Link>
          </p>
        </div>
      </main>
    );
  }

  const net = m.sold - m.bought;

  return (
    <main className="page">
      <div className="crumb">
        <Link href={leagueHref("/", league.id)}>Dashboard</Link> ·{" "}
        <Link href={leagueHref("/liga", league.id)}>{league.name}</Link>
      </div>
      <div className="page-head">
        <h1>
          {m.name}{" "}
          {m.isMe && <span className="badge me">du</span>}{" "}
          {m.teamValue == null && m.points == null && (
            <span className="badge inactive">inaktiv</span>
          )}
        </h1>
        <p className="sub">
          {league.name}
          {m.day != null ? ` · Spieltag ${m.day}` : ""}
        </p>
      </div>

      <div className="grid grid-4">
        <div className="card card-pad tile">
          <div className="label">Kaderwert</div>
          <div className="value sm">{eur(m.teamValue)}</div>
          <div className="hint">{eurFull(m.teamValue)}</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Saisonpunkte</div>
          <div className="value sm">{num(m.points)}</div>
          <div className="hint">Serie {m.streak ?? "—"}</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Konto (rekonstruiert)</div>
          <div className="value sm">{eur(m.cash)}</div>
          <div className="hint">
            {m.transfers.length > 0 ? `aus ${m.transfers.length} Transfers` : "keine Transfers"}
          </div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Maximalgebot</div>
          <div className="value sm">{eur(m.maxBid)}</div>
          <div className="hint">cash + 33 % Kaderwert</div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Handelsbilanz</h2>
          <span className="note">aus vorliegenden Transfers (API-Liste ~25 gedeckelt)</span>
        </div>
        <div className="grid grid-3">
          <div className="card card-pad tile">
            <div className="label">Käufe / Verkäufe</div>
            <div className="value sm">
              {eur(m.bought)} <span className="muted">/</span> {eur(m.sold)}
            </div>
            <div className="hint">Netto {eurSigned(net)}</div>
          </div>
          <div className="card card-pad tile">
            <div className="label">Realisierter Gewinn (FIFO)</div>
            <div className={`value sm ${m.trade.profit >= 0 ? "pos" : "neg"}`}>
              {eurSigned(m.trade.profit)}
            </div>
            <div className="hint">{m.trade.closedTrades} abgeschlossene Trades</div>
          </div>
          <div className="card card-pad tile">
            <div className="label">Trefferquote</div>
            <div className="value sm">{pct(m.trade.hitRate)}</div>
            <div className="hint">
              {m.trade.wins} von {m.trade.closedTrades} mit Gewinn
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Transferhistorie</h2>
          <span className="note">{m.transfers.length} Einträge</span>
        </div>
        {m.transfers.length === 0 ? (
          <div className="notice">
            Für diesen Manager liegen noch keine Transfers vor. Sie werden beim nächsten
            Collector-Lauf gesammelt.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="l">Datum</th>
                  <th className="l">Spieler</th>
                  <th className="l">Richtung</th>
                  <th>Preis</th>
                </tr>
              </thead>
              <tbody>
                {m.transfers.map((t) => (
                  <tr key={t.id}>
                    <td className="l muted">{date(t.ts)}</td>
                    <td className="l">
                      <Link href={leagueHref(`/player/${t.playerId}`, league.id)}>
                        #{t.playerId}
                      </Link>
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
