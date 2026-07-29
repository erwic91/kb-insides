import Link from "next/link";
import type { ManagerTableRow, SquadLandscape } from "../lib/db/queries";
import { eur, eurFull, num, pct } from "../lib/format";
import InfoDot from "./InfoDot";

/**
 * Dashboard-Einblicke (Server-Komponenten, keine Interaktivität):
 *   MeinStanding    — Rang, Abstände, Max-Gebot-/Liquiditäts-Rang
 *   BedrohungsRadar — wer kann mich am Markt überbieten (Konto + Max-Gebot)
 *   SpielerLandschaft — Verteilung der Top-Spieler + eigene Top-Assets
 *   Formkurve       — Spieltagspunkte-Serie je Manager als Sparkline
 * Alle rechnen aus bereits geladenen Daten (ManagerTableRow / SquadLandscape).
 */

function href(base: string, leagueId: string): string {
  return `${base}?league=${encodeURIComponent(leagueId)}`;
}

// ---------- Mein Standing ----------

export function MeinStanding({
  rows,
  showMoney,
  leagueId,
}: {
  rows: ManagerTableRow[];
  showMoney: boolean;
  leagueId: string;
}) {
  const active = rows.filter((r) => r.active);
  const me = rows.find((r) => r.isMe);
  if (!me || active.length < 2) return null;

  const metric = (r: ManagerTableRow) =>
    showMoney ? (r.total ?? Number.NEGATIVE_INFINITY) : (r.points ?? Number.NEGATIVE_INFINITY);
  const fmt = (n: number | null) => (n == null ? "—" : showMoney ? eur(n) : num(n));

  const ranked = [...active].sort((a, b) => metric(b) - metric(a));
  const myRank = ranked.findIndex((r) => r.id === me.id) + 1;
  const above = myRank > 1 ? ranked[myRank - 2] : null;
  const below = myRank < ranked.length ? ranked[myRank] : null;
  const leader = ranked[0];
  const gapAbove = above ? metric(above) - metric(me) : null;
  const gapBelow = below ? metric(me) - metric(below) : null;
  const gapLeader = leader && leader.id !== me.id ? metric(leader) - metric(me) : null;

  const rankBy = (sel: (r: ManagerTableRow) => number | null) => {
    const arr = active.filter((r) => sel(r) != null).sort((a, b) => (sel(b) ?? 0) - (sel(a) ?? 0));
    const i = arr.findIndex((r) => r.id === me.id);
    return i >= 0 ? { rank: i + 1, of: arr.length } : null;
  };
  const maxBidRank = showMoney ? rankBy((r) => r.maxBid) : null;
  const liqRank = showMoney ? rankBy((r) => r.liquidity) : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          Mein Standing
          <InfoDot text="Dein Rang und die Abstände nach oben, nach unten und zum Führenden — in Budget-Ligen nach Gesamtwert (Konto + Kaderwert), sonst nach Punkten. Dazu dein Rang beim Maximalgebot und bei der Liquidität." />
        </h3>
        <span className="count">
          Rang {myRank} / {active.length}
        </span>
      </div>
      <div className="stand-grid">
        <div className="stand-cell">
          <div className="label">Nach oben</div>
          <div className="value xs">{above ? fmt(gapAbove) : "Spitze"}</div>
          <div className="hint">{above ? above.name : "du führst"}</div>
        </div>
        <div className="stand-cell">
          <div className="label">Nach unten</div>
          <div className="value xs">{below ? fmt(gapBelow) : "Schlusslicht"}</div>
          <div className="hint">{below ? below.name : "niemand dahinter"}</div>
        </div>
        <div className="stand-cell">
          <div className="label">Zum Führenden</div>
          <div className="value xs">{gapLeader == null ? "—" : fmt(gapLeader)}</div>
          <div className="hint">{gapLeader == null ? "das bist du" : leader!.name}</div>
        </div>
        {showMoney && (
          <>
            <div className="stand-cell">
              <div className="label">Max-Gebot-Rang</div>
              <div className="value xs">
                {maxBidRank ? `${maxBidRank.rank} / ${maxBidRank.of}` : "—"}
              </div>
              <div className="hint" title={eurFull(me.maxBid)}>
                {me.maxBid != null ? eur(me.maxBid) : "kein Gebot"}
              </div>
            </div>
            <div className="stand-cell">
              <div className="label">Liquiditäts-Rang</div>
              <div className="value xs">
                {liqRank ? `${liqRank.rank} / ${liqRank.of}` : "—"}
              </div>
              <div className="hint">{me.liquidity != null ? `${pct(me.liquidity)} liquide` : "—"}</div>
            </div>
            <div className="stand-cell">
              <div className="label">Gesamtwert</div>
              <div className="value xs" title={eurFull(me.total)}>
                {eur(me.total)}
              </div>
              <div className="hint">Konto + Kaderwert</div>
            </div>
          </>
        )}
      </div>
      <div className="panel-foot">
        <Link href={href("/liga", leagueId)} className="linklike">
          Ganze Rangliste →
        </Link>
      </div>
    </div>
  );
}

