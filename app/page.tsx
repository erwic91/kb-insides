import type { ReactNode } from "react";
import {
  resolveLeague,
  getManagerTable,
  getCalibration,
  type ManagerTableRow,
} from "../lib/db/queries";
import { eur, eurSigned, num, pct } from "../lib/format";
import RefreshButton from "../components/RefreshButton";
import ManagerTable from "../components/ManagerTable";
import TrackingControl from "../components/TrackingControl";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
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
          <p>
            Sobald der Collector einmal gelaufen ist, erscheinen hier die Ligen.
            Prüfe die Supabase-Variablen und löse einmal <code>/api/cron/collect</code> aus.
          </p>
        </div>
      </main>
    );
  }

  const { day, rows } = await getManagerTable(league);
  const calibration = await getCalibration(league);
  // Absolute Konto-Rekonstruktion braucht eine bekannte Budget-Basis: nur in
  // Manager-Ligen (gpm:2) OHNE Tracking-Cutoff (sonst nur Teilhistorie).
  const showMoney = league.gameMode === 2 && !league.trackingSince;
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

      <TrackingControl leagueId={league.id} current={league.trackingSince} />

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
          {league.gameMode !== 2 ? (
            <>
              <b>{league.name}</b> ist eine Classic-Liga (Draft-Startkader).
            </>
          ) : (
            <>
              <b>{league.name}</b> hat einen Tracking-Startpunkt (nur Teilhistorie).
            </>
          )}{" "}
          Kontostand, Maximalgebot &amp; Liquidität brauchen eine bekannte Budget-Basis und
          werden daher ausgeblendet — angezeigt werden nur API-exakte Werte.
        </div>
      )}

      <div className="tiles4" style={{ marginBottom: 24 }}>
        <div className="card card-pad tile">
          <div className="label">Kaderwert-Spitze</div>
          <div className="value sm">{eur(leaderTv?.teamValue ?? null)}</div>
          <div className="hint">{leaderTv?.name ?? "—"}</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Punkte-Spitze</div>
          <div className="value sm">{num(leaderPts?.points ?? null)}</div>
          <div className="hint">{leaderPts?.name ?? "—"}</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Ø Kaderwert (aktiv)</div>
          <div className="value sm">{eur(avgTv)}</div>
          <div className="hint">über {active.length} Manager</div>
        </div>
        {showMoney && (
          <div className="card card-pad tile">
            <div className="label">Dein Konto (rekonstruiert)</div>
            <div className="value sm">{eur(me?.cash ?? null)}</div>
            <div className="hint">
              {me?.maxBid != null ? `Max. Gebot ${eur(me.maxBid)}` : "aus Transfers"}
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Alle Manager</h2>
          <span className="note">Spaltenkopf klicken zum Sortieren</span>
        </div>
        <ManagerTable rows={rows} gameMode={league.gameMode} leagueId={league.id} />
      </div>

      {(verkaufsdruck.length > 0 || schlaefer.length > 0) && (
        <div className="tiles4">
          {verkaufsdruck.length > 0 && (
            <InsightTile title="Verkaufsdruck" sub="niedrigste Liquidität">
              {verkaufsdruck.map((r) => (
                <Trow key={r.id} name={r.name} detail={`${pct(r.liquidity)} liquide · ${eur(r.cash)}`} />
              ))}
            </InsightTile>
          )}
          {schlaefer.length > 0 && (
            <InsightTile title="Schläfer" sub="längste Transfer-Pause">
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
        Transferhistorie rekonstruiert und nur in Manager-Ligen (gpm:2) angezeigt. Kaderwert,
        Punkte, Kadergröße und Aktivität kommen direkt aus der API.
      </div>
    </main>
  );
}

function InsightTile({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
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
