import type { MarketPotential as PotData } from "../lib/db/queries";
import { eur, eurFull } from "../lib/format";

const pct0 = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);

/**
 * Markt-Potenzial: freier (noch nicht besessener) Marktwert vs. Kaufkraft der
 * Liga. Zeigt, wie viel Wert noch im Markt „schlummert". Server-Komponente.
 */
export default function MarketPotential({ data, showMoney }: { data: PotData; showMoney: boolean }) {
  if (data.poolMV == null) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Markt-Potenzial</h3>
        </div>
        <div style={{ padding: "16px 18px" }}>
          <div className="notice">
            Der Bundesliga-Gesamtpool wird gerade erfasst — nach dem nächsten Sammel-Lauf
            erscheint hier der freie Marktwert.
          </div>
        </div>
      </div>
    );
  }

  const ownedShare = data.ownedShare ?? 0;
  const freeShare = 1 - ownedShare;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Markt-Potenzial</h3>
        <span className="count">
          {data.teamCount}/18 Teams{data.teamCount < 18 ? " · unvollständig" : ""}
        </span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Freier Marktwert</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span
            className="num"
            style={{ fontSize: 24, fontWeight: 600, color: "var(--gain)" }}
            title={eurFull(data.freeMV)}
          >
            {eur(data.freeMV)}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            von {eur(data.poolMV)} Bundesliga-Gesamtwert · {pct0(ownedShare)} gebunden
          </span>
        </div>

        {/* Pool-Aufteilung: gebunden vs frei */}
        <div
          style={{
            display: "flex",
            height: 14,
            borderRadius: 7,
            overflow: "hidden",
            border: "1px solid var(--line)",
          }}
          title={`gebunden ${eur(data.ownedMV)} · frei ${eur(data.freeMV)}`}
        >
          <div style={{ width: `${(ownedShare * 100).toFixed(1)}%`, background: "var(--mute)" }} />
          <div style={{ width: `${(freeShare * 100).toFixed(1)}%`, background: "var(--gain)" }} />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            color: "var(--mute)",
            marginTop: 5,
          }}
        >
          <span>gebunden {eur(data.ownedMV)}</span>
          <span>frei {eur(data.freeMV)}</span>
        </div>

        {showMoney && (
          <div className="note" style={{ marginTop: 14, color: "var(--ink-soft)" }}>
            Kaufkraft der Liga (Kontostände): <strong>{eur(data.totalCash)}</strong>
            {data.coverage != null && (
              <>
                {" "}— deckt <strong>{pct0(data.coverage)}</strong> des freien Marktes.{" "}
                <span className="muted">
                  {data.coverage < 0.15
                    ? "Viel Potenzial, wenig Geld — der Markt ist kaum abschöpfbar."
                    : data.coverage > 0.6
                      ? "Viel Kaufkraft — die Liga kann den freien Markt stark abschöpfen."
                      : "Ausgewogenes Verhältnis von Angebot und Kaufkraft."}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