// ---------- Bedrohungs-Radar ----------

export function BedrohungsRadar({
  rows,
  showMoney,
  leagueId,
}: {
  rows: ManagerTableRow[];
  showMoney: boolean;
  leagueId: string;
}) {
  if (!showMoney) return null;
  const me = rows.find((r) => r.isMe);
  const rivals = rows
    .filter((r) => !r.isMe && r.active && r.maxBid != null)
    .sort((a, b) => (b.maxBid ?? 0) - (a.maxBid ?? 0));
  if (rivals.length === 0) return null;

  const myBid = me?.maxBid ?? null;
  const stronger = myBid != null ? rivals.filter((r) => (r.maxBid ?? 0) > myBid).length : null;
  const top = rivals.slice(0, 5);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          Bedrohungs-Radar
          <InfoDot text="Deine Gegner nach Maximalgebot sortiert (Konto + 33 % × Kaderwert). Das ▲ markiert alle, die höher bieten können als du — die dich also bei einem Spieler überbieten könnten. Gegner-Konten sind rekonstruiert (inkl. geschätztem Login-Bonus)." />
        </h3>
        <span className="count">
          {stronger != null ? `${stronger} über dir` : `${rivals.length} Gegner`}
        </span>
      </div>
      <div>
        {top.map((r) => {
          const outbids = myBid != null && (r.maxBid ?? 0) > myBid;
          return (
            <div className="mrow" key={r.id}>
              <span>
                <Link href={href(`/manager/${r.id}`, leagueId)} className="nm linklike">
                  {r.name}
                </Link>
                <span className="muted sm"> · Konto {eur(r.cash)}</span>
              </span>
              <span className="num sm" style={{ color: outbids ? "var(--signal)" : "var(--mute)" }}>
                {eur(r.maxBid)}
                {outbids ? " ▲" : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="panel-foot">
        {myBid != null ? (
          <span className="muted sm">
            Dein Max-Gebot: <strong>{eur(myBid)}</strong> · ▲ = kann dich überbieten
          </span>
        ) : (
          <span className="muted sm">Dein Max-Gebot ist noch nicht bekannt.</span>
        )}
      </div>
    </div>
  );
}

// ---------- Spieler-Landschaft ----------

export function SpielerLandschaft({
  data,
  leagueId,
}: {
  data: SquadLandscape;
  leagueId: string;
}) {
  const { starHolders, myAssets, myStars, topN } = data;
  if (starHolders.length === 0) return null;
  const maxCount = starHolders[0]?.count ?? 1;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          Spieler-Landschaft
          <InfoDot text={`Wie sich die punktbesten Spieler der Liga (Top ${topN}) auf die Manager verteilen — wer die meisten Top-Spieler hält. Darunter deine eigenen wertvollsten/punktbesten Spieler.`} />
        </h3>
        <span className="count">Top {topN}</span>
      </div>
      <div className="card-pad">
        <p className="label" style={{ marginBottom: 8 }}>
          Wer hält die Stars {data.hasMe ? `· du: ${myStars} von ${topN}` : ""}
        </p>
        {starHolders.slice(0, 8).map((h) => (
          <div className="bar-row" key={h.managerId}>
            <div className="name">
              <Link href={href(`/manager/${h.managerId}`, leagueId)}>{h.managerName}</Link>
              {h.isMe && <span className="badge me" style={{ marginLeft: 6 }}>du</span>}
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${(h.count / maxCount) * 100}%` }}
              />
            </div>
            <div className="amt">{h.count}</div>
          </div>
        ))}
      </div>
      {myAssets.length > 0 && (
        <>
          <div className="panel-head" style={{ borderTop: "1px solid var(--line)" }}>
            <h3>Deine Top-Assets</h3>
            <span className="count">{myAssets.length}</span>
          </div>
          <div>
            {myAssets.map((a) => (
              <div className="mrow" key={a.playerId}>
                <span>
                  <span className="pos-chip">{a.position ?? "—"}</span>
                  <Link href={href(`/player/${a.playerId}`, leagueId)} className="nm linklike">
                    {a.name}
                  </Link>
                </span>
                <span className="num sm" style={{ color: "var(--mute)" }}>
                  {num(a.points)} Pkt · {eur(a.marketValue)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Formkurve ----------

function Sparkline({
  series,
  highlight = false,
  width = 132,
  height = 30,
}: {
  series: (number | null)[];
  highlight?: boolean;
  width?: number;
  height?: number;
}) {
  const pts = series
    .map((v, i) => ({ i, v }))
    .filter((p): p is { i: number; v: number } => p.v != null);
  if (pts.length < 2) return <span className="muted sm">zu wenig Daten</span>;

  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = series.length;
  const PAD = 3;
  const x = (i: number) => PAD + (i / Math.max(1, n - 1)) * (width - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (height - 2 * PAD);
  const d = pts
    .map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1]!;
  const stroke = highlight ? "var(--signal)" : "var(--ink)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: "block" }}
      role="img"
      aria-label="Formkurve"
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={highlight ? 2 : 1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={highlight ? 1 : 0.7}
      />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.2} fill={stroke} />
    </svg>
  );
}

export function Formkurve({
  rows,
  leagueId,
}: {
  rows: ManagerTableRow[];
  leagueId: string;
}) {
  const withSeries = rows
    .filter((r) => r.active && r.pointsSeries)
    .map((r) => {
      const series = r.pointsSeries as (number | null)[];
      const real = series.filter((v): v is number => v != null);
      const last = real.length > 0 ? real[real.length - 1]! : null;
      return { r, series, real, last };
    })
    .filter((x) => x.real.length >= 2);
  if (withSeries.length === 0) return null;

  // Nach Saisonpunkten sortiert, eigener Manager oben angepinnt.
  withSeries.sort((a, b) => (b.r.points ?? -1) - (a.r.points ?? -1));
  const me = withSeries.find((x) => x.r.isMe);
  const rest = withSeries.filter((x) => !x.r.isMe).slice(0, me ? 7 : 8);
  const list = me ? [me, ...rest] : rest;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          Formkurve
          <InfoDot text="Punkte je Spieltag pro Manager als Mini-Verlauf — zeigt, wer gerade in Form ist. Sortiert nach Saisonpunkten, dein eigener Verlauf ist hervorgehoben. Der Wert rechts ist der jüngste Spieltag." />
        </h3>
        <span className="count">Punkte je Spieltag</span>
      </div>
      <div>
        {list.map(({ r, series, last }) => (
          <div className="form-row" key={r.id}>
            <span className="form-name">
              <Link href={href(`/manager/${r.id}`, leagueId)} className={r.isMe ? "nm" : "nm"}>
                {r.name}
              </Link>
              {r.isMe && <span className="badge me" style={{ marginLeft: 6 }}>du</span>}
            </span>
            <span className="form-spark">
              <Sparkline series={series} highlight={r.isMe} />
            </span>
            <span className="num sm form-last" style={{ color: "var(--mute)" }}>
              {num(last)}
            </span>
          </div>
        ))}
      </div>
      <div className="panel-foot">
        <span className="muted sm">Letzter Wert = jüngster Spieltag.</span>
      </div>
    </div>
  );
}
