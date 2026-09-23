import type { CalibrationLive } from "../lib/db/queries";
import { eur, eurFull, eurSigned } from "../lib/format";
import InfoDot from "./InfoDot";

/**
 * Kalibrierung: berechneter vs. echter Kontostand des eigenen Managers plus die
 * Methode, mit der die Prämien für ALLE Manager bestimmt werden — exakt über
 * Kickbases `prft` (gegen den echten Kontostand validiert) oder kalibriert über
 * die aus dem Anker rückgerechnete €/Punkt-Rate. Server-Komponente.
 */
const MODE_LABEL: Record<string, string> = {
  "prft-full": "✓ exakt (Kickbase-Prämien)",
  "prft-plusLogin": "✓ exakt (Kickbase-Prämien + Login)",
  calibrated: "kalibriert (€/Punkt)",
  estimate: "Schätzung",
};

export default function CalibrationPanel({ data }: { data: CalibrationLive }) {
  const exact = data.mode === "prft-full" || data.mode === "prft-plusLogin";
  const ok = data.delta != null && Math.abs(data.delta) < 1000;
  const good = exact || data.mode === "calibrated";
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          Kalibrierung
          <InfoDot text="Vergleich deines berechneten Kontostands mit dem echten Wert aus Kickbase — und die Methode, mit der die Prämien (Login-Bonus + Preisgeld/Boni) für alle Manager bestimmt werden. »Exakt« = Kickbases eigener Prämienwert (prft) deckt sich mit deinem echten Konto und gilt damit für jeden Manager. »Kalibriert« = die Prämie-pro-Punkt-Rate wird aus deinem exakten Konto rückgerechnet und je Gegner mit seinen Punkten skaliert." />
        </h3>
        <span className="count" style={{ color: good ? "var(--gain)" : "var(--warn)" }}>
          {MODE_LABEL[data.mode ?? "estimate"] ?? "—"}
        </span>
      </div>
      <div style={{ padding: "14px 18px" }}>
        <div className="calib-row">
          <span className="muted">Berechnet</span>
          <span className="num" title={eurFull(data.reconstructed)}>{eur(data.reconstructed)}</span>
        </div>
        <div className="calib-row">
          <span className="muted">Echt (Kickbase)</span>
          <span className="num" title={eurFull(data.actual)}>{eur(data.actual)}</span>
        </div>
        <div className="calib-row calib-total">
          <span>Differenz</span>
          <span className="num" style={{ color: ok ? "var(--gain)" : "var(--loss)", fontWeight: 600 }}>
            {eurSigned(data.delta)}
          </span>
        </div>

        {(data.impliedPrizes != null || data.ratePerPoint != null) && (
          <div className="calib-row" style={{ marginTop: 8, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <span className="muted">
              Prämien gesamt
              <InfoDot text="Alles, was dein echtes Konto über die reinen Transfers hinaus erklärt (echt − Startbudget + Käufe − Verkäufe): Login-Bonus + Preisgeld/Boni. Das ist die Summe, die das Modell auf alle Manager verteilt." />
            </span>
            <span className="num" title={eurFull(data.impliedPrizes)}>
              {eur(data.impliedPrizes)}
              {data.mode === "calibrated" && data.ratePerPoint != null
                ? ` · ≈ ${eur(Math.round(data.ratePerPoint))}/Pkt`
                : ""}
            </span>
          </div>
        )}

        {data.hints.map((h, i) => (
          <p key={i} className="note" style={{ marginTop: 10, color: "var(--mute)" }}>
            {h}
          </p>
        ))}
      </div>
    </div>
  );
}
