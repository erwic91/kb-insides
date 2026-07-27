import { TransfersSchema, type Transfers, type TransferItem } from "../kickbase/schemas";
import { TTY_BUY, TTY_SELL } from "../compute/constants";

/**
 * Seitengröße der Transfer-Historie. An echten Daten verifiziert: die API
 * liefert je Abfrage max. 25 Einträge; ältere kommen über den `start`-Offset
 * (`?start=25` → Einträge 26–50, `?page=` wird ignoriert).
 */
export const TRANSFER_PAGE_SIZE = 25;

/**
 * Paginiert die volle Transfer-Historie über den `start`-Offset. `fetchPage`
 * ist injizierbar (echte API im Betrieb, Fake im Test). Stoppt bei
 *   - kurzer/leerer Seite (letzte Seite erreicht),
 *   - geklammerter Wiederholung (API gibt dieselbe Seite erneut zurück),
 *   - dem Sicherheits-Limit `maxPages`.
 * `onPage` erlaubt eine höfliche Pause zwischen Seiten.
 */
export async function paginateTransfers(
  fetchPage: (start: number) => Promise<TransferItem[]>,
  opts: {
    pageSize?: number;
    maxPages?: number;
    onPage?: () => Promise<void>;
    /** Nach dieser Seite abbrechen (z. B. wenn älter als der Tracking-Start). */
    stopAfter?: (items: TransferItem[]) => boolean;
  } = {},
): Promise<TransferItem[]> {
  const pageSize = opts.pageSize ?? TRANSFER_PAGE_SIZE;
  const maxPages = opts.maxPages ?? 40;
  const all: TransferItem[] = [];
  let prevFirstKey: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const items = await fetchPage(page * pageSize);
    if (items.length === 0) break;

    const first = items[0]!;
    const firstKey = `${first.pi}:${first.dt}:${first.tty}`;
    if (firstKey === prevFirstKey) break; // API hat geklammert → gleiche Seite
    prevFirstKey = firstKey;

    all.push(...items);
    if (items.length < pageSize) break; // letzte (unvollständige) Seite
    if (opts.stopAfter?.(items)) break; // Cutoff erreicht (Transfers sind absteigend)
    if (opts.onPage) await opts.onPage();
  }

  return all;
}

/**
 * M4 — Transfer-Ingest (reine Transformation).
 *
 * Wandelt eine `/transfer`-Antwort eines Managers in `transfers`-Zeilen um.
 * `tty` 1/2 → Richtung 'buy'/'sell' (an echten Fixtures verifiziert).
 *
 * Die API liefert KEINE Transfer-ID, deshalb wird ein stabiler synthetischer
 * Schlüssel gebildet (`mid:pi:dt:tty`) — idempotent bei Mehrfachläufen.
 * Marktwert zum Transferzeitpunkt (`mv_at_time`, Overpay-Basis) ist in dieser
 * Antwort nicht enthalten → null (wird später aus der MV-Historie ergänzt).
 */

export type Direction = "buy" | "sell";

export interface TransferRow {
  league_id: string;
  id: string;
  player_id: string;
  from_manager: string | null; // null = Markt
  to_manager: string | null; // null = Markt
  direction: Direction;
  ts: string;
  price: number;
  mv_at_time: number | null;
}

export function parseTransfers(
  input: Transfers | unknown,
  leagueId: string,
  managerId: string,
): TransferRow[] {
  const res = TransfersSchema.parse(input);

  return res.it.map((t) => {
    const direction: Direction = t.tty === TTY_SELL ? "sell" : "buy";
    const isSell = direction === "sell";
    return {
      league_id: leagueId,
      id: `${managerId}:${t.pi}:${t.dt}:${t.tty}`,
      player_id: t.pi,
      from_manager: isSell ? managerId : null,
      to_manager: isSell ? null : managerId,
      direction,
      ts: t.dt,
      price: t.trp,
      mv_at_time: null,
    };
  });
}
