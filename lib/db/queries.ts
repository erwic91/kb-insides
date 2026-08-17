import { createSupabaseServerClient } from "../supabase/server";
import { reconstructCash, maxBid, realizedProfitFIFO } from "../compute/reconstruct";
import { loginBonusSinceReset } from "../compute/loginBonus";
import { MATCHDAY_BONUS_PER_POINT } from "../ingest/matchdayBonus";
import { getAdjustmentSums } from "./adjustments";
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
  /** Kaderwert-Veränderung zum Vortag in % (0.05 = +5 %); null wenn unbekannt. */
  teamValueDeltaPct: number | null;
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
  /** Punkte je Spieltag (Formkurve) — null/[] wenn noch nicht erfasst. */
  pointsSeries: (number | null)[] | null;
  /** Geschätzter kumulierter Login-Bonus ab Reset (null = kein Reset-Anker). */
  loginBonus: number | null;
  active: boolean;
}

export interface TransferLite {
  id: string;
  playerId: string;
  /** Klartext-Name des Spielers (Fallback `#<id>`, wenn unbekannt). */
  playerName: string;
  direction: Direction;
  price: number;
  ts: string | null;
  mvAtTime: number | null;
}

/**
 * RLS-gebundener Lese-Client (JWT des angemeldeten Nutzers). Sieht via RLS nur
 * die Ligen, auf die der Nutzer über league_access Zugriff hat. Null, wenn kein
 * Request-Kontext / keine Session vorhanden ist (dann leere Ergebnisse).
 */
async function getReadClient() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

/** Eigener Liga-Zugang des Nutzers (RLS liefert nur die eigene Zeile). */
export interface MyAccess {
  leagueId: string;
  kbManagerId: string;
}
export async function getMyAccess(): Promise<MyAccess | null> {
  const supabase = await getReadClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("league_access")
    .select("league_id, kb_manager_id")
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { leagueId: data.league_id as string, kbManagerId: data.kb_manager_id as string };
}

/** In DIESER Liga ausgeblendete Manager-IDs (hidden_managers, pro Liga). */
export async function getHiddenManagerIds(leagueId: string): Promise<Set<string>> {
  const supabase = await getReadClient();
  if (!supabase) return new Set();
  const { data } = await supabase
    .from("hidden_managers")
    .select("manager_id")
    .eq("league_id", leagueId);
  return new Set((data ?? []).map((r) => r.manager_id as string));
}

/** Ist dieser Manager in DIESER Liga ausgeblendet? */
export async function isManagerHidden(leagueId: string, managerId: string): Promise<boolean> {
  const supabase = await getReadClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("hidden_managers")
    .select("manager_id")
    .eq("league_id", leagueId)
    .eq("manager_id", managerId)
    .maybeSingle();
  return data != null;
}

/**
 * Kaderwert-Veränderung zum Vortag je Manager (in %). Aus manager_tv_daily:
 * die zwei jüngsten Kalendertage vergleichen. Null, solange < 2 Tage vorliegen.
 */
async function getTeamValueDeltas(leagueId: string): Promise<Map<string, number>> {
  const supabase = await getReadClient();
  const out = new Map<string, number>();
  if (!supabase) return out;
  const { data } = await supabase
    .from("manager_tv_daily")
    .select("manager_id, snap_date, team_value")
    .eq("league_id", leagueId)
    .order("snap_date", { ascending: false });
  if (!data || data.length === 0) return out;

  // Je Manager die zwei jüngsten Werte (Daten sind absteigend sortiert).
  const byMgr = new Map<string, { date: string; tv: number }[]>();
  for (const r of data) {
    const mid = r.manager_id as string;
    const tv = r.team_value as number | null;
    if (tv == null) continue;
    const arr = byMgr.get(mid) ?? [];
    if (arr.length < 2) arr.push({ date: r.snap_date as string, tv });
    byMgr.set(mid, arr);
  }
  for (const [mid, arr] of byMgr) {
    if (arr.length < 2) continue;
    const [today, prev] = arr; // [0] jüngster, [1] Vortag
    if (prev!.tv > 0) out.set(mid, (today!.tv - prev!.tv) / prev!.tv);
  }
  return out;
}

