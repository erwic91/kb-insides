import Link from "next/link";
import {
  resolveLeague,
  getBidAdvisor,
  getPanicBarometers,
  getMarketPotential,
  PANIC_WINDOWS,
} from "../../lib/db/queries";
import { computeAutoTargets } from "../../lib/compute/autotargets";
import { eur } from "../../lib/format";
import MarketRadar from "../../components/MarketRadar";
import PanicBarometer from "../../components/PanicBarometer";
import MarketPotential from "../../components/MarketPotential";

export const dynamic = "force-dynamic";

const REASON_STYLE: Record<string, { bg: string; color: string }> = {
  "unter MW": { bg: "rgba(15,122,90,.12)", color: "var(--gain)" },
  steigend: { bg: "rgba(15,122,90,.12)", color: "var(--gain)" },
  "freie Bahn": { bg: "rgba(255,70,0,.12)", color: "var(--signal)" },
  gewinnbar: { bg: "rgba(255,70,0,.12)", color: "var(--signal)" },
};

export default async function MarktPage({
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

  const { listings, advice } = await getBidAdvisor(league);
  const [panic, potential] = await Promise.all([
    getPanicBarometers(league),
    getMarketPotential(league),
  ]);
  const showBids = league.startBudget > 0;
  const adviceObj = Object.fromEntries(advice);
  const href = (base: string) => `${base}?league=${encodeURIComponent(league.id)}`;

  const autoTargets = showBids
    ? computeAutoTargets(
        listings.map((l) => ({
          playerId: l.playerId,
          playerName: l.playerName,
          position: l.position,
          marketValue: l.marketValue,
          price: l.price,
          trend: l.trend,
          verdict: advice.get(l.playerId)?.verdict ?? "unknown",
        })),
      )
    : [];

  return (
    <main className="wrap">
      <div className="crumb">{league.name} · Marktradar</div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Transfermarkt</span>
          <h1>Marktradar</h1>
          <p className="sub">
            {league.name} · {listings.length} Spieler am Markt
          </p>
        </div>
      </div>

      <div className="g-2" style={{ marginBottom: 16 }}>
        <PanicBarometer
          set={panic.byWindow}
          series={panic.series}
          windows={PANIC_WINDOWS}
          leagueId={league.id}
        />
        {potential && <MarketPotential data={potential} showMoney={showBids} />}
      </div>

      {autoTargets.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <h3>Auto-Targets · Kaufempfehlungen</h3>
            <span className="count">{autoTargets.length}</span>
          </div>
          <div>
            {autoTargets.map((t) => (
              <div className="mrow" key={t.playerId}>
                <span>
                  <span className="pos-chip">{t.position ?? "—"}</span>
                  <Link href={href(`/player/${t.playerId}`)} className="nm linklike">
                    {t.playerName}
                  </Link>
                  <span className="muted sm">
                    {" "}
                    · {eur(t.price)} / MW {eur(t.marketValue)}
                  </span>
                </span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {t.reasons.map((r) => {
                    const s = REASON_STYLE[r] ?? { bg: "var(--chalk)", color: "var(--mute)" };
                    return (
                      <span key={r} className="pill" style={{ background: s.bg, color: s.color }}>
                        {r}
                      </span>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <MarketRadar
        listings={listings}
        advice={adviceObj}
        showBids={showBids}
        leagueId={league.id}
      />
    </main>
  );
}
