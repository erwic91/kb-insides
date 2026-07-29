/**
 * Kleines Info-Icon („i") mit Erklärung auf Hover/Fokus. Reines CSS-Tooltip
 * (kein JS-State) — nutzbar in Server- und Client-Komponenten. Styles in
 * globals.css (.infodot / .infodot-tip).
 */
export default function InfoDot({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  return (
    <span className="infodot" tabIndex={0} role="note" aria-label={text}>
      i
      <span className={`infodot-tip ${align === "right" ? "tip-right" : ""}`} role="tooltip">
        {text}
      </span>
    </span>
  );
}
