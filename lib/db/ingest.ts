import { getServiceClient } from "./client";
import type { LeagueRow, ManagerRow, SnapshotRow } from "../ingest/ranking";
import type { TransferRow } from "../ingest/transfers";
import type { LeagueSelectionRow } from "../ingest/leaguesSelection";
import type { PlayerRow, MarketLogRow, PlayerMvRow } from "../ingest/market";

/**
 * Idempotente Upserts auf die Primärschlüssel aus der Migration (SPEC §5).
 * Mehrfachläufe am selben Tag aktualisieren dieselben Zeilen statt zu duplizieren.
 *
 * Bewusst NICHT gesetzte Spalten (z. B. `is_me`, `start_budget`, `cash_*`) bleiben
 * bei bestehenden Zeilen unverändert — sie werden in späteren Meilensteinen
 * (M4) befüllt und dürfen hier nicht überschrieben werden.
 */

/** Liest den Monitoring-Startpunkt einer Liga (null = keine Grenze). */
export async function getLeagueTrackingSince(leagueId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("leagues")
    .select("tracking_since")
    .eq("id", leagueId)
    .maybeSingle();
  return (data?.tracking_since as string) ?? null;
}

/** Budget-Basis einer Liga: Startpunkt + Start-Budget (für Rekonstruktion). */
export async function getLeagueMoneyBasis(
  leagueId: string,
): Promise<{ trackingSince: string | null; startBudget: number | null }> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("leagues")
    .select("tracking_since, start_budget")
    .eq("id", leagueId)
    .maybeSingle();
  return {
    trackingSince: (data?.tracking_since as string) ?? null,
    startBudget: (data?.start_budget as number) ?? null,
  };
}

export interface LeagueSettingsInput {
  game_mode?: number | null;
  start_budget?: number | null;
  tracking_since?: string | null;
  include_history?: boolean;
  bonus_mode?: string;
}

/** Aktualisiert die per-Liga-Einstellungen (nur übergebene Felder). */
export async function updateLeagueSettings(
  leagueId: string,
  s: LeagueSettingsInput,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (s.game_mode !== undefined) patch.game_mode = s.game_mode;
  if (s.start_budget !== undefined) patch.start_budget = s.start_budget;
  if (s.tracking_since !== undefined) patch.tracking_since = s.tracking_since;
  if (s.include_history !== undefined) patch.include_history = s.include_history;
  if (s.bonus_mode !== undefined) patch.bonus_mode = s.bonus_mode;
  if (Object.keys(patch).length === 0) return;
  const supabase = getServiceClient();
  const { error } = await supabase.from("leagues").update(patch).eq("id", leagueId);
  if (error) throw new Error(`Liga-Einstellungen fehlgeschlagen: ${error.message}`);
}

/** Setzt den Monitoring-Startpunkt einer Liga (ISO-String oder null zum Löschen). */
export async function setLeagueTrackingSince(
  leagueId: string,
  since: string | null,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("leagues")
    .update({ tracking_since: since })
    .eq("id", leagueId);
  if (error) throw new Error(`tracking_since setzen fehlgeschlagen: ${error.message}`);
}

export interface SquadPlayerRow {
  league_id: string;
  player_id: string;
  manager_id: string;
  points: number | null;
  avg_points: number | null;
  market_value: number | null;
  position: string | null;
}

/** Ersetzt den Kaderbestand einer Liga (delete + insert) — keine Karteileichen. */
export async function replaceSquadPlayers(
  leagueId: string,
  rows: SquadPlayerRow[],
): Promise<void> {
  const supabase = getServiceClient();
  const { error: delErr } = await supabase
    .from("squad_players")
    .delete()
    .eq("league_id", leagueId);
  if (delErr) throw new Error(`squad_players löschen fehlgeschlagen: ${delErr.message}`);
  if (rows.length === 0) return;
  // Dedupe auf (league, player) — ein Spieler gehört genau einem Manager.
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (seen.has(r.player_id)) return false;
    seen.add(r.player_id);
    return true;
  });
  const { error } = await supabase.from("squad_players").insert(unique);
  if (error) throw new Error(`squad_players insert fehlgeschlagen: ${error.message}`);
}

