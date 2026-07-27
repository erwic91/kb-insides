import { getServiceClient } from "./client";
import type { LeagueRow, ManagerRow, SnapshotRow } from "../ingest/ranking";
import type { TransferRow } from "../ingest/transfers";

/**
 * Idempotente Upserts auf die Primärschlüssel aus der Migration (SPEC §5).
 * Mehrfachläufe am selben Tag aktualisieren dieselben Zeilen statt zu duplizieren.
 *
 * Bewusst NICHT gesetzte Spalten (z. B. `is_me`, `start_budget`, `cash_*`) bleiben
 * bei bestehenden Zeilen unverändert — sie werden in späteren Meilensteinen
 * (M4) befüllt und dürfen hier nicht überschrieben werden.
 */

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
