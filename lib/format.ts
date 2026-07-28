/** Formatierungs-Helfer (de-DE) für das Frontend. */

const DE = "de-DE";

/**
 * Euro-Angabe: IMMER exakt bis auf den Euro, ohne Nachkommastellen, mit
 * Tausenderpunkten (196.508.183 €). Keine „Mio/Tsd"-Kürzung mehr — im ganzen
 * System werden Beträge auf den Euro genau angezeigt. `null` → „—".
 */
export function eur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString(DE)} €`;
}

/** Alias von `eur` (beide exakt bis auf den Euro). */
export const eurFull = eur;

/** Vorzeichen-behaftete kompakte Euro-Angabe (+1,1 Mio € / −793 Tsd €). */
export function eurSigned(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const s = eur(Math.abs(n));
  if (n > 0) return `+${s}`;
  if (n < 0) return `−${s}`;
  return s;
}

/** Ganzzahl mit Tausenderpunkten. */
export function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(DE);
}

/** Prozent (0.6 → „60 %"). */
export function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toLocaleString(DE, { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

/** ISO-Zeitstempel → „14.12.2025". */
export function date(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(DE, { day: "2-digit", month: "2-digit", year: "numeric" });
}
