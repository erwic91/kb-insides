import Link from "next/link";
import { resolveLeague, getManagerDetail, getManagerSquad, isManagerHidden } from "../../../lib/db/queries";
import { getAdjustments } from "../../../lib/db/adjustments";
import { addManagerAdjustment, removeManagerAdjustment, setHiddenManager } from "./actions";
import SquadTable from "../../../components/SquadTable";
import { eur, eurFull, eurSigned, num, pct, date } from "../../../lib/format";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

const inputStyle: CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 3,
  padding: "7px 10px",
  fontFamily: "var(--mono)",
  fontSize: 13,
  color: "var(--ink)",
};
const selectStyle: CSSProperties = { ...inputStyle, fontFamily: "var(--body)" };

function leagueHref(base: string, leagueId: string): string {
  return `${base}?league=${encodeURIComponent(leagueId)}`;
}

export default async function ManagerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string; ok?: string; err?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { league: requested, ok, err, tab } = await searchParams;
  const league = await resolveLeague(requested);
  const activeTab = tab === "history" ? "history" : "kader";

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
  const [adjustments, hidden, squad] = await Promise.all([
    getAdjustments(league.id, id),
    isManagerHidden(league.id, id),
    getManagerSquad(league, id),
  ]);
  const OKS: Record<string, string> = { added: "Korrektur gespeichert.", removed: "Korrektur entfernt." };
  const ERRS: Record<string, string> = {
    access: "Keine Berechtigung für diese Liga.",
    amount: "Bitte einen Betrag größer 0 eingeben.",
  };

  return (
    <main className="page">
      <div className="crumb">
        <Link href={leagueHref("/", league.id)}>Dashboard</Link> ·{" "}
        <Link href={leagueHref("/liga", league.id)}>{league.name}</Link>
      </div>
      <div className="page-head" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="eyebrow">Manager-Dossier</span>
          <h1>
            {m.name}{" "}
            {m.isMe && <span className="badge me">du</span>}{" "}
            {hidden && <span className="badge inactive">ausgeblendet</span>}{" "}
            {m.teamValue == null && m.points == null && (
              <span className="badge inactive">inaktiv</span>
            )}
          </h1>
          <p className="sub">
            {league.name}
            {m.day != null ? ` · Spieltag ${m.day}` : ""}
          </p>
        </div>
        {!m.isMe && (
          <form action={setHiddenManager}>
            <input type="hidden" name="leagueId" value={league.id} />
            <input type="hidden" name="managerId" value={id} />
            <input type="hidden" name="hidden" value={hidden ? "0" : "1"} />
            <input type="hidden" name="redirectTo" value={leagueHref(`/manager/${id}`, league.id)} />
            <button className="btn" type="submit">
              {hidden ? "Wieder einblenden" : "Aus Auswertung ausblenden"}
            </button>
          </form>
        )}
      </div>

      {hidden && (
        <div className="notice" style={{ marginBottom: 16 }}>
          Dieser Manager ist <strong>in {league.name}</strong> ausgeblendet — hier taucht er
          nicht in Ranking, Ø-Werten oder Insights auf. In anderen Ligen bleibt er sichtbar,
          und seine Daten werden weiter gesammelt.
        </div>
      )}

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
          <div className="label">Konto{m.isMe ? " (exakt)" : " (rekonstruiert)"}</div>
          <div className="value sm">{eur(m.cash)}</div>
          <div className="hint">
            {m.isMe
              ? "exakt aus /me/budget"
              : m.transfers.length > 0
                ? `aus ${m.transfers.length} Transfers`
                : "keine Transfers"}
            {m.adjustment !== 0 ? ` · inkl. Korrektur ${eurSigned(m.adjustment)}` : ""}
          </div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Maximalgebot</div>
          <div className="value sm">{eur(m.maxBid)}</div>
          <div className="hint">cash + 33 % × Kaderwert</div>
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
          <h2>Manuelle Korrekturen</h2>
          <span className="note">Strafen / Boni des Liga-Admins</span>
        </div>

        {ok && <div className="notice">{OKS[ok] ?? "OK."}</div>}
        {err && <div className="notice warn">{ERRS[err] ?? "Fehler."}</div>}

        <div className="card card-pad">
          <p className="note" style={{ marginBottom: 12 }}>
            Admin-Strafen/-Boni siehst du in Kickbase unter „Aktivitäten", sie sind aber nicht
            über die API abrufbar. Trage sie hier ein — die Summe fließt in den rekonstruierten
            Kontostand & das Maximalgebot.
            {m.isMe ? " (Dein eigenes Konto ist exakt — Korrekturen wirken nur bei Gegnern.)" : ""}
          </p>

          <form
            action={addManagerAdjustment}
            style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
          >
            <input type="hidden" name="leagueId" value={league.id} />
            <input type="hidden" name="managerId" value={id} />
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>Art</span>
              <select name="kind" style={selectStyle} defaultValue="penalty">
                <option value="penalty">Strafe (−)</option>
                <option value="bonus">Bonus (+)</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>Betrag (€)</span>
              <input type="number" name="amount" min={1} step={1} required placeholder="z. B. 5000000" style={inputStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, flex: 1, minWidth: 160 }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>Notiz (optional)</span>
              <input type="text" name="note" placeholder="z. B. Strafe Spieltag 3" style={inputStyle} />
            </label>
            <button className="btn" type="submit">Hinzufügen</button>
          </form>

          {adjustments.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th className="l">Datum</th>
                    <th>Betrag</th>
                    <th className="l">Notiz</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((a) => (
                    <tr key={a.id}>
                      <td className="l muted">{date(a.createdAt)}</td>
                      <td className={a.amount < 0 ? "neg" : "pos"}>{eurSigned(a.amount)}</td>
                      <td className="l muted">{a.note ?? "—"}</td>
                      <td>
                        <form action={removeManagerAdjustment}>
                          <input type="hidden" name="leagueId" value={league.id} />
                          <input type="hidden" name="managerId" value={id} />
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn" type="submit">Entfernen</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note" style={{ marginTop: 8 }}>
                Summe der Korrekturen: <strong>{eurSigned(m.adjustment)}</strong>
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="tabs">
          <Link
            href={`/manager/${id}?league=${encodeURIComponent(league.id)}&tab=kader`}
            className={activeTab === "kader" ? "on" : ""}
          >
            Kader{squad && squad.rows.length > 0 ? ` (${squad.rows.length})` : ""}
          </Link>
          <Link
            href={`/manager/${id}?league=${encodeURIComponent(league.id)}&tab=history`}
            className={activeTab === "history" ? "on" : ""}
          >
            Transferhistorie{m.transfers.length > 0 ? ` (${m.transfers.length})` : ""}
          </Link>
        </div>

        {activeTab === "kader" ? (
          squad && squad.rows.length > 0 ? (
            <>
              <div className="section-head">
                <h2>Kader</h2>
                <span className="note">
                  {squad.rows.length} Spieler · Kaderwert {eur(squad.teamValue)}
                </span>
              </div>
              <SquadTable squad={squad} leagueId={league.id} cash={m.cash} />
            </>
          ) : (
            <div className="notice">
              Für diesen Manager ist kein Kader erfasst. Er wird beim nächsten Collector-Lauf
              gesammelt.
            </div>
          )
        ) : (
          <>
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
            )}
          </>
        )}
      </section>
    </main>
  );
}
