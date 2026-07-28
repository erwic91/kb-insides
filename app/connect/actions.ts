"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/supabase/server";
import { login } from "../../lib/kickbase/auth";
import {
  storeConnection,
  getConnectionState,
  activateLeague,
  disconnect,
} from "../../lib/db/connections";

/**
 * Server-Actions für den Kickbase-Verbinden-Flow (Design §7). Kickbase-Passwort
 * wird nur zum einmaligen Login verwendet und NICHT gespeichert — es verlässt
 * diese Funktion nicht.
 */

/** Schritt 1: Kickbase-Login → verschlüsselte Tokens speichern. */
export async function connectKickbase(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const email = String(formData.get("kbEmail") ?? "").trim();
  const password = String(formData.get("kbPassword") ?? "");
  const consent = formData.get("consent");
  if (!email || !password) redirect("/connect?error=missing");
  if (!consent) redirect("/connect?error=consent");

  try {
    const tokens = await login({ email, password });
    if (!tokens.ownUserId) redirect("/connect?error=nouser");
    await storeConnection(user!.id, tokens.ownUserId, tokens);
  } catch {
    redirect("/connect?error=login");
  }
  redirect("/connect?ok=connected");
}

/** Schritt 2: EINE Liga aktivieren (7-Tage-Wechselsperre greift hier). */
export async function selectLeague(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const leagueId = String(formData.get("leagueId") ?? "").trim();
  if (!leagueId) redirect("/connect?error=noleague");

  const state = await getConnectionState(user!.id);
  if (!state) redirect("/connect?error=noconnection");

  const decision = await activateLeague(user!.id, {
    leagueId,
    kbManagerId: state!.kbUserId,
  });
  if (!decision.allowed) {
    redirect(`/connect?error=cooldown&until=${encodeURIComponent(decision.availableAt)}`);
  }
  redirect("/connect?ok=activated");
}

/** Kickbase trennen (Sperr-Marker bleibt erhalten). */
export async function disconnectKickbase(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await disconnect(user!.id);
  redirect("/connect?ok=disconnected");
}
