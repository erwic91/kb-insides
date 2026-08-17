import type { ReactNode } from "react";
import {
  resolveLeague,
  getManagerTable,
  getCalibration,
  getSquadLandscape,
  getMySquad,
  getMyAccess,
  getOverpay,
  type ManagerTableRow,
} from "../lib/db/queries";
import { eur, eurFull, eurSigned, num, pct } from "../lib/format";
import RefreshButton from "../components/RefreshButton";
import InfoDot from "../components/InfoDot";
import ManagerTable from "../components/ManagerTable";
import LeagueSettings from "../components/LeagueSettings";
import SquadTable from "../components/SquadTable";
import { SpielerLandschaft, Formkurve } from "../components/Insights";
import { setHiddenManager } from "./manager/[id]/actions";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league: requested } = await searchParams;
  const league = await resolveLeague(requested);

  if (!league) {
    // Keine Liga-Daten. Unterscheiden: gar keine aktive Liga → /connect;
    // aktive Liga, aber noch nichts gesammelt → Lade-Zustand mit Sammel-Button.
    const access = await getMyAccess();
    if (!access) redirect("/connect");
    return (
      <main className="wrap">
        <div className="page-head" style={{ justifyContent: "space-between" }}>
          <div>
            <span className="eyebrow">Ligaaufklärung</span>
            <h1>Liga aktiviert</h1>
            <p className="sub">Für diese Liga liegen noch keine Daten vor.</p>
          </div>
          <RefreshButton leagueId={access!.leagueId} />
        </div>
        <div className="notice">
          Klicke auf <b>Aktualisieren</b>, um Ranking, Transfers und Markt das erste Mal zu
          sammeln. Danach erscheint hier dein Dashboard. (Der tägliche Sammel-Lauf holt die
          Daten sonst automatisch.)
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          <Link href="/connect" className="linklike">Zurück zu deinen Ligen</Link>
        </div>
      </main>
    );
  }

  const { day, rows, hidden } = await getManagerTable(league);
  const [calibration, landscape, squad] = await Promise.all([
    getCalibration(league),
    getSquadLandscape(league),
    getMySquad(league),
  ]);
  // Konto/Maximalgebot sind rekonstruierbar, sobald eine Budget-Basis (Start-
  // Budget) konfiguriert ist. Gerechnet wird ab dem Startzeitpunkt (siehe
  // getManagerTable). Gilt für beide Modi (Draft-Kader ist „gratis").
  const showMoney = league.startBudget > 0;
  const active = rows.filter((r) => r.active);
  const me = rows.find((r) => r.isMe);
  const overpay = showMoney && me ? await getOverpay(league, me.id) : null;

  // Rang: in gpm:2 nach Gesamtwert, sonst nach Punkten.
  const metric = (r: ManagerTableRow) =>
    showMoney ? (r.total ?? Number.NEGATIVE_INFINITY) : (r.points ?? Number.NEGATIVE_INFINITY);
  const ranked = [...active].sort((a, b) => metric(b) - metric(a));
  const myRank = me ? ranked.findIndex((r) => r.id === me.id) + 1 : 0;

  // KPI-Kacheln (bisherige Dashboard-Funktionen, im Editorial-Stil erhalten).
  const leaderTv = [...active].sort((a, b) => (b.teamValue ?? 0) - (a.teamValue ?? 0))[0];
  const leaderPts = [...active].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
  const avgTv =
    active.length > 0
      ? Math.round(active.reduce((s, r) => s + (r.teamValue ?? 0), 0) / active.length)
      : null;

  const others = rows.filter((r) => !r.isMe);
  const verkaufsdruck = showMoney
    ? others
        .filter((r) => r.liquidity != null)
        .sort((a, b) => (a.liquidity ?? 1) - (b.liquidity ?? 1))
        .slice(0, 3)
    : [];
  const schlaefer = others
    .filter((r) => r.lastActiveDays != null)
    .sort((a, b) => (b.lastActiveDays ?? 0) - (a.lastActiveDays ?? 0))
    .slice(0, 3);

  return (
    <main className="wrap">
      <div className="crumb">{league.name} · Dashboard</div>

      <div className="page-head">
        <div>
          <span className="eyebrow">Ligaaufklärung</span>
          <h1>Die Gegner</h1>
          <div className="sub">
            {league.name}
            {day != null ? ` · Spieltag ${day}` : ""}
            {myRank > 0 ? ` · du bist Rang ${myRank} von ${active.length}` : ""}
          </div>
        </div>
        <div className="head-actions">
          <LeagueSettings
            leagueId={league.id}
            current={{
              gameMode: league.gameMode,
              startBudget: league.startBudget,
              trackingSince: league.trackingSince,
              includeHistory: league.includeHistory,
              bonusMode: league.bonusMode,
            }}
          />
          <RefreshButton leagueId={league.id} />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>
            Alle Manager
            <InfoDot text="Alle Manager der Liga. Kaderwert, Punkte, Spieler & Aktivität kommen direkt aus Kickbase. Kontostand, Login-Bonus, Maximalgebot, Liquidität & Gesamt sind bei Gegnern aus der Transferhistorie rekonstruiert (dein eigenes Konto ist exakt). Spaltenköpfe haben eigene Erklärungen." />
          </h2>
          <span className="note">Spaltenkopf klicken zum Sortieren</span>
        </div>
        <ManagerTable rows={rows} showMoney={showMoney} leagueId={league.id} />
        {hidden.length > 0 && (
          <div className="note" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span className="muted">Ausgeblendet:</span>
            {hidden.map((h) => (
              <form key={h.id} action={setHiddenManager} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input type="hidden" name="leagueId" value={league.id} />
                <input type="hidden" name="managerId" value={h.id} />
                <input type="hidden" name="hidden" value="0" />
                <input type="hidden" name="redirectTo" value={`/?league=${encodeURIComponent(league.id)}`} />
                <Link href={`/manager/${h.id}?league=${encodeURIComponent(league.id)}`} className="linklike">{h.name}</Link>
                <button className="btn" type="submit" style={{ padding: "2px 8px", fontSize: 11 }}>
                  einblenden
                </button>
              </form>
            ))}
          </div>
        )}
      </div>

      {showMoney && calibration && (
        <div className={`notice ${calibration.delta === 0 ? "" : "warn"}`}>
          {calibration.delta === 0 ? (
            <span className="badge accent">bestätigt</span>
          ) : (
            <span className="badge">geschätzt</span>
          )}{" "}
          Selbstkalibrierung: Rekonstruktion <strong>{eur(calibration.myReconstructed)}</strong> vs.{" "}
          <code>/me/budget</code> <strong>{eur(calibration.myActual)}</strong> · Δ{" "}
          <strong>{eurSigned(calibration.delta)}</strong>
        </div>
      )}

      {!showMoney && (
        <div className="note-banner">
          Für <b>{league.name}</b> ist noch kein Start-Budget gesetzt — Kontostand,
          Maximalgebot &amp; Liquidität brauchen diese Basis. Unter
          <b> Liga-Einstellungen</b> Typ &amp; Start-Budget wählen, dann erscheinen sie.
        </div>
      )}
      {showMoney && league.trackingSince && (
        <div className="note">
          Kontostand &amp; Maximalgebot werden ab dem Liga-Start
          ({new Date(league.trackingSince).toLocaleDateString("de-DE")}) gerechnet.
        </div>
      )}

      <div className="tiles4" style={{ marginBottom: 24 }}>
        <div className="card card-pad tile">
          <div className="label">
            Kaderwert-Spitze
            <InfoDot text="Höchster Kaderwert (Summe der Marktwerte aller Kaderspieler) in der Liga — direkt aus Kickbase." />
          </div>
          <div className="value sm">{eur(leaderTv?.teamValue ?? null)}</div>
          <div className="hint">{leaderTv?.name ?? "—"}</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">
            Punkte-Spitze
            <InfoDot text="Meiste Saisonpunkte in der Liga — direkt aus dem Kickbase-Ranking." />
          </div>
          <div className="value sm">{num(leaderPts?.points ?? null)}</div>
          <div className="hint">{leaderPts?.name ?? "—"}</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">
            Ø Kaderwert (aktiv)
            <InfoDot text="Durchschnittlicher Kaderwert über alle aktiven Manager." />
          </div>
          <div className="value sm">{eur(avgTv)}</div>
          <div className="hint">über {active.length} Manager</div>
        </div>
        {showMoney && (
          <div className="card card-pad tile">
            <div className="label">
              Dein Konto{me?.cashExact ? "" : " (rekonstruiert)"}
              <InfoDot text="Dein exakter Kontostand aus Kickbase (/me/budget). Max-Gebot = Konto + 33 % × Kaderwert." />
            </div>
            <div className="value sm">{eurFull(me?.cash ?? null)}</div>
            <div className="hint">
              {me?.cashExact ? "exakt aus /me/budget" : "rekonstruiert"}
              {me?.maxBid != null ? ` · Max. Gebot ${eurFull(me.maxBid)}` : ""}
            </div>
          </div>
        )}
        {showMoney && (
          <div className="card card-pad tile">
            <div className="label">
              Dein Gesamtwert
              <InfoDot text="Kaderwert + Kontostand — dein exaktes Vermögen. Bei negativem Konto kann er unter dem Kaderwert liegen." />
            </div>
            <div className="value sm">{eurFull(me?.total ?? null)}</div>
            <div className="hint">Kaderwert {eur(me?.teamValue ?? null)} + Konto</div>
          </div>
        )}
        {overpay && overpay.count > 0 && (
          <div className="card card-pad tile">
            <div className="label">
              Deine Ø Overpay
              <InfoDot text={'Durchschnittlich gezahlter Aufpreis über dem Marktwert je Kauf (Kaufpreis − Marktwert am Kauftag). Positiv = über Marktwert gekauft. „Gesamt" = Summe über alle erfassten Käufe.'} />
            </div>
            <div
              className="value sm"
              style={{ color: (overpay.avg ?? 0) > 0 ? "var(--loss)" : "var(--gain)" }}
            >
              {eurSigned(overpay.avg)}
            </div>
            <div className="hint">
              Gesamt {eurSigned(overpay.total)} · {overpay.count} Käufe
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>
            Dein Kader
            <InfoDot text="Alle deine Spieler mit Marktwert, Kaufpreis, unrealisiertem Transfergewinn (Marktwert − Kaufpreis), Saisonpunkten, Ø-Punkten und Fitness-Status — direkt aus Kickbase." />
          </h2>
          {squad && squad.rows.length > 0 && (
            <span className="note">
              {squad.rows.length} Spieler · Gewinn {eurSigned(squad.totalProfit)}
            </span>
          )}
        </div>
        {squad ? (
          <SquadTable squad={squad} leagueId={league.id} />
        ) : (
          <div className="notice">Kein eigener Kader gefunden.</div>
        )}
      </div>

      <div className="g-2">
        {landscape && <SpielerLandschaft data={landscape} leagueId={league.id} />}
        <Formkurve rows={rows} leagueId={league.id} />
      </div>

      {(verkaufsdruck.length > 0 || schlaefer.length > 0) && (
        <div className="tiles4">
          {verkaufsdruck.length > 0 && (
            <InsightTile
              title="Verkaufsdruck"
              sub="niedrigste Liquidität"
              info="Gegner mit dem geringsten Anteil flüssigen Geldes (Konto ÷ Gesamtwert). Sie haben viel im Kader gebunden und müssen für Zukäufe eher verkaufen."
            >
              {verkaufsdruck.map((r) => (
                <Trow key={r.id} name={r.name} detail={`${pct(r.liquidity)} liquide · ${eur(r.cash)}`} />
              ))}
            </InsightTile>
          )}
          {schlaefer.length > 0 && (
            <InsightTile
              title="Schläfer"
              sub="längste Transfer-Pause"
              info="Gegner, deren letzter Transfer am längsten zurückliegt — vermutlich gerade inaktiv und langsamer am Markt."
            >
              {schlaefer.map((r) => (
                <Trow
                  key={r.id}
                  name={r.name}
                  detail={r.lastActiveDays === 0 ? "heute aktiv" : `vor ${r.lastActiveDays} T`}
                />
              ))}
            </InsightTile>
          )}
        </div>
      )}

      <div className="foot">
        <b>Maximalgebot</b> = Kontostand + 33 % × (Kaderwert + min(Kontostand, 0)) — die
        Kickbase-Regel. Kontostand, Maximalgebot &amp; Liquidität werden aus der vollständigen
        Transferhistorie rekonstruiert und nur in Manager-Ligen (gpm:2) angezeigt. Bei den
        Gegnern ist der <b>tägliche Login-Bonus</b> (10k → 100k/Tag ab Reset) als Schätzung
        eingerechnet — Annahme: täglich aktiv. Dein eigener Kontostand ist exakt aus{" "}
        <code>/me/budget</code>. Kaderwert, Punkte, Kadergröße und Aktivität kommen direkt aus der API.
      </div>
    </main>
  );
}

function InsightTile({
  title,
  sub,
  info,
  children,
}: {
  title: string;
  sub: string;
  info?: string;
  children: ReactNode;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          {title}
          {info && <InfoDot text={info} />}
        </h3>
        <span className="count">{sub}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Trow({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="trow">
      <span className="nm">{name}</span>
      <span className="num sm" style={{ color: "var(--mute)" }}>
        {detail}
      </span>
    </div>
  );
}
