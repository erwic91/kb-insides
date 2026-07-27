import { MarketSchema, type Market } from "../kickbase/schemas";

/**
 * M6 — Markt-Ingest (reine Transformation). Aus `/v4/leagues/{lid}/market`:
 *  - players:    Stammdaten der gelisteten Spieler (id, name, team, pos)
 *  - marketLog:  je Listing eine Zeile (Identität = Ablauf `dt`) → Prognose-Log
 *  - playerMv:   Marktwert-Beobachtung am aktuellen Spieltag
 *
 * Der Anbieter (`u`) steht im Log als beobachtender Kontext nicht drin (das
 * market_log-Schema kennt keinen Anbieter); die Zuordnung „wer bietet an" wird
 * im Frontend direkt aus der Live-Markt-Query gelesen.
 */

const POSITIONS: Record<number, string> = {
  1: "TW",
  2: "ABW",
  3: "MF",
  4: "ANG",
};

export interface PlayerRow {
  id: string;
  name: string | null;
  team: string | null;
  position: string | null;
}

export interface MarketLogRow {
  league_id: string;
  player_id: string;
  expiry_ts: string;
  ts: string;
  day: number | null;
  on_market: boolean;
  price: number | null;
  market_value: number | null;
  offered_by: string | null;
  offered_by_name: string | null;
}

export interface PlayerMvRow {
  league_id: string;
  player_id: string;
  day: number;
  market_value: number | null;
}

export interface MarketParseResult {
  players: PlayerRow[];
  marketLog: MarketLogRow[];
  playerMv: PlayerMvRow[];
}

export function parseMarket(
  input: Market | unknown,
  leagueId: string,
  observedAt: string,
): MarketParseResult {
  const res = MarketSchema.parse(input);
  const day = res.day ?? null;

  const players: PlayerRow[] = [];
  const marketLog: MarketLogRow[] = [];
  const playerMv: PlayerMvRow[] = [];

  for (const it of res.it) {
    const name = [it.fn, it.n].filter(Boolean).join(" ").trim() || it.n || null;
    players.push({
      id: it.i,
      name,
      team: it.tid ?? null,
      position: it.pos != null ? (POSITIONS[it.pos] ?? String(it.pos)) : null,
    });

    // Listing-Identität = Ablaufzeitpunkt `dt`. Fehlt er, Beobachtungszeit nutzen.
    marketLog.push({
      league_id: leagueId,
      player_id: it.i,
      expiry_ts: it.dt ?? observedAt,
      ts: observedAt,
      day,
      on_market: true,
      price: it.prc ?? null,
      market_value: it.mv ?? null,
      offered_by: it.u?.i ?? null,
      offered_by_name: it.u?.n ?? null,
    });

    if (day != null && it.mv != null) {
      playerMv.push({
        league_id: leagueId,
        player_id: it.i,
        day,
        market_value: it.mv,
      });
    }
  }

  return { players, marketLog, playerMv };
}
