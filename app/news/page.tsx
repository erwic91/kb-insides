import Link from "next/link";
import { resolveLeague, getLeagueNews } from "../../lib/db/queries";
import { eurFull, eurSigned } from "../../lib/format";

export const dynamic = "force-dynamic";

const fmtPct = (x: number | null) =>
  x == null ? "" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")} %`;

export default async function NewsPage({
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
          <p>Collector einmal laufen lassen (über „Aktualisieren" auf dem Dashboard).</p>
        </div>
      </main>
    );
  }

  const href = (base: string) => `${base}?league=${encodeURIComponent(league.id)}`;
  const news = await getLeagueNews(league);
  const col = (v: number) => (v >= 0 ? "var(--gain)" : "var(--loss)");

  return (
    <main className="wrap">
      <div className="crumb">{league.name} · News</div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Signale & Nachrichten</span>
          <h1>News</h1>
          <p className="sub">
            {league.name} · {news.injuries.length} Ausfälle im Kaderbestand
          </p>
        </div>
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        Aktuell Kickbase-interne Signale (Ausfälle, Marktwert-Bewegungen). Externe
        Quellen (Transfermarkt, Ligainsider &amp; Co.) werden Schritt für Schritt angebunden.
      </div>

      {/* Verletzungen & Ausfälle — liga-weit */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h3>Verletzungen &amp; Ausfälle</h3>
          <span className="count">{news.injuries.length}</span>
        </div>
        {news.injuries.length === 0 ? (
          <div className="notice">Aktuell keine gemeldeten Ausfälle im Kaderbestand.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="l">Spieler</th>
                  <th className="l">Pos</th>
                  <th className="l">Team</th>
                  <th className="l">Status</th>
                  <th className="l">Manager</th>
                </tr>
              </thead>
              <tbody>
                {news.injuries.map((p) => (
                  <tr key={`${p.managerId}-${p.playerId}`}>
                    <td className="l">
                      <Link href={href(`/player/${p.playerId}`)} className="linklike">
                        {p.name}
                      </Link>
                    </td>
                    <td className="l muted">{p.position ?? "—"}</td>
                    <td className="l muted">{p.team ?? "—"}</td>
                    <td className="l">
                      <span style={{ color: "var(--warn)" }}>{p.label}</span>
                    </td>
                    <td className="l">
                      <Link href={href(`/manager/${p.managerId}`)}>{p.managerName}</Link>
                      {p.isMine && <span className="tag">du</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Externe Ausfälle — Bundesliga-weit (api-football) */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h3>Bundesliga-Ausfälle (extern)</h3>
          <span className="count">{news.externalInjuries.length}</span>
        </div>
        {news.externalInjuries.length === 0 ? (
          <div className="notice">
            Noch keine externen Ausfälle. Quelle ist api-football — sobald ein API-Key
            hinterlegt ist, erscheinen die Bundesliga-weiten Ausfälle nach dem nächsten
            Sammel-Lauf.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="l">Spieler</th>
                  <th className="l">Team</th>
                  <th className="l">Grund</th>
                  <th className="l">Status</th>
                </tr>
              </thead>
              <tbody>
                {news.externalInjuries.map((x, i) => (
                  <tr key={`${x.playerName}-${i}`}>
                    <td className="l">
                      {x.kbPlayerId ? (
                        <Link href={href(`/player/${x.kbPlayerId}`)} className="linklike">
                          {x.playerName}
                        </Link>
                      ) : (
                        x.playerName
                      )}
                    </td>
                    <td className="l muted">{x.teamName ?? "—"}</td>
                    <td className="l">
                      <span style={{ color: "var(--warn)" }}>{x.reason ?? "—"}</span>
                    </td>
                    <td className="l muted">{x.type ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Marktwert-Bewegungen — eigener Kader */}
      <div className="grid g-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Deine Gewinner (seit gestern)</h3>
            <span className="count">{news.risers.length}</span>
          </div>
          {news.risers.length === 0 ? (
            <div className="notice">Noch keine Marktwert-Historie — nach „Aktualisieren" verfügbar.</div>
          ) : (
            <div>
              {news.risers.map((m) => (
                <div className="mrow" key={m.playerId}>
                  <Link href={href(`/player/${m.playerId}`)} className="nm linklike">
                    {m.name}
                  </Link>
                  <span className="num sm" style={{ color: col(m.change) }} title={eurFull(m.change)}>
                    {eurSigned(m.change)} ({fmtPct(m.changePct)})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Deine Verlierer (seit gestern)</h3>
            <span className="count">{news.fallers.length}</span>
          </div>
          {news.fallers.length === 0 ? (
            <div className="notice">Noch keine Marktwert-Historie — nach „Aktualisieren" verfügbar.</div>
          ) : (
            <div>
              {news.fallers.map((m) => (
                <div className="mrow" key={m.playerId}>
                  <Link href={href(`/player/${m.playerId}`)} className="nm linklike">
                    {m.name}
                  </Link>
                  <span className="num sm" style={{ color: col(m.change) }} title={eurFull(m.change)}>
                    {eurSigned(m.change)} ({fmtPct(m.changePct)})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
