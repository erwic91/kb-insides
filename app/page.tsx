import type { ReactNode } from "react";
import {
  resolveLeague,
  getManagerTable,
  getCalibration,
  getMarket,
  getSquadLandscape,
  getMyAccess,
  type ManagerTableRow,
} from "../lib/db/queries";
import { computeBidAdvice } from "../lib/compute/bidadvisor";
import { eur, eurFull, eurSigned, num, pct } from "../lib/format";
import RefreshButton from "../components/RefreshButton";
import InfoDot from "../components/InfoDot";
import ManagerTable from "../components/ManagerTable";
import LeagueSettings from "../components/LeagueSettings";
import DashboardFavorites from "../components/DashboardFavorites";
import {
  MeinStanding,
  BedrohungsRadar,
  SpielerLandschaft,
  Formkurve,
} from "../components/Insights";
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

  const { day, rows } = await getManagerTable(league);
  const [calibration, marketListings, landscape] = await Promise.all([
    getCalibration(league),
    getMarket(league),
    getSquadLandscape(league),
  ]);
  // Konto/Maximalgebot sind rekonstruierbar, sobald eine Budget-Basis (Start-
  // Budget) konfiguriert ist. Gerechnet wird ab dem Startzeitpunkt (siehe
  // getManagerTable). Gilt für beide Modi (Draft-Kader ist „gratis").
  const showMoney = league.startBudget > 0;
  const active = rows.filter((r) => r.active);
  const me = rows.find((r) => r.isMe);

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

  // Bid-Advisor: Marktchancen (freie Bahn / gewinnbar) aus den Max-Geboten.
  const advice = computeBidAdvice(
    rows.map((r) => ({ id: r.id, name: r.name, isMe: r.isMe, maxBid: r.maxBid })),
    marketListings.map((l) => ({
      playerId: l.playerId,
      floor: l.price ?? l.marketValue ?? null,
      offeredBy: l.offeredBy,
    })),
  );
  const opportunities = showMoney
    ? marketListings
        .map((l) => ({ l, a: advice.get(l.playerId)! }))
        .filter((x) => x.a && (x.a.verdict === "free" || x.a.verdict === "winnable"))
        .sort((x, y) => {
          const rank = (v: (typeof x)["a"]) => (v.verdict === "free" ? 0 : 1);
          if (rank(x.a) !== rank(y.a)) return rank(x.a) - rank(y.a);
          return (x.a.mustBid ?? 0) - (y.a.mustBid ?? 0);
        })
        .slice(0, 6)
    : [];
  const href = (base: string) => `${base}?league=${encodeURIComponent(league.id)}`;

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
        <RefreshButton leagueId={league.id} />
      </div>

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
      </div>

      <div className="g-2">
        <MeinStanding rows={rows} showMoney={showMoney} leagueId={league.id} />
        <BedrohungsRadar rows={rows} showMoney={showMoney} leagueId={league.id} />
      </div>

      <div className="g-2">
        <DashboardFavorites listings={marketListings} leagueId={league.id} />
        <div className="panel">
          <div className="panel-head">
            <h3>
              Marktchancen · Bid-Advisor
              <InfoDot text={'Vergleicht das Mindestgebot jedes Marktspielers mit dem stärksten Max-Gebot deiner Gegner. „Freie Bahn" = kein Gegner kann mitbieten; sonst steht dort, wie hoch du mindestens bieten musst (≥), um den stärksten Gegner zu überbieten.'} />
            </h3>
            {showMoney && <span className="count">{opportunities.length}</span>}
          </div>
          <div>
            {!showMoney ? (
              <div className="mrow muted">
                Gebots-Tipps erscheinen, sobald Start-Budget/Reset gesetzt ist.
              </div>
            ) : opportunities.length === 0 ? (
              <div className="mrow muted">Gerade keine klaren Chancen am Markt.</div>
            ) : (
              opportunities.map(({ l, a }) => (
                <div className="mrow" key={l.playerId}>
                  <span>
                    <span className="pos-chip">{l.position ?? "—"}</span>
                    <Link href={href(`/player/${l.playerId}`)} className="nm linklike">
                      {l.playerName}
                    </Link>
                    <span className="muted sm"> · MW {eur(l.marketValue)}</span>
                  </span>
                  {a.verdict === "free" ? (
                    <span
                      className="pill"
                      style={{ background: "rgba(15,122,90,.12)", color: "var(--gain)" }}
                    >
                      freie Bahn
                    </span>
                  ) : (
                    <span className="num sm" style={{ color: "var(--signal)" }}>
                      ≥ {eur(a.mustBid)}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
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
