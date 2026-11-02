/**
 * Wahl des jüngsten ECHTEN Marktwert-Tages. Ein nächtliches Kickbase-Update
 * ändert ~85–95 % aller Marktwerte. Ein Snapshot, der vor dem Update aufgenommen
 * wurde, ist ein Duplikat des Vortags — evtl. mit einzelnen Abweichungen (z. B.
 * per Kurve nachgefüllte Spieler). Solche Tage werden übersprungen.
 */

/** Mindestanteil geänderter Marktwerte, ab dem ein Tag als echtes Update gilt. */
export const MV_UPDATE_MIN_SHARE = 0.25;

const isoMinusDays = (iso: string, n: number) =>
  new Date(Date.parse(iso + "T00:00:00Z") - n * 86_400_000).toISOString().slice(0, 10);

/**
 * @param byDate Datum (YYYY-MM-DD) → (player_id → Marktwert)
 * @returns jüngster Tag D mit vorhandenem Vortag D−1, der als echtes Update gilt
 */
export function pickMvAnchorDay(
  byDate: Map<string, Map<string, number>>,
  minShare = MV_UPDATE_MIN_SHARE,
): { day: string; prev: string } | null {
  const dates = [...byDate.keys()].sort().reverse();
  for (const d of dates) {
    const prev = isoMinusDays(d, 1);
    const cur = byDate.get(d)!;
    const old = byDate.get(prev);
    if (!old) continue; // Vortag fehlt → kein Tagespaar
    let compared = 0;
    let changed = 0;
    for (const [pid, mv] of cur) {
      const o = old.get(pid);
      if (o == null) continue;
      compared += 1;
      if (o !== mv) changed += 1;
    }
    // Sehr kleine Stichproben: jede Änderung zählt.
    const isUpdate = compared >= 10 ? changed / compared >= minShare : changed > 0;
    if (isUpdate) return { day: d, prev };
  }
  return null;
}
