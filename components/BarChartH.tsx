/**
 * Schlichtes horizontales Balkendiagramm. Balkenlänge ∝ |Wert| / max|Wert|.
 * Positiv rot, negativ grün (für Overpay: über MW = rot/schlecht, unter = grün).
 * Reine Darstellung.
 */
export default function BarChartH({
  items,
  format,
  positiveIsBad = true,
}: {
  items: { label: string; value: number; sub?: string }[];
  format: (v: number) => string;
  positiveIsBad?: boolean;
}) {
  if (items.length === 0) return <p className="note">Keine Daten.</p>;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const colOf = (v: number) =>
    v === 0 ? "var(--mute)" : (v > 0) === positiveIsBad ? "var(--loss)" : "var(--gain)";
  return (
    <div className="barh">
      {items.map((i) => (
        <div className="barh-row" key={i.label}>
          <div className="barh-label">
            {i.label}
            {i.sub && <span className="muted"> · {i.sub}</span>}
          </div>
          <div className="barh-track">
            <div
              className="barh-fill"
              style={{ width: `${(Math.abs(i.value) / max) * 100}%`, background: colOf(i.value) }}
            />
          </div>
          <div className="barh-val" style={{ color: colOf(i.value) }}>
            {format(i.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