/**
 * Bestätigte Spieltags-Bonuspunkte je Manager (manager_bonus_points, wöchentlich
 * dienstags eingefroren). Grundlage für den Spieltagsbonus = Punkte × 1000 €.
 * Leere Map, solange noch kein Spieltag abgeschlossen ist.
 */
async function getMatchdayBonusPoints(leagueId: string): Promise<Map<string, number>> {
  const supabase = await getReadClient();
  const out = new Map<string, number>();
  if (!supabase) return out;
  const { data } = await supabase
    .from("manager_bonus_points")
    .select("manager_id, points")
    .eq("league_id", leagueId);
  for (const r of data ?? []) out.set(r.manager_id as string, (r.points as number) ?? 0);
  return out;
}

/** Eigener exakter Kontostand je Spieltag (aus user_budget; RLS = nur eigene). */
async function getMyBudget(leagueId: string): Promise<Map<number, number>> {
  const supabase = await getReadClient();
  const out = new Map<number, number>();
  if (!supabase) return out;
  const { data } = await supabase
    .from("user_budget")
    .select("day, cash_actual")
    .eq("league_id", leagueId);
  for (const r of data ?? []) {
    if (r.cash_actual != null) out.set(r.day as number, r.cash_actual as number);
  }
  return out;
}

export async function getLeagues(): Promise<LeagueLite[]> {
  const supabase = await getReadClient();
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
  const supabase = await getReadClient();
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
  const supabase = await getReadClient();
  const byManager = new Map<string, TransferLite[]>();
  if (!supabase) return byManager;
  const { data, error } = await supabase
    .from("transfers")
    .select("id, player_id, from_manager, to_manager, direction, price, ts, mv_at_time")
    .eq("league_id", leagueId);
  if (error || !data) return byManager;

  // Spielernamen für alle referenzierten IDs auflösen (Fallback `#<id>`).
  const pids = [...new Set(data.map((r) => r.player_id as string))];
  const names = new Map<string, string>();
  if (pids.length > 0) {
    const { data: pdata } = await supabase
      .from("players")
      .select("id, name")
      .in("id", pids);
    for (const p of pdata ?? []) names.set(p.id as string, p.name as string);
  }

  for (const t of data) {
    const direction = (t.direction as Direction) ?? "buy";
    const owner = direction === "buy" ? (t.to_manager as string) : (t.from_manager as string);
    if (!owner) continue;
    const pid = t.player_id as string;
    const row: TransferLite = {
      id: t.id as string,
      playerId: pid,
      playerName: names.get(pid) ?? `#${pid}`,
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

export interface HiddenManagerLite {
  id: string;
  name: string;
}

export interface ManagerTable {
  day: number | null;
  rows: ManagerTableRow[];
  /** Global ausgeblendete Manager dieser Liga (aus rows entfernt) — für die Wiederherstellungs-Liste. */
  hidden: HiddenManagerLite[];
}

export async function getManagerTable(
  league: LeagueLite,
): Promise<ManagerTable> {
  const supabase = await getReadClient();
  if (!supabase) return { day: null, rows: [], hidden: [] };
  const day = await getLatestDay(league.id);
  if (day == null) return { day: null, rows: [], hidden: [] };

  const { data, error } = await supabase
    .from("manager_snapshots")
    .select("manager_id, team_value, points, streak, squad_size, points_series")
    .eq("league_id", league.id)
    .eq("day", day);
  if (error || !data) return { day, rows: [], hidden: [] };

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
  // „Ich" + exakter Kontostand kommen jetzt pro Nutzer aus league_access /
  // user_budget (nicht mehr aus managers.is_me / snapshots.cash_actual).
  const [myAccess, myBudget, adjustments, tvDeltas, hiddenIds, bonusPoints] = await Promise.all([
    getMyAccess(),
    getMyBudget(league.id),
    getAdjustmentSums(league.id),
    getTeamValueDeltas(league.id),
    getHiddenManagerIds(league.id),
    getMatchdayBonusPoints(league.id),
  ]);
  // Spieltagsbonus (Punkte × 1000 €) nur im Manager-Modus (gameMode 2).
  const bonusFor = (mid: string) =>
    league.gameMode === 2 ? (bonusPoints.get(mid) ?? 0) * MATCHDAY_BONUS_PER_POINT : 0;
  const myCashActual = myBudget.get(day) ?? null;
  const now = Date.now();
  // Täglicher Login-Bonus als Tages-Summe ab Reset (10k → 100k/Tag), Annahme
  // täglich aktiv — für ALLE Gegner gleich. Fließt in die Rekonstruktion; das
  // eigene Konto bleibt exakt aus user_budget.
  const loginBonus = loginBonusSinceReset(league.trackingSince, now);
  // Ab Startzeitpunkt rechnen: Kontostand/Aktivität nur aus Transfers seit dem
  // Tracking-Start (start_budget ist die Budget-Basis genau zu diesem Zeitpunkt).
  const sinceMs = league.trackingSince ? Date.parse(league.trackingSince) : null;

  const rows: ManagerTableRow[] = data.map((s) => {
    const mid = s.manager_id as string;
    const mgr = mgrMap.get(mid);
    // is_me: der Manager, dessen ID = kb_manager_id des Nutzers (aus league_access).
    // Fallback auf managers.is_me nur, wenn kein Liga-Zugang bekannt ist.
    const isMe = myAccess ? mid === myAccess.kbManagerId : Boolean(mgr?.is_me);
    const teamValue = (s.team_value as number) ?? null;
    const allTransfers = transfers.get(mid);
    const myTransfers =
      sinceMs != null && allTransfers
        ? allTransfers.filter((t) => t.ts != null && Date.parse(t.ts) >= sinceMs)
        : allTransfers;

    // Jüngster Transfer → Aktivität (Tage seit letztem Transfer).
    let latestTransferMs: number | null = null;
    if (myTransfers) {
      for (const t of myTransfers) {
        const ms = t.ts ? Date.parse(t.ts) : NaN;
        if (!Number.isNaN(ms) && (latestTransferMs == null || ms > latestTransferMs)) {
          latestTransferMs = ms;
        }
      }
    }
    const lastActiveDays =
      latestTransferMs != null ? Math.max(0, Math.floor((now - latestTransferMs) / 86_400_000)) : null;

    // Kontostand: für den EIGENEN Manager der exakte Wert aus /me/budget
    // (user_budget, nutzer-privat), sonst Rekonstruktion aus Transfers (Näherung)
    // inkl. vollem Login-Bonus (Tages-Summe ab Reset, für alle Gegner gleich).
    const cashActual = isMe ? myCashActual : null;
    const reconstructed =
      league.startBudget > 0
        ? reconstructCash(myTransfers ?? [], {
            startBudget: league.startBudget,
            prizes: loginBonus + (adjustments.get(mid) ?? 0) + bonusFor(mid),
          })
        : null;
    const cash = cashActual ?? reconstructed;
    const cashExact = cashActual != null;
    const bid = cash != null && teamValue != null ? maxBid(cash, teamValue) : null;
    const total = cash != null && teamValue != null ? cash + teamValue : null;
    const liquidity = total != null && total > 0 && cash != null ? cash / total : null;

    return {
      id: mid,
      name: mgr?.name ?? mid,
      isMe,
      teamValue,
      teamValueDeltaPct: tvDeltas.get(mid) ?? null,
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
      pointsSeries: (s.points_series as (number | null)[]) ?? null,
      loginBonus: league.trackingSince ? loginBonus : null,
      active: teamValue != null || (s.points as number) != null,
    };
  });

  // Global ausgeblendete Manager (z. B. nicht mitspielende Admins) aus der
  // Auswertung entfernen — dadurch fallen sie automatisch aus Ranking, Ø-Werten
  // und allen Insights, die auf `rows` aufbauen. Für die Wiederherstellung
  // werden sie separat als `hidden` zurückgegeben.
  const hidden: HiddenManagerLite[] = [];
  const visible = rows.filter((r) => {
    if (!hiddenIds.has(r.id)) return true;
    hidden.push({ id: r.id, name: r.name });
    return false;
  });

  // Sortierung: aktive nach Saisonpunkten, inaktive ans Ende.
  visible.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (b.points ?? -1) - (a.points ?? -1);
  });

  hidden.sort((a, b) => a.name.localeCompare(b.name));
  return { day, rows: visible, hidden };
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
  /** Summe der manuellen Korrekturen (Strafen/Boni), die ins Konto einfließen. */
  adjustment: number;
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
  const supabase = await getReadClient();
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

  // „Ich" pro Nutzer (league_access); exakter Kontostand aus user_budget.
  const myAccess = await getMyAccess();
  const isMe = myAccess ? managerId === myAccess.kbManagerId : Boolean(mgr.is_me);
  const cashActual =
    isMe && latest?.day != null ? ((await getMyBudget(league.id)).get(latest.day) ?? null) : null;
  const sinceMs = league.trackingSince ? Date.parse(league.trackingSince) : null;
  const transfersByManager = await getTransfersByManager(league.id);
  const transfers = (transfersByManager.get(managerId) ?? [])
    .filter((t) => sinceMs == null || (t.ts != null && Date.parse(t.ts) >= sinceMs))
    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));

  // Eigener Manager: exakter Kontostand aus /me/budget, sonst Rekonstruktion
  // (inkl. Login-Bonus als Tages-Summe ab Reset + manuelle Korrekturen).
  const loginBonus = loginBonusSinceReset(league.trackingSince, Date.now());
  const adjustment = (await getAdjustmentSums(league.id)).get(managerId) ?? 0;
  const matchdayBonus =
    league.gameMode === 2
      ? ((await getMatchdayBonusPoints(league.id)).get(managerId) ?? 0) * MATCHDAY_BONUS_PER_POINT
      : 0;
  const reconstructed =
    league.startBudget > 0
      ? reconstructCash(transfers, {
          startBudget: league.startBudget,
          prizes: loginBonus + adjustment + matchdayBonus,
        })
      : null;
  const cash = cashActual != null ? cashActual : reconstructed;
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
    isMe,
    day: latest?.day ?? null,
    teamValue,
    points: latest?.points ?? null,
    streak: latest?.streak ?? null,
    squadSize: latest?.squadSize ?? null,
    cash,
    maxBid: bid,
    adjustment,
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
  const supabase = await getReadClient();
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
  const supabase = await getReadClient();
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

