import { getServiceClient } from "./client";
import { reconstructCash, maxBid, realizedProfitFIFO } from "../compute/reconstruct";
import { START_BUDGET } from "../compute/constants";
import type { Direction } from "../ingest/transfers";

/**
 * Server-seitiger Read-Layer fürs Frontend (M5). Alle Zugriffe laufen über den
 * Service-Client (RLS-bypass, nur Server). Defensiv: fehlt die Konfiguration
 * (SUPABASE_URL/KEY), liefern die Funktionen leere Ergebnisse statt zu werfen —
 * die Seiten zeigen dann einen leeren Zustand.
 */

export interface LeagueLite {
  id: string;
  name: string;
  startBudget: number;
  isDefault: boolean;
}

export interface ManagerTableRow {
  id: string;
  name: string;
  isMe: boolean;
  teamValue: number | null;
  points: number | null;
  streak: number | null;
  squadSize: number | null;
  /** Rekonstruiert — nur wenn Transfers vorliegen, sonst null. */
  cash: number | null;
  /** Maximalgebot — nur wenn cash & Kaderwert bekannt. */
  maxBid: number | null;
  /** Gesamtwert = Kontostand + Kaderwert (nur wenn beide bekannt). */
  total: number | null;
  /** Liquidität = Kontostand / Gesamt (0..1, nur wenn Gesamt > 0). */
  liquidity: number | null;
  /** Tage seit dem letzten Transfer; null = keine Transfers erfasst. */
  lastActiveDays: number | null;
  /** Anzahl erfasster Transfers dieses Managers. */
  transferCount: number;
  active: boolean;
}

export interface TransferLite {
  id: string;
  playerId: string;
  direction: Direction;
  price: number;
  ts: string | null;
  mvAtTime: number | null;
}

function safeClient() {
  try {
    return getServiceClient();
  } catch {
    return null;
  }
}

export async function getLeagues(): Promise<LeagueLite[]> {
  const supabase = safeClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, start_budget, is_default")
    .order("name");
  if (error || !data) return [];
  return data.map((l) => ({
    id: l.id as string,
    name: l.name as string,
    startBudget: (l.start_budget as number) ?? START_BUDGET,
    isDefault: Boolean(l.is_default),
  }));
}

export async function resolveLeague(requested?: string): Promise<LeagueLite | null> {
  const leagues = await getLeagues();
  if (leagues.length === 0) return null;
  if (requested) {
    const hit = leagues.find((l) => l.id === requested);
    if (hit) return hit;
  }
  return leagues.find((l) => l.isDefault) ?? leagues[0] ?? null;
}

async function getLatestDay(leagueId: string): Promise<number | null> {
  const supabase = safeClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("manager_snapshots")
    .select("day")
    .eq("league_id", leagueId)
    .order("day", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return (data[0]?.day as number) ?? null;
}

/** Alle Transfers einer Liga, gebündelt nach „besitzendem" Manager. */
async function getTransfersByManager(
  leagueId: string,
): Promise<Map<string, TransferLite[]>> {
  const supabase = safeClient();
  const byManager = new Map<string, TransferLite[]>();
  if (!supabase) return byManager;
  const { data, error } = await supabase
    .from("transfers")
    .select("id, player_id, from_manager, to_manager, direction, price, ts, mv_at_time")
    .eq("league_id", leagueId);
  if (error || !data) return byManager;

  for (const t of data) {
    const direction = (t.direction as Direction) ?? "buy";
    const owner = direction === "buy" ? (t.to_manager as string) : (t.from_manager as string);
    if (!owner) continue;
    const row: TransferLite = {
      id: t.id as string,
      playerId: t.player_id as string,
      direction,
      price: (t.price as number) ?? 0,
      ts: (t.ts as string) ?? null,
      mvAtTime: (t.mv_at_time as number) ?? null,
    };
    const arr = byManager.get(owner) ?? [];
    arr.push(row);
    byManager.set(owner, arr);
  }
  return byManager;
}

export interface ManagerTable {
  day: number | null;
  rows: ManagerTableRow[];
}

export async function getManagerTable(
  league: LeagueLite,
): Promise<ManagerTable> {
  const supabase = safeClient();
  if (!supabase) return { day: null, rows: [] };
  const day = await getLatestDay(league.id);
  if (day == null) return { day: null, rows: [] };

  const { data, error } = await supabase
    .from("manager_snapshots")
    .select("manager_id, team_value, points, streak, squad_size")
    .eq("league_id", league.id)
    .eq("day", day);
  if (error || !data) return { day, rows: [] };

  // Manager separat laden und im Code mergen (robuster als PostgREST-Embed
  // über den zusammengesetzten FK).
  const { data: mgrData } = await supabase
    .from("managers")
    .select("id, name, is_me")
    .eq("league_id", league.id);
  const mgrMap = new Map<string, { name?: string; is_me?: boolean }>();
  for (const m of mgrData ?? []) {
    mgrMap.set(m.id as string, { name: m.name as string, is_me: Boolean(m.is_me) });
  }

  const transfers = await getTransfersByManager(league.id);
  const now = Date.now();

  const rows: ManagerTableRow[] = data.map((s) => {
    const mid = s.manager_id as string;
    const mgr = mgrMap.get(mid);
    const teamValue = (s.team_value as number) ?? null;
    const myTransfers = transfers.get(mid);
    const cash = myTransfers
      ? reconstructCash(myTransfers, { startBudget: league.startBudget })
      : null;
    const bid = cash != null && teamValue != null ? maxBid(cash, teamValue) : null;
    const total = cash != null && teamValue != null ? cash + teamValue : null;
    const liquidity = total != null && total > 0 && cash != null ? cash / total : null;

    // Aktivität: Tage seit dem jüngsten Transfer (aus den vorhandenen Transfers).
    let lastActiveDays: number | null = null;
    if (myTransfers && myTransfers.length > 0) {
      let latest = 0;
      for (const t of myTransfers) {
        const ms = t.ts ? Date.parse(t.ts) : NaN;
        if (!Number.isNaN(ms) && ms > latest) latest = ms;
      }
      if (latest > 0) lastActiveDays = Math.max(0, Math.floor((now - latest) / 86_400_000));
    }

    return {
      id: mid,
      name: mgr?.name ?? mid,
      isMe: Boolean(mgr?.is_me),
      teamValue,
      points: (s.points as number) ?? null,
      streak: (s.streak as number) ?? null,
      squadSize: (s.squad_size as number) ?? null,
      cash,
      maxBid: bid,
      total,
      liquidity,
      lastActiveDays,
      transferCount: myTransfers?.length ?? 0,
      active: teamValue != null || (s.points as number) != null,
    };
  });

  // Sortierung: aktive nach Saisonpunkten, inaktive ans Ende.
  rows.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (b.points ?? -1) - (a.points ?? -1);
  });

  return { day, rows };
}