/** Löscht Transfers vor einem Zeitpunkt (saubere Basis beim Tracking-Start). */
export async function deleteTransfersBefore(
  leagueId: string,
  before: string,
): Promise<number> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("transfers")
    .delete()
    .eq("league_id", leagueId)
    .lt("ts", before)
    .select("id");
  if (error) throw new Error(`Transfers löschen fehlgeschlagen: ${error.message}`);
  return data?.length ?? 0;
}

export async function upsertLeague(league: LeagueRow): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("leagues")
    .upsert({ id: league.id, name: league.name }, { onConflict: "id" });
  if (error) throw new Error(`leagues upsert fehlgeschlagen: ${error.message}`);
}

export async function upsertManagers(managers: ManagerRow[]): Promise<void> {
  if (managers.length === 0) return;
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("managers")
    .upsert(managers, { onConflict: "league_id,id" });
  if (error) throw new Error(`managers upsert fehlgeschlagen: ${error.message}`);
}

export async function upsertManagerSnapshots(snapshots: SnapshotRow[]): Promise<void> {
  if (snapshots.length === 0) return;
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("manager_snapshots")
    .upsert(snapshots, { onConflict: "league_id,manager_id,day" });
  if (error) throw new Error(`manager_snapshots upsert fehlgeschlagen: ${error.message}`);
}

export async function upsertTransfers(transfers: TransferRow[]): Promise<void> {
  if (transfers.length === 0) return;
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("transfers")
    .upsert(transfers, { onConflict: "league_id,id" });
  if (error) throw new Error(`transfers upsert fehlgeschlagen: ${error.message}`);
}

/** Markiert genau einen Manager als „ich" (is_me) in einer Liga. */
export async function markIsMe(leagueId: string, managerId: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("managers")
    .update({ is_me: true })
    .eq("league_id", leagueId)
    .eq("id", managerId);
  if (error) throw new Error(`is_me setzen fehlgeschlagen: ${error.message}`);
}

/** Alle Ligen des Nutzers (aus /selection) — Basis für den Liga-Switch. */
export async function upsertLeagues(leagues: LeagueSelectionRow[]): Promise<void> {
  if (leagues.length === 0) return;
  const supabase = getServiceClient();
  // WICHTIG: nur Kickbase-„Fakten" synchronisieren (Name, Default, Spielmodus).
  // start_budget / tracking_since / include_history / bonus_mode sind vom Nutzer
  // konfiguriert und dürfen NICHT bei jedem Sammel-Lauf überschrieben werden.
  // Spalten, die hier fehlen, lässt Supabase auf bestehenden Zeilen unangetastet.
  const facts = leagues.map((l) => ({
    id: l.id,
    name: l.name,
    is_default: l.is_default,
    game_mode: l.game_mode,
  }));
  const { error } = await supabase.from("leagues").upsert(facts, { onConflict: "id" });
  if (error) throw new Error(`leagues upsert fehlgeschlagen: ${error.message}`);
}

export async function upsertPlayers(players: PlayerRow[]): Promise<void> {
  if (players.length === 0) return;
  const supabase = getServiceClient();
  const { error } = await supabase.from("players").upsert(players, { onConflict: "id" });
  if (error) throw new Error(`players upsert fehlgeschlagen: ${error.message}`);
}

export async function upsertMarketLog(rows: MarketLogRow[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("market_log")
    .upsert(rows, { onConflict: "league_id,player_id,expiry_ts" });
  if (error) throw new Error(`market_log upsert fehlgeschlagen: ${error.message}`);
}

export async function upsertPlayerMv(rows: PlayerMvRow[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("player_mv")
    .upsert(rows, { onConflict: "league_id,player_id,day" });
  if (error) throw new Error(`player_mv upsert fehlgeschlagen: ${error.message}`);
}

/** Kalibrierungszeile (eigene Rekonstruktion vs. /me/budget). */
export async function upsertCalibration(row: {
  league_id: string;
  day: number;
  my_reconstructed: number | null;
  my_actual: number | null;
  delta: number | null;
}): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("calibration")
    .upsert(row, { onConflict: "league_id,day" });
  if (error) throw new Error(`calibration upsert fehlgeschlagen: ${error.message}`);
}