export interface SquadLandscape {
  /** Wie viele der Top-N-Spieler (nach Punkten) hält jeder Manager. */
  starHolders: {
    managerId: string;
    managerName: string;
    isMe: boolean;
    count: number;
    points: number;
    marketValue: number;
  }[];
  /** Meine wertvollsten/punktbesten Spieler (nur eigener Kader). */
  myAssets: {
    playerId: string;
    name: string;
    position: string | null;
    points: number | null;
    marketValue: number | null;
  }[];
  /** Wie viele Top-N-Spieler ich selbst halte (Schnellblick). */
  myStars: number;
  topN: number;
  /** true, wenn ein eigener Manager (is_me) in dieser Liga bekannt ist. */
  hasMe: boolean;
}

/**
 * Spieler-Landschaft: Wo sitzen die Stars der Liga? In Kickbase gehört jeder
 * Spieler genau einem Manager — daher zählen wir, wie viele der Top-N-Spieler
 * (nach Saisonpunkten) jeder Manager hält, plus die eigenen Top-Assets.
 */
export async function getSquadLandscape(
  league: LeagueLite,
  topN = 20,
): Promise<SquadLandscape | null> {
  const supabase = await getReadClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("squad_players")
    .select("player_id, manager_id, points, avg_points, market_value, position")
    .eq("league_id", league.id);
  if (error || !data || data.length === 0) return null;

  const mids = [...new Set(data.map((r) => r.manager_id as string))];
  const pids = [...new Set(data.map((r) => r.player_id as string))];
  const [mRes, pRes] = await Promise.all([
    supabase.from("managers").select("id, name, is_me").eq("league_id", league.id).in("id", mids),
    supabase.from("players").select("id, name, position").in("id", pids),
  ]);
  const mmap = new Map<string, { name: string; isMe: boolean }>();
  for (const m of mRes.data ?? [])
    mmap.set(m.id as string, { name: (m.name as string) ?? (m.id as string), isMe: Boolean(m.is_me) });
  const pmap = new Map<string, { name?: string; position?: string }>();
  for (const p of pRes.data ?? [])
    pmap.set(p.id as string, { name: p.name as string, position: p.position as string });
  const meId = [...mmap.entries()].find(([, v]) => v.isMe)?.[0] ?? null;

  // Top-N-Spieler nach Punkten → Verteilung auf Manager.
  const byPoints = [...data].sort((a, b) => ((b.points as number) ?? -1) - ((a.points as number) ?? -1));
  const top = byPoints.slice(0, topN);
  const holders = new Map<string, { count: number; points: number; marketValue: number }>();
  for (const r of top) {
    const mid = r.manager_id as string;
    const h = holders.get(mid) ?? { count: 0, points: 0, marketValue: 0 };
    h.count += 1;
    h.points += (r.points as number) ?? 0;
    h.marketValue += (r.market_value as number) ?? 0;
    holders.set(mid, h);
  }
  const starHolders = [...holders.entries()]
    .map(([mid, h]) => ({
      managerId: mid,
      managerName: mmap.get(mid)?.name ?? mid,
      isMe: Boolean(mmap.get(mid)?.isMe),
      count: h.count,
      points: h.points,
      marketValue: h.marketValue,
    }))
    .sort((a, b) => b.count - a.count || b.points - a.points);

  const myAssets = meId
    ? data
        .filter((r) => (r.manager_id as string) === meId)
        .map((r) => ({
          playerId: r.player_id as string,
          name: pmap.get(r.player_id as string)?.name ?? `#${r.player_id}`,
          position: pmap.get(r.player_id as string)?.position ?? (r.position as string) ?? null,
          points: (r.points as number) ?? null,
          marketValue: (r.market_value as number) ?? null,
        }))
        .sort((a, b) => (b.points ?? -1) - (a.points ?? -1))
        .slice(0, 6)
    : [];
  const myStars = meId ? (holders.get(meId)?.count ?? 0) : 0;

  return { starHolders, myAssets, myStars, topN, hasMe: meId != null };
}

