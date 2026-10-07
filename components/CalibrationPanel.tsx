import type { CalibrationLive } from "../lib/db/queries";
import { eur, eurFull, eurSigned } from "../lib/format";
import InfoDot from "./InfoDot";

/**
 * Kalibrierung: prüft die Kickbase-Regel (Start − Käufe + Verkäufe + Login-Bonus
 * + 1.000 €/Saisonpunkt + Korrekturen) am eigenen, exakten Kontostand und zeigt
 * die Zusammensetzung der Prämien. Dieselbe Regel rekonstruiert alle Gegner.
 * Server-Komponente.
 */
export default function CalibrationPanel({ data }: { data: CalibrationLive }) {
  const ok = data.delta != null && Math.abs(data.delta) < 1000;
  const small = data.delta != null && Math.abs(data.delta) <= 1_000_000;
  const label = ok ? "✓ Regel bestätigt" : small ? "Regel bestätigt (kleiner Rest)" : "Differenz";
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          Kalibrierung
          <InfoDot text="Prüft die Kontoregel an deinem echten Kickbase-Konto: Startbudget − Käufe + Verkäufe + Login-Bonus + 1.000 € je Saisonpunkt + Korrekturen (z. B. Strafen). Dieselbe Regel rekonstruiert die Kontostände aller Gegner. Ein kleiner Rest bei dir (z. B. nicht täglich eingeloggt) wird NICHT auf die Gegner übertragen." />
        </h3>
        <span className="count" style={{ color: ok || small ? "var(--gain)" : "var(--loss)" }}>
          {label}
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
          <span className="num" style={{ color: ok || small ? "var(--gain)" : "var(--loss)", fontWeight: 600 }}>
            {eurSigned(data.delta)}
          </span>
        </div>

        <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <div className="calib-row">
            <span className="muted">Login-Bonus</span>
            <span className="num">{eur(data.loginBonus)}</span>
          </div>
          <div className="calib-row">
            <span className="muted">Spieltagsbonus (1.000 €/Pkt)</span>
            <span className="num">{eur(data.pointsBonus)}</span>
          </div>
          {data.adjustment != null && data.adjustment !== 0 && (
            <div className="calib-row">
              <span className="muted">Korrekturen</span>
              <span className="num">{eurSigned(data.adjustment)}</span>
            </div>
          )}
          <div className="calib-row">
            <span className="muted">
              Prämien tatsächlich
              <InfoDot text="Was dein echtes Konto über die reinen Transfers hinaus erklärt: echt − Startbudget + Käufe − Verkäufe." />
            </span>
            <span className="num" title={eurFull(data.impliedPrizes)}>{eur(data.impliedPrizes)}</span>
          </div>
        </div>

        {data.hints.map((h, i) => (
          <p key={i} className="note" style={{ marginTop: 10, color: "var(--mute)" }}>
            {h}
          </p>
        ))}
      </div>
    </div>
  );
}