export interface ManagerDetail {
  id: string;
  name: string;
  isMe: boolean;
  day: number | null;
  teamValue: number | null;
  points: number | null;
  streak: number | null;
  squadSize: number | null;
  cash: number | null;
  maxBid: number | null;
  transfers: TransferLite[];
  trade: ReturnType<typeof realizedProfitFIFO>;
  bought: number;
  sold: number;
  history: { day: number; teamValue: number | null; points: number | null }[];
}

export async function getManagerDetail(
  league: LeagueLite,
  managerId: string,
): Promise<ManagerDetail | null> {
  const supabase = safeClient();
  if (!supabase) return null;

  const { data: mgrData } = await supabase
    .from("managers")
    .select("id, name, is_me")
    .eq("league_id", league.id)
    .eq("id", managerId)
    .limit(1);
  const mgr = mgrData?.[0];
  if (!mgr) return null;

  const { data: snaps } = await supabase
    .from("manager_snapshots")
    .select("day, team_value, points, streak, squad_size")
    .eq("league_id", league.id)
    .eq("manager_id", managerId)
    .order("day", { ascending: true });

  const history = (snaps ?? []).map((s) => ({
    day: s.day as number,
    teamValue: (s.team_value as number) ?? null,
    points: (s.points as number) ?? null,
    streak: (s.streak as number) ?? null,
    squadSize: (s.squad_size as number) ?? null,
  }));
  const latest = history.length > 0 ? history[history.length - 1] : null;

  const transfersByManager = await getTransfersByManager(league.id);
  const transfers = (transfersByManager.get(managerId) ?? []).sort((a, b) =>
    (b.ts ?? "").localeCompare(a.ts ?? ""),
  );

  const cash =
    transfers.length > 0
      ? reconstructCash(transfers, { startBudget: league.startBudget })
      : null;
  const teamValue = latest?.teamValue ?? null;
  const bid = cash != null && teamValue != null ? maxBid(cash, teamValue) : null;

  const bought = transfers
    .filter((t) => t.direction === "buy")
    .reduce((s, t) => s + t.price, 0);
  const sold = transfers
    .filter((t) => t.direction === "sell")
    .reduce((s, t) => s + t.price, 0);

  const trade = realizedProfitFIFO(
    transfers.map((t) => ({
      player_id: t.playerId,
      direction: t.direction,
      price: t.price,
      ts: t.ts ?? "",
    })),
  );

  return {
    id: managerId,
    name: (mgr.name as string) ?? managerId,
    isMe: Boolean(mgr.is_me),
    day: latest?.day ?? null,
    teamValue,
    points: latest?.points ?? null,
    streak: latest?.streak ?? null,
    squadSize: latest?.squadSize ?? null,
    cash,
    maxBid: bid,
    transfers,
    trade,
    bought,
    sold,
    history,
  };
}

// ---------- M6: Markt ----------