export interface MySquadPlayer {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  marketValue: number | null;
  points: number | null;
  avgPoints: number | null;
  /** Status aus dem squad-Endpunkt: 0 = fit, >0 = angeschlagen/Ausfall. */
  status: number | null;
  /** Letzter Kaufpreis (aus Transfers) — null, wenn nicht erfasst. */
  buyPrice: number | null;
  /** Unrealisierter Transfergewinn = Marktwert − Kaufpreis. */
  profit: number | null;
  /** Marktwert-Änderung seit gestern (heute − gestern) + Prozent (Basis gestern). */
  mvChangeDay: number | null;
  mvChangeDayPct: number | null;
  /** Marktwert-Änderung vorgestern→gestern + Prozent (Basis vorgestern). */
  mvChangePrev: number | null;
  mvChangePrevPct: number | null;
}

export interface MySquad {
  managerId: string;
  rows: MySquadPlayer[];
  teamValue: number;
  totalProfit: number;
}

/**
 * Eigener Kader mit allen erfassten Infos (Marktwert, Punkte, Ø, Status) plus
 * berechnetem Transfergewinn je Spieler (Marktwert − letzter Kaufpreis).
 */
export async function getMySquad(league: LeagueLite): Promise<MySquad | null> {
  const access = await getMyAccess();
  if (!access) return null;
  return getManagerSquad(league, access.kbManagerId);
}

