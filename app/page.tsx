import Link from "next/link";
import {
  resolveLeague,
  getManagerTable,
  getCalibration,
  type ManagerTableRow,
} from "../lib/db/queries";
import { eur, eurFull, eurSigned, num } from "../lib/format";
import RefreshButton from "../components/RefreshButton";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function leagueHref(base: string, leagueId: string): string {
  return `${base}?league=${encodeURIComponent(leagueId)}`;
}

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
            Sobald der Collector einmal gelaufen ist (<code>/api/cron/collect</code>),
            erscheinen hier die Ligen. Prüfe <code>KICKBASE_LEAGUE_IDS</code> und die
            Supabase-Variablen.
          </p>
        </div>
      </main>
    );
  }

  const { day, rows } = await getManagerTable(league);
  const calibration = await getCalibration(league);
  const active = rows.filter((r) => r.active);
  const leaderTv = [...active].sort((a, b) => (b.teamValue ?? 0) - (a.teamValue ?? 0))[0];
  const leaderPts = active[0];
  const avgTv =
    active.length > 0
      ? Math.round(active.reduce((s, r) => s + (r.teamValue ?? 0), 0) / active.length)
      : null;
  const me = rows.find((r) => r.isMe);

  return (
    <main className="page">
      <div
        className="page-head"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}
      >
        <div>
          <h1>Dashboard</h1>
          <p className="sub">
            {league.name}
            {day != null ? ` · Spieltag ${day}` : ""} · {active.length} aktive von{" "}
            {rows.length} Managern
          </p>
        </div>
        <RefreshButton leagueId={league.id} />
      </div>

      {calibration && (
        <div
          className={`notice ${calibration.delta === 0 ? "" : "warn"}`}
          style={{ marginBottom: 18, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}
        >
          {calibration.delta === 0 ? (
            <span className="badge accent">bestätigt</span>
          ) : (
            <span className="badge">geschätzt</span>
          )}
          <span>
            Selbstkalibrierung: Rekonstruktion <strong>{eur(calibration.myReconstructed)}</strong>{" "}
            vs. <code>/me/budget</code> <strong>{eur(calibration.myActual)}</strong> · Δ{" "}
            <strong>{eurSigned(calibration.delta)}</strong>
            {calibration.delta !== 0 &&
              " — offene Posten: Erfolgsprämien + vollständige Transfers (Checkpoint C)."}
          </span>
        </div>
      )}

      <div className="grid grid-4">
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
        <div className="card card-pad tile">
          <div className="label">Dein Konto (rekonstruiert)</div>
          <div className="value sm">{eur(me?.cash ?? null)}</div>
          <div className="hint">
            {me?.maxBid != null ? `Max. Gebot ${eur(me.maxBid)}` : "aus Transfers"}
          </div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Manager</h2>
          <span className="note">sortiert nach Saisonpunkten</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="l">#</th>
                <th className="l">Manager</th>
                <th>Kaderwert</th>
                <th>Punkte</th>
                <th>Serie</th>
                <th>Konto</th>
                <th>Max. Gebot</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <ManagerRow key={r.id} row={r} rank={i + 1} leagueId={league.id} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="l muted" style={{ padding: 24 }}>
                    Keine Snapshots für diese Liga. Collector einmal laufen lassen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          <strong>Konto</strong> &amp; <strong>Max. Gebot</strong> erscheinen je Manager,
          sobald dessen Transfers gesammelt sind (Kontorekonstruktion). Euro-genaue
          Kalibrierung folgt in einer laufenden Saison — siehe README / Checkpoint C.
        </p>
      </section>
    </main>
  );
}

function ManagerRow({
  row,
  rank,
  leagueId,
}: {
  row: ManagerTableRow;
  rank: number;
  leagueId: string;
}) {
  return (
    <tr>
      <td className="l rank">{row.active ? rank : "—"}</td>
      <td className="l">
        <div className="mgr">
          <span className="avatar">{initials(row.name)}</span>
          <Link href={leagueHref(`/manager/${row.id}`, leagueId)}>{row.name}</Link>
          {row.isMe && <span className="badge me">du</span>}
          {!row.active && <span className="badge inactive">inaktiv</span>}
        </div>
      </td>
      <td title={eurFull(row.teamValue)}>{eur(row.teamValue)}</td>
      <td>{num(row.points)}</td>
      <td className="muted">{row.streak ?? "—"}</td>
      <td title={row.cash != null ? eurFull(row.cash) : undefined}>{eur(row.cash)}</td>
      <td className={row.maxBid != null ? "pos" : ""}>{eur(row.maxBid)}</td>
    </tr>
  );
}