export interface MarketListing {
  playerId: string;
  playerName: string;
  position: string | null;
  team: string | null;
  marketValue: number | null;
  price: number | null;
  offeredBy: string | null;
  offeredByName: string | null;
  expiry: string | null;
}

export async function getMarket(league: LeagueLite): Promise<MarketListing[]> {
  const supabase = safeClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("market_log")
    .select(
      "player_id, price, market_value, offered_by, offered_by_name, expiry_ts, on_market",
    )
    .eq("league_id", league.id)
    .eq("on_market", true)
    .order("market_value", { ascending: false });
  if (error || !data) return [];

  const ids = [...new Set(data.map((r) => r.player_id as string))];
  const players = new Map<string, { name?: string; position?: string; team?: string }>();
  if (ids.length > 0) {
    const { data: pdata } = await supabase
      .from("players")
      .select("id, name, position, team")
      .in("id", ids);
    for (const p of pdata ?? []) {
      players.set(p.id as string, {
        name: p.name as string,
        position: p.position as string,
        team: p.team as string,
      });
    }
  }

  return data.map((r) => {
    const p = players.get(r.player_id as string);
    return {
      playerId: r.player_id as string,
      playerName: p?.name ?? `#${r.player_id}`,
      position: p?.position ?? null,
      team: p?.team ?? null,
      marketValue: (r.market_value as number) ?? null,
      price: (r.price as number) ?? null,
      offeredBy: (r.offered_by as string) ?? null,
      offeredByName: (r.offered_by_name as string) ?? null,
      expiry: (r.expiry_ts as string) ?? null,
    };
  });
}

export interface PlayerDetail {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  mvHistory: { day: number; marketValue: number | null }[];
  latestMv: number | null;
  transfers: {
    managerId: string;
    managerName: string;
    direction: Direction;
    price: number;
    ts: string | null;
  }[];
}

export async function getPlayerDetail(
  league: LeagueLite,
  playerId: string,
): Promise<PlayerDetail | null> {
  const supabase = safeClient();
  if (!supabase) return null;

  const { data: pdata } = await supabase
    .from("players")
    .select("id, name, position, team")
    .eq("id", playerId)
    .maybeSingle();

  const { data: mv } = await supabase
    .from("player_mv")
    .select("day, market_value")
    .eq("league_id", league.id)
    .eq("player_id", playerId)
    .order("day", { ascending: true });
  const mvHistory = (mv ?? []).map((r) => ({
    day: r.day as number,
    marketValue: (r.market_value as number) ?? null,
  }));

  const { data: tr } = await supabase
    .from("transfers")
    .select("from_manager, to_manager, direction, price, ts")
    .eq("league_id", league.id)
    .eq("player_id", playerId)
    .order("ts", { ascending: false });

  // Managernamen auflösen.
  const mgrIds = new Set<string>();
  for (const t of tr ?? []) {
    const owner = (t.direction as Direction) === "buy" ? t.to_manager : t.from_manager;
    if (owner) mgrIds.add(owner as string);
  }
  const names = new Map<string, string>();
  if (mgrIds.size > 0) {
    const { data: mdata } = await supabase
      .from("managers")
      .select("id, name")
      .eq("league_id", league.id)
      .in("id", [...mgrIds]);
    for (const m of mdata ?? []) names.set(m.id as string, (m.name as string) ?? (m.id as string));
  }

  const transfers = (tr ?? []).map((t) => {
    const direction = (t.direction as Direction) ?? "buy";
    const owner = (direction === "buy" ? t.to_manager : t.from_manager) as string | null;
    return {
      managerId: owner ?? "",
      managerName: owner ? (names.get(owner) ?? owner) : "Markt",
      direction,
      price: (t.price as number) ?? 0,
      ts: (t.ts as string) ?? null,
    };
  });

  if (!pdata && mvHistory.length === 0 && transfers.length === 0) return null;

  return {
    id: playerId,
    name: (pdata?.name as string) ?? `#${playerId}`,
    position: (pdata?.position as string) ?? null,
    team: (pdata?.team as string) ?? null,
    mvHistory,
    latestMv: mvHistory.length > 0 ? mvHistory[mvHistory.length - 1]!.marketValue : null,
    transfers,
  };
}

// ---------- §8: Kalibrierung ----------

export interface CalibrationRow {
  day: number;
  myReconstructed: number | null;
  myActual: number | null;
  delta: number | null;
}

export async function getCalibration(league: LeagueLite): Promise<CalibrationRow | null> {
  const supabase = safeClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("calibration")
    .select("day, my_reconstructed, my_actual, delta")
    .eq("league_id", league.id)
    .order("day", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const r = data[0]!;
  return {
    day: r.day as number,
    myReconstructed: (r.my_reconstructed as number) ?? null,
    myActual: (r.my_actual as number) ?? null,
    delta: (r.delta as number) ?? null,
  };
}