/**
 * Kader EINES beliebigen Managers (für die Manager-Detailseite). Gleiche Infos
 * wie getMySquad: Marktwert, Punkte, Ø, Status, letzter Kaufpreis & Gewinn aus
 * der Transferhistorie dieses Managers. Marktwert-Momentum (mv_prev*) ist nur
 * für den eigenen Kader befüllt → bei Gegnern dort „—".
 */
export async function getManagerSquad(
  league: LeagueLite,
  managerId: string,
): Promise<MySquad | null> {
  const supabase = await getReadClient();
  if (!supabase) return null;
  const mid = managerId;

  const { data } = await supabase
    .from("squad_players")
    .select("player_id, points, avg_points, market_value, position, status, mv_prev_day, mv_prev2_day")
    .eq("league_id", league.id)
    .eq("manager_id", mid)
    .order("market_value", { ascending: false, nullsFirst: false });
  if (!data || data.length === 0) return { managerId: mid, rows: [], teamValue: 0, totalProfit: 0 };

  const pids = [...new Set(data.map((r) => r.player_id as string))];
  const { data: pdata } = await supabase
    .from("players")
    .select("id, name, position, team")
    .in("id", pids);
  const pmap = new Map<string, { name?: string; position?: string; team?: string }>();
  for (const p of pdata ?? [])
    pmap.set(p.id as string, { name: p.name as string, position: p.position as string, team: p.team as string });

  // Letzter Kaufpreis je Spieler aus den eigenen Transfers.
  const transfers = await getTransfersByManager(league.id);
  const mine = transfers.get(mid) ?? [];
  const lastBuy = new Map<string, { ts: string | null; price: number }>();
  for (const t of mine) {
    if (t.direction !== "buy") continue;
    const cur = lastBuy.get(t.playerId);
    if (!cur || (t.ts ?? "") > (cur.ts ?? "")) lastBuy.set(t.playerId, { ts: t.ts, price: t.price });
  }

  let teamValue = 0;
  let totalProfit = 0;
  const rows: MySquadPlayer[] = data.map((r) => {
    const pid = r.player_id as string;
    const meta = pmap.get(pid);
    const mv = (r.market_value as number) ?? null;
    const buy = lastBuy.get(pid)?.price ?? null;
    const profit = mv != null && buy != null ? mv - buy : null;
    if (mv != null) teamValue += mv;
    if (profit != null) totalProfit += profit;

    // Marktwert-Tagesentwicklung: heute (mv) vs. gestern (mvPrev) vs. vorgestern.
    const mvPrev = (r.mv_prev_day as number) ?? null;
    const mvPrev2 = (r.mv_prev2_day as number) ?? null;
    const mvChangeDay = mv != null && mvPrev != null ? mv - mvPrev : null;
    const mvChangeDayPct = mvChangeDay != null && mvPrev ? mvChangeDay / mvPrev : null;
    const mvChangePrev = mvPrev != null && mvPrev2 != null ? mvPrev - mvPrev2 : null;
    const mvChangePrevPct = mvChangePrev != null && mvPrev2 ? mvChangePrev / mvPrev2 : null;

    return {
      playerId: pid,
      name: meta?.name ?? `#${pid}`,
      position: meta?.position ?? (r.position as string) ?? null,
      team: meta?.team ?? null,
      marketValue: mv,
      points: (r.points as number) ?? null,
      avgPoints: (r.avg_points as number) ?? null,
      status: (r.status as number) ?? null,
      buyPrice: buy,
      profit,
      mvChangeDay,
      mvChangeDayPct,
      mvChangePrev,
      mvChangePrevPct,
    };
  });
  return { managerId: mid, rows, teamValue, totalProfit };
}

