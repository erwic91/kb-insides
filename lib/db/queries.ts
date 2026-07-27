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

  const rows: ManagerTableRow[] = data.map((s) => {
    const mid = s.manager_id as string;
    const mgr = mgrMap.get(mid);
    const teamValue = (s.team_value as number) ?? null;
    const myTransfers = transfers.get(mid);
    const cash = myTransfers
      ? reconstructCash(myTransfers, { startBudget: league.startBudget })
      : null;
    const bid = cash != null && teamValue != null ? maxBid(cash, teamValue) : null;
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
