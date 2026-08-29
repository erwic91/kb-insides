import {
  resolveLeague,
  getManagerSeries,
  getOverpayByManager,
  getManagerTable,
} from "../../lib/db/queries";
import { eur, eurSigned, num } from "../../lib/format";
import KaderwertChart from "../../components/KaderwertChart";
import BarChartH from "../../components/BarChartH";
import InfoDot from "../../components/InfoDot";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
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
          <p>Über „Aktualisieren" auf dem Dashboard Daten anfordern.</p>
        </div>
      </main>
    );
  }

  const [series, overpay, table] = await Promise.all([
    getManagerSeries(league),
    getOverpayByManager(league),
    getManagerTable(league),
  ]);
  const active = table.rows.filter((r) => r.active);

  // KPIs
  const overpayWithData = overpay.filter((o) => o.count > 0);
  const ligaOverpay =
    overpayWithData.length > 0
      ? Math.round(overpayWithData.reduce((s, o) => s + o.avg, 0) / overpayWithData.length)
      : null;
  const efficiency = active
    .filter((r) => r.teamValue != null && r.teamValue > 0 && r.points != null)
    .map((r) => ({ name: r.name, v: (r.points as number) / ((r.teamValue as number) / 1e6) }))
    .sort((a, b) => b.v - a.v);
  const effLeader = efficiency[0] ?? null;
  const mostActive = [...active].sort((a, b) => (b.transferCount ?? 0) - (a.transferCount ?? 0))[0] ?? null;
  const richest = [...active].sort((a, b) => (b.teamValue ?? 0) - (a.teamValue ?? 0))[0] ?? null;

  return (
    <main className="wrap">
      <div className="crumb">{league.name} · Analytics</div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Auswertung</span>
          <h1>Analytics</h1>
          <p className="sub">{league.name} · Verläufe, Overpay & Kennzahlen</p>
        </div>
      </div>

      {/* KPI-Kacheln */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card card-pad tile">
          <div className="label">Ø Overpay Liga</div>
          <div className="value sm" style={{ color: (ligaOverpay ?? 0) > 0 ? "var(--loss)" : "var(--gain)" }}>
            {ligaOverpay != null ? eurSigned(ligaOverpay) : "—"}
          </div>
          <div className="hint">Aufpreis über MW je Kauf</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Effizienz-Leader</div>
          <div className="value sm">{effLeader ? effLeader.v.toFixed(1) : "—"}</div>
          <div className="hint">{effLeader ? `${effLeader.name} · Punkte/Mio` : "—"}</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Aktivster Manager</div>
          <div className="value sm">{mostActive ? num(mostActive.transferCount) : "—"}</div>
          <div className="hint">{mostActive ? `${mostActive.name} · Transfers` : "—"}</div>
        </div>
        <div className="card card-pad tile">
          <div className="label">Wertvollster Kader</div>
          <div className="value sm">{richest ? eur(richest.teamValue) : "—"}</div>
          <div className="hint">{richest ? richest.name : "—"}</div>
        </div>
      </div>

      {/* Verlauf */}
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h3>
            Verlauf über Zeit
            <InfoDot text="Tägliche Entwicklung je Manager aus den nächtlichen Snapshots. Umschaltbar zwischen Kaderwert, Gesamtwert (Kaderwert + Konto), Kontostand und Punkten. Manager anklicken zum Einfärben." />
          </h3>
          <span className="count">{series.managers.length} Manager</span>
        </div>
        <div className="card-pad">
          <KaderwertChart data={series} />
        </div>
      </section>

      {/* Ø Overpay je Manager */}
      <section className="panel">
        <div className="panel-head">
          <h3>
            Ø Overpay je Manager
            <InfoDot text="Durchschnittlich gezahlter Aufpreis über dem Marktwert am Kauftag. Rot = über Marktwert gekauft, grün = darunter. bewertet X von Y = auf wie vielen Käufen der Schnitt beruht (nur Käufe mit bekannter Marktwert-Basis)." />
          </h3>
        </div>
        <div className="card-pad">
          <BarChartH
            items={overpay.map((o) => ({
              label: o.managerName,
              value: o.avg,
              sub: `bewertet ${o.count} von ${o.buysTotal}`,
            }))}
            format={(v) => eurSigned(v)}
          />
        </div>
      </section>
    </main>
  );
}