// ---------- News / Signale ----------

/** Kickbase-Statuscodes → lesbares Label (best-effort, konservativ). */
const STATUS_LABELS: Record<number, string> = {
  1: "Verletzt",
  2: "Angeschlagen",
  4: "Aufbautraining",
  8: "Gesperrt",
  16: "Gelb-gesperrt",
  32: "Nicht im Kader",
};
export function statusLabel(status: number | null): string {
  if (status == null || status === 0) return "Fit";
  return STATUS_LABELS[status] ?? "Ausfall/fraglich";
}

export interface InjuryNews {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  status: number;
  label: string;
  managerId: string;
  managerName: string;
  isMine: boolean;
}

export interface MoverNews {
  playerId: string;
  name: string;
  marketValue: number | null;
  change: number;
  changePct: number | null;
}

export interface ExternalInjuryNews {
  playerName: string;
  teamName: string | null;
  type: string | null;
  reason: string | null;
  fixtureDate: string | null;
  kbPlayerId: string | null;
}

export interface LeagueNews {
  injuries: InjuryNews[];
  risers: MoverNews[];
  fallers: MoverNews[];
  externalInjuries: ExternalInjuryNews[];
}

/**
 * Kickbase-interne Signale für die News-Seite:
 *  - Verletzungen/Ausfälle liga-weit (squad_players.status > 0),
 *  - eigene Marktwert-Gewinner/-Verlierer seit gestern (aus der MV-Historie).
 * Externe Quellen (Transfermarkt, Ligainsider, …) folgen separat.
 */
