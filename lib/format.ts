/** Formatierungs-Helfer (de-DE) für das Frontend. */

const DE = "de-DE";

/** Kompakte Euro-Angabe: 196,5 Mio € / 820 Tsd € / 540 €. `null` → „—". */
export function eur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString(DE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio €`;
  }
  if (abs >= 1_000) {
    return `${Math.round(n / 1_000).toLocaleString(DE)} Tsd €`;
  }
  return `${n.toLocaleString(DE)} €`;
}

/** Vollständige Euro-Angabe mit Tausenderpunkten: 196.508.183 €. */
export function eurFull(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString(DE)} €`;
}

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
