import { TransfersSchema, type Transfers } from "../kickbase/schemas";
import { TTY_BUY, TTY_SELL } from "../compute/constants";

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