export async function getLeagueNews(league: LeagueLite): Promise<LeagueNews> {
  const supabase = await getReadClient();
  if (!supabase) return { injuries: [], risers: [], fallers: [], externalInjuries: [] };

  const access = await getMyAccess();
  const myManagerId = access?.kbManagerId ?? null;

  // 1) Ausfälle liga-weit: Kaderspieler mit status > 0.
  const { data: hurt } = await supabase
    .from("squad_players")
    .select("player_id, manager_id, status")
    .eq("league_id", league.id)
    .gt("status", 0);

  const rows = hurt ?? [];
  const pids = [...new Set(rows.map((r) => r.player_id as string))];
  const mids = [...new Set(rows.map((r) => r.manager_id as string))];

  const pmap = new Map<string, { name?: string; position?: string; team?: string }>();
  if (pids.length > 0) {
    const { data } = await supabase.from("players").select("id, name, position, team").in("id", pids);
    for (const p of data ?? [])
      pmap.set(p.id as string, {
        name: p.name as string,
        position: p.position as string,
        team: p.team as string,
      });
  }
  const nmap = new Map<string, string>();
  if (mids.length > 0) {
    const { data } = await supabase.from("managers").select("id, name").eq("league_id", league.id).in("id", mids);
    for (const m of data ?? []) nmap.set(m.id as string, m.name as string);
  }

  const injuries: InjuryNews[] = rows
    .map((r) => {
      const pid = r.player_id as string;
      const mid = r.manager_id as string;
      const status = (r.status as number) ?? 0;
      return {
        playerId: pid,
        name: pmap.get(pid)?.name ?? `#${pid}`,
        position: pmap.get(pid)?.position ?? null,
        team: pmap.get(pid)?.team ?? null,
        status,
        label: statusLabel(status),
        managerId: mid,
        managerName: nmap.get(mid) ?? mid,
        isMine: myManagerId != null && mid === myManagerId,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // 2) Eigene Marktwert-Bewegungen seit gestern.
  const squad = await getMySquad(league);
  const movers = (squad?.rows ?? [])
    .filter((p) => p.mvChangeDay != null && p.mvChangeDay !== 0)
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      marketValue: p.marketValue,
      change: p.mvChangeDay as number,
      changePct: p.mvChangeDayPct,
    }));
  const risers = movers.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, 5);
  const fallers = movers.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 5);

  // 3) Externe Ausfälle (api-football), global gespeichert. Kickbase-Treffer
  //    (kb_player_id gesetzt) zuerst — die sind für die Liga am relevantesten.
  const { data: ext } = await supabase
    .from("external_injuries")
    .select("player_name, team_name, type, reason, fixture_date, kb_player_id")
    .order("fixture_date", { ascending: false })
    .limit(60);
  const externalInjuries: ExternalInjuryNews[] = (ext ?? [])
    .map((r) => ({
      playerName: (r.player_name as string) ?? "—",
      teamName: (r.team_name as string) ?? null,
      type: (r.type as string) ?? null,
      reason: (r.reason as string) ?? null,
      fixtureDate: (r.fixture_date as string) ?? null,
      kbPlayerId: (r.kb_player_id as string) ?? null,
    }))
    .sort((a, b) => Number(Boolean(b.kbPlayerId)) - Number(Boolean(a.kbPlayerId)));

  return { injuries, risers, fallers, externalInjuries };
}

