import Link from "next/link";
import { resolveLeague, getManagerDetail, getManagerSquad } from "../../../../lib/db/queries";
import OffcanvasShell from "../../../../components/OffcanvasShell";
import OffcanvasTabs from "../../../../components/OffcanvasTabs";
import SquadTable from "../../../../components/SquadTable";
import { eur, eurFull, eurSigned, num, pct, date } from "../../../../lib/format";

export const dynamic = "force-dynamic";

/**
 * Intercepting Route: Klicks auf /manager/[id] innerhalb der App öffnen die
 * Detailinfos als Off-canvas von rechts (schneller als ein Seitenwechsel).
 * Direktaufruf/Reload zeigt weiterhin die volle Seite (app/manager/[id]).
 */
export default async function ManagerOffcanvas({
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
      <OffcanvasShell>
        <div className="oc-body">
          <p className="note">Keine Liga aktiv.</p>
        </div>
      </OffcanvasShell>
    );
  }

  const [m, squad] = await Promise.all([getManagerDetail(league, id), getManagerSquad(league, id)]);

  if (!m) {
    return (
      <OffcanvasShell>
        <div className="oc-body">
          <p className="note">In {league.name} gibt es keinen Manager mit ID {id}.</p>
        </div>
      </OffcanvasShell>
    );
  }

  const net = m.sold - m.bought;
  const leagueHref = (base: string) => `${base}?league=${encodeURIComponent(league.id)}`;

  const kader =
    squad && squad.rows.length > 0 ? (
      <SquadTable squad={squad} leagueId={league.id} cash={m.cash} />
    ) : (
      <div className="notice">Für diesen Manager ist kein Kader erfasst.</div>
    );

  const history =
    m.transfers.length === 0 ? (
      <div className="notice">Noch keine Transfers erfasst.</div>
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
                  <Link href={leagueHref(`/player/${t.playerId}`)} className="linklike">
                    {t.playerName}
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
    );

  return (
    <OffcanvasShell>
      <div className="oc-head">
        <span className="eyebrow">Manager</span>
        <h2 className="oc-title">
          {m.name} {m.isMe && <span className="badge me">du</span>}
        </h2>
        <p className="sub">
          {league.name}
          {m.day != null ? ` · Spieltag ${m.day}` : ""}
        </p>
      </div>

      <div className="oc-body">
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
            <div className="label">Konto{m.isMe ? " (exakt)" : " (rekonstr.)"}</div>
            <div className="value sm">{eur(m.cash)}</div>
            <div className="hint">Maxgebot {eur(m.maxBid)}</div>
          </div>
          <div className="card card-pad tile">
            <div className="label">Realis. Gewinn</div>
            <div className={`value sm ${m.trade.profit >= 0 ? "pos" : "neg"}`}>
              {eurSigned(m.trade.profit)}
            </div>
            <div className="hint">
              {m.trade.closedTrades} Trades · {pct(m.trade.hitRate)}
            </div>
          </div>
        </div>

        <div className="note" style={{ margin: "10px 0 4px", color: "var(--mute)" }}>
          Käufe {eur(m.bought)} · Verkäufe {eur(m.sold)} · Netto {eurSigned(net)}
        </div>

        <OffcanvasTabs
          tabs={[
            { key: "kader", label: `Kader${squad && squad.rows.length > 0 ? ` (${squad.rows.length})` : ""}`, content: kader },
            { key: "history", label: `Transfers${m.transfers.length > 0 ? ` (${m.transfers.length})` : ""}`, content: history },
          ]}
        />

        {/* Voller Seite (Admin-Korrekturen, Aus-/Einblenden): echter Seitenwechsel
            via <a>, damit die Intercepting Route umgangen wird. */}
        <div style={{ marginTop: 16 }}>
          <a href={leagueHref(`/manager/${id}`)} className="linklike">
            Ganze Detailseite öffnen (Korrekturen, Ein-/Ausblenden) →
          </a>
        </div>
      </div>
    </OffcanvasShell>
  );
}
