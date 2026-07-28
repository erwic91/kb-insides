import { getServiceClient } from "./client";
import { reconstructCash, maxBid, realizedProfitFIFO } from "../compute/reconstruct";
import { computeBidAdvice, type BidAdvice } from "../compute/bidadvisor";
import { START_BUDGET } from "../compute/constants";
import type { Direction } from "../ingest/transfers";
import { ensureToken } from "../kickbase/session";
import { fetchPlayerMarketValue } from "../kickbase/endpoints";

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
  /** Kickbase-Spielmodus: 2 = 200 Mio/Nullspieler, 1 = 50 Mio/zugeloste Spieler. */
  gameMode: number | null;
  /** Monitoring-Startpunkt (ISO) — Daten davor werden nicht geladen. null = alles. */
  trackingSince: string | null;
  /** Historische Daten vor trackingSince einbeziehen? */
  includeHistory: boolean;
  /** Bonusmodell: "matchday" (Spieltagsboni) oder "lockin" (nur Lock-In). */
  bonusMode: string;
}

export interface ManagerTableRow {
  id: string;
  name: string;
  isMe: boolean;
  teamValue: number | null;
  points: number | null;
  streak: number | null;
  squadSize: number | null;
  /** Kontostand: exakt (eigener Manager, /me/budget) oder rekonstruiert. */
  cash: number | null;
  /** true = cash ist der exakte /me/budget-Wert (nur eigener Manager). */
  cashExact: boolean;
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
    .select(
      "id, name, start_budget, is_default, game_mode, tracking_since, include_history, bonus_mode",
    )
    .order("name");
  if (error || !data) return [];
  return data.map((l) => ({
    id: l.id as string,
    name: l.name as string,
    startBudget: (l.start_budget as number) ?? START_BUDGET,
    isDefault: Boolean(l.is_default),
    gameMode: (l.game_mode as number) ?? null,
    trackingSince: (l.tracking_since as string) ?? null,
    includeHistory: l.include_history == null ? true : Boolean(l.include_history),
    bonusMode: (l.bonus_mode as string) ?? "matchday",
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
    .select("manager_id, team_value, points, streak, squad_size, cash_actual")
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
  // Ab Startzeitpunkt rechnen: Kontostand/Aktivität nur aus Transfers seit dem
  // Tracking-Start (start_budget ist die Budget-Basis genau zu diesem Zeitpunkt).
  const sinceMs = league.trackingSince ? Date.parse(league.trackingSince) : null;

  const rows: ManagerTableRow[] = data.map((s) => {
    const mid = s.manager_id as string;
    const mgr = mgrMap.get(mid);
    const isMe = Boolean(mgr?.is_me);
    const teamValue = (s.team_value as number) ?? null;
    const allTransfers = transfers.get(mid);
    const myTransfers =
      sinceMs != null && allTransfers
        ? allTransfers.filter((t) => t.ts != null && Date.parse(t.ts) >= sinceMs)
        : allTransfers;

    // Kontostand: für den EIGENEN Manager der exakte Wert aus /me/budget
    // (cash_actual), sonst die Rekonstruktion aus Transfers (nur Näherung).
    const cashActual = isMe ? ((s.cash_actual as number) ?? null) : null;
    const reconstructed = myTransfers
      ? reconstructCash(myTransfers, { startBudget: league.startBudget })
      : null;
    const cash = cashActual ?? reconstructed;
    const cashExact = cashActual != null;
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
      isMe,
      teamValue,
      points: (s.points as number) ?? null,
      streak: (s.streak as number) ?? null,
      squadSize: (s.squad_size as number) ?? null,
      cash,
      cashExact,
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
    .select("day, team_value, points, streak, squad_size, cash_actual")
    .eq("league_id", league.id)
    .eq("manager_id", managerId)
    .order("day", { ascending: true });

  const history = (snaps ?? []).map((s) => ({
    day: s.day as number,
    teamValue: (s.team_value as number) ?? null,
    points: (s.points as number) ?? null,
    streak: (s.streak as number) ?? null,
    squadSize: (s.squad_size as number) ?? null,
    cashActual: (s.cash_actual as number) ?? null,
  }));
  const latest = history.length > 0 ? history[history.length - 1] : null;

  const isMe = Boolean(mgr.is_me);
  const sinceMs = league.trackingSince ? Date.parse(league.trackingSince) : null;
  const transfersByManager = await getTransfersByManager(league.id);
  const transfers = (transfersByManager.get(managerId) ?? [])
    .filter((t) => sinceMs == null || (t.ts != null && Date.parse(t.ts) >= sinceMs))
    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));

  // Eigener Manager: exakter Kontostand aus /me/budget, sonst Rekonstruktion.
  const reconstructed =
    transfers.length > 0
      ? reconstructCash(transfers, { startBudget: league.startBudget })
      : null;
  const cash = isMe && latest?.cashActual != null ? latest.cashActual : reconstructed;
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
  /** Marktwert-Trend: 1 = steigend, 2 = fallend, null = unbekannt. */
  trend: number | null;
}

export async function getMarket(league: LeagueLite): Promise<MarketListing[]> {
  const supabase = safeClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("market_log")
    .select(
      "player_id, price, market_value, offered_by, offered_by_name, expiry_ts, on_market, trend",
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
      trend: (r.trend as number) ?? null,
    };
  });
}

export interface TopPlayer {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  points: number | null;
  avgPoints: number | null;
  marketValue: number | null;
  ownerId: string;
  ownerName: string;
}

/** Top-Spieler der Liga (aus dem Kaderbestand), sortiert nach Saisonpunkten. */
export async function getTopPlayers(league: LeagueLite, limit = 50): Promise<TopPlayer[]> {
  const supabase = safeClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("squad_players")
    .select("player_id, manager_id, points, avg_points, market_value, position")
    .eq("league_id", league.id)
    .order("points", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data || data.length === 0) return [];

  const pids = [...new Set(data.map((r) => r.player_id as string))];
  const mids = [...new Set(data.map((r) => r.manager_id as string))];
  const [pRes, mRes] = await Promise.all([
    supabase.from("players").select("id, name, position, team").in("id", pids),
    supabase.from("managers").select("id, name").eq("league_id", league.id).in("id", mids),
  ]);
  const pmap = new Map<string, { name?: string; position?: string; team?: string }>();
  for (const p of pRes.data ?? [])
    pmap.set(p.id as string, { name: p.name as string, position: p.position as string, team: p.team as string });
  const mmap = new Map<string, string>();
  for (const m of mRes.data ?? []) mmap.set(m.id as string, (m.name as string) ?? (m.id as string));

  return data.map((r) => {
    const pid = r.player_id as string;
    const meta = pmap.get(pid);
    return {
      playerId: pid,
      name: meta?.name ?? `#${pid}`,
      position: meta?.position ?? (r.position as string) ?? null,
      team: meta?.team ?? null,
      points: (r.points as number) ?? null,
      avgPoints: (r.avg_points as number) ?? null,
      marketValue: (r.market_value as number) ?? null,
      ownerId: r.manager_id as string,
      ownerName: mmap.get(r.manager_id as string) ?? (r.manager_id as string),
    };
  });
}

/**
 * Bid-Advisor: Marktangebote + Gebotsberatung (stärkstes konkurrierendes
 * Max-Gebot je Spieler). `advice` ist leer/„unknown", wenn keine belastbaren
 * Max-Gebote vorliegen (z. B. vor dem Reset).
 */
export async function getBidAdvisor(
  league: LeagueLite,
): Promise<{ listings: MarketListing[]; advice: Map<string, BidAdvice> }> {
  const [{ rows }, listings] = await Promise.all([
    getManagerTable(league),
    getMarket(league),
  ]);
  const advice = computeBidAdvice(
    rows.map((r) => ({ id: r.id, name: r.name, isMe: r.isMe, maxBid: r.maxBid })),
    listings.map((l) => ({
      playerId: l.playerId,
      floor: l.price ?? l.marketValue ?? null,
      offeredBy: l.offeredBy,
    })),
  );
  return { listings, advice };
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

export interface PlayerMarketValueCurve {
  points: { date: string; mv: number }[];
  low: number | null;
  high: number | null;
}

/**
 * Live-Marktwert-Kurve eines Spielers direkt von Kickbase (365 Tage). Holt sich
 * ein Token via `ensureToken` und ruft den Endpoint auf. Bei JEDEM Fehler (kein
 * Token/Env/HTTP/Parse) `null` — die Seite hat einen Fallback aus der DB.
 */
export async function getPlayerMarketValueCurve(
  league: LeagueLite,
  playerId: string,
): Promise<PlayerMarketValueCurve | null> {
  try {
    const token = await ensureToken();
    const raw = await fetchPlayerMarketValue(league.id, playerId, "365", { token });

    const points = (raw.it ?? [])
      .map((p) => {
        if (p.dt == null || p.mv == null) return null;
        const d = new Date(p.dt * 86_400_000);
        if (Number.isNaN(d.getTime())) return null;
        return { date: d.toISOString(), mv: p.mv };
      })
      .filter((p): p is { date: string; mv: number } => p != null)
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      points,
      low: raw.lmv ?? null,
      high: raw.hmv ?? null,
    };
  } catch {
    return null;
  }
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
