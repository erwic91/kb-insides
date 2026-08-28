"use server";

import {
  resolveLeague,
  getManagerDetail,
  getManagerSquad,
  type ManagerDetail,
  type MySquad,
} from "../../lib/db/queries";

export interface ManagerPanelData {
  detail: ManagerDetail;
  squad: MySquad | null;
}

/**
 * Lädt die Detaildaten eines Managers für das Dashboard-Seitenpanel
 * (Explorer). Session-authentifiziert über resolveLeague (RLS). Null, wenn die
 * Liga/der Manager nicht zugänglich ist.
 */
export async function loadManagerPanel(
  leagueId: string,
  managerId: string,
): Promise<ManagerPanelData | null> {
  const league = await resolveLeague(leagueId);
  if (!league) return null;
  const [detail, squad] = await Promise.all([
    getManagerDetail(league, managerId),
    getManagerSquad(league, managerId),
  ]);
  if (!detail) return null;
  return { detail, squad };
}