export interface OverpayStat {
  /** Ø Overpay je Kauf (Kaufpreis − Marktwert am Kauftag). */
  avg: number | null;
  /** Summe Overpay über alle erfassten Käufe. */
  total: number;
  /** Anzahl Käufe mit bekanntem Marktwert-zum-Zeitpunkt. */
  count: number;
}

/**
 * Overpay-Statistik eines Managers: gezahlter Aufpreis über dem Marktwert je
 * Kauf. Basis ist `transfers.mv_at_time` (im Collector aus der MV-Kurve
 * gebackfillt). Positiv = über Marktwert gekauft.
 */
export async function getOverpay(league: LeagueLite, managerId: string): Promise<OverpayStat> {
  const supabase = await getReadClient();
  if (!supabase) return { avg: null, total: 0, count: 0 };
  const { data } = await supabase
    .from("transfers")
    .select("price, mv_at_time")
    .eq("league_id", league.id)
    .eq("to_manager", managerId)
    .eq("direction", "buy")
    .not("mv_at_time", "is", null);
  let total = 0;
  let count = 0;
  for (const r of data ?? []) {
    const mv = r.mv_at_time as number | null;
    if (mv == null) continue;
    total += ((r.price as number) ?? 0) - mv;
    count += 1;
  }
  return { avg: count > 0 ? Math.round(total / count) : null, total, count };
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

export interface PlayerHolder {
  managerId: string;
  managerName: string;
  points: number | null;
  marketValue: number | null;
}

/** Aktueller Besitzer eines Spielers in dieser Liga (aus dem Kaderbestand). */
export async function getPlayerHolder(
  league: LeagueLite,
  playerId: string,
): Promise<PlayerHolder | null> {
  const supabase = await getReadClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("squad_players")
    .select("manager_id, points, market_value")
    .eq("league_id", league.id)
    .eq("player_id", playerId)
    .maybeSingle();
  if (!data) return null;
  const { data: m } = await supabase
    .from("managers")
    .select("name")
    .eq("league_id", league.id)
    .eq("id", data.manager_id as string)
    .maybeSingle();
  return {
    managerId: data.manager_id as string,
    managerName: (m?.name as string) ?? (data.manager_id as string),
    points: (data.points as number) ?? null,
    marketValue: (data.market_value as number) ?? null,
  };
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
  const supabase = await getReadClient();
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
  const supabase = await getReadClient();
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
