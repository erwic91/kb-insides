"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/supabase/server";
import { userHasLeagueAccess } from "../../../lib/db/connections";
import { addAdjustment, deleteAdjustment } from "../../../lib/db/adjustments";

/**
 * Server-Actions für manuelle Kontostand-Korrekturen (Strafen/Boni) eines
 * Managers. Nur eingeloggte Nutzer MIT Zugriff auf die Liga dürfen ändern.
 */

function back(managerId: string, leagueId: string, q = ""): never {
  redirect(`/manager/${managerId}?league=${encodeURIComponent(leagueId)}${q}`);
}

export async function addManagerAdjustment(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const managerId = String(formData.get("managerId") ?? "").trim();
  if (!leagueId || !managerId) redirect("/");
  if (!(await userHasLeagueAccess(user!.id, leagueId))) back(managerId, leagueId, "&err=access");

  const eurVal = Number(formData.get("amount"));
  if (!Number.isFinite(eurVal) || eurVal <= 0) back(managerId, leagueId, "&err=amount");
  const sign = formData.get("kind") === "bonus" ? 1 : -1; // Standard: Strafe (−)
  const amount = Math.round(eurVal) * sign;
  const note = String(formData.get("note") ?? "").trim() || null;

  await addAdjustment({ leagueId, managerId, amount, note, userId: user!.id });
  back(managerId, leagueId, "&ok=added");
}

export async function removeManagerAdjustment(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const managerId = String(formData.get("managerId") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  if (!leagueId || !managerId || !id) redirect("/");
  if (!(await userHasLeagueAccess(user!.id, leagueId))) back(managerId, leagueId, "&err=access");

  await deleteAdjustment(id, leagueId);
  back(managerId, leagueId, "&ok=removed");
}
