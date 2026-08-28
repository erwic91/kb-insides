import type { CalibrationLive } from "../lib/db/queries";
import { eur, eurFull, eurSigned } from "../lib/format";
import InfoDot from "./InfoDot";

/**
 * Kalibrierung: berechneter vs. echter Kontostand des eigenen Managers. Steht
 * die Differenz auf 0 €, ist die Rekonstruktionsformel bewiesen — der einzige
 * harte Beleg, dass die Gegner-Zahlen stimmen. Server-Komponente.
 */
export default function CalibrationPanel({ data }: { data: CalibrationLive }) {
  const ok = data.delta != null && Math.abs(data.delta) < 1000;
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          Kalibrierung
          <InfoDot text="Vergleich deines berechneten Kontostands (Formel) mit dem echten Wert aus Kickbase. Differenz 0 € = die Formel stimmt und gilt damit auch für alle Gegner. Bei einer Differenz nur für deinen eigenen Datensatz sichtbar — Fehler, die nur Gegner betreffen (fehlende Strafen etc.), bleiben unentdeckt." />
        </h3>
        <span className="count" style={{ color: ok ? "var(--gain)" : "var(--loss)" }}>
          {ok ? "✓ Formel bestätigt" : "Differenz"}
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
        {ok ? (
          <p className="note" style={{ marginTop: 10, color: "var(--mute)" }}>
            ✓ Deckt sich mit dem echten Konto — die Formel gilt damit auch für alle Gegner.
          </p>
        ) : (
          data.hints.map((h, i) => (
            <p key={i} className="note" style={{ marginTop: 10, color: "var(--mute)" }}>
              {h}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
