import Link from "next/link";
import type { PanicBarometer as PanicData } from "../lib/db/queries";
import { eurFull } from "../lib/format";

/** Stimmungsband aus dem Panik-Score (0..1). */
function mood(score: number): { label: string; color: string } {
  if (score >= 0.75) return { label: "Panik", color: "var(--loss)" };
  if (score >= 0.5) return { label: "Überhitzt", color: "#d1560b" };
  if (score >= 0.25) return { label: "Erhöht", color: "var(--warn)" };
  return { label: "Ruhig", color: "var(--gain)" };
}

const fmtPct1 = (x: number) =>
  `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")} %`;

/**
 * Panik-Barometer: Tacho für die Overpay-Stimmung der Liga. Grün = ruhig,
 * Rot = überhitzt/panisch. Server-Komponente.
 */
export default function PanicBarometer({ data, leagueId }: { data: PanicData; leagueId: string }) {
  const href = (b: string) => `${b}?league=${encodeURIComponent(leagueId)}`;
  const enough = data.count >= 3 && data.ratio != null;
  const m = mood(data.score);
  const markerLeft = `${Math.max(0, Math.min(100, data.score * 100)).toFixed(1)}%`;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Panik-Barometer</h3>
        <span className="count">
          letzte {data.windowDays} Tage · {data.count} Käufe
        </span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        {!enough ? (
          <div className="notice">
            Noch zu wenig Transferdaten mit Marktwert-Basis. Das Barometer greift, sobald mehr
            Käufe erfasst sind (vor allem ab Saisonstart, wenn wieder viel transferiert wird).
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <span
                style={{
                  fontFamily: "var(--display)",
                  fontVariationSettings: '"wght" 800',
                  fontWeight: 800,
                  fontSize: 22,
                  textTransform: "uppercase",
                  color: m.color,
                }}
              >
                {m.label}
              </span>
              <span className="num" style={{ color: m.color, fontWeight: 600 }}>
                {fmtPct1(data.ratio!)}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>Ø über Marktwert (wertgewichtet)</span>
            </div>

            {/* Skala grün → rot mit Markierung */}
            <div
              style={{
                position: "relative",
                height: 14,
                borderRadius: 7,
                background: "linear-gradient(90deg, var(--gain) 0%, var(--warn) 50%, var(--loss) 100%)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -5,
                  bottom: -5,
                  left: `calc(${markerLeft} - 1.5px)`,
                  width: 3,
                  background: "var(--ink)",
                  borderRadius: 2,
                }}
              />
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
              <span>ruhig</span>
              <span>überhitzt</span>
              <span>Panik</span>
            </div>

            {data.avgOverpay != null && (
              <div className="note" style={{ marginTop: 10, color: "var(--mute)" }}>
                Ø {data.avgOverpay >= 0 ? "+" : "−"}
                {eurFull(Math.abs(data.avgOverpay))} Aufpreis je Kauf
              </div>
            )}

            {data.topBuys.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>
                  Größte Panikkäufe
                </div>
                {data.topBuys.map((b, i) => (
                  <div className="mrow" key={`${b.playerId}-${i}`}>
                    <span className="nm">
                      <Link href={href(`/player/${b.playerId}`)} className="linklike">
                        {b.playerName}
                      </Link>{" "}
                      <span className="muted">· {b.managerName}</span>
                    </span>
                    <span
                      className="num sm"
                      style={{ color: "var(--loss)" }}
                      title={`${eurFull(b.price)} gezahlt · Marktwert ${eurFull(b.mv)}`}
                    >
                      {fmtPct1(b.overpayPct)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
