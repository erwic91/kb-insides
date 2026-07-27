import { kbFetch, type KbFetchOptions } from "./http";
import {
  RankingSchema,
  OverviewSchema,
  MeBudgetSchema,
  type Ranking,
  type Overview,
  type MeBudget,
} from "./schemas";

/**
 * Typisierte, zod-validierte Wrapper für die ligagebundenen Endpunkte (SPEC §6).
 * Feldnamen sind an den echten Fixtures (Checkpoint B) verifiziert.
 */

interface EndpointOptions extends KbFetchOptions {
  token: string;
}

/** `/v4/leagues/{lid}/ranking` — optional für einen bestimmten Spieltag. */
export async function fetchRanking(
  leagueId: string,
  opts: EndpointOptions & { dayNumber?: number },
): Promise<Ranking> {
  const { dayNumber, ...fetchOpts } = opts;
  const path =
    dayNumber != null
      ? `/v4/leagues/${leagueId}/ranking?dayNumber=${dayNumber}`
      : `/v4/leagues/${leagueId}/ranking`;
  const raw = await kbFetch<unknown>(path, fetchOpts);
  return RankingSchema.parse(raw);
}

/** `/v4/leagues/{lid}/overview` — Liga-Metadaten. */
export async function fetchOverview(leagueId: string, opts: EndpointOptions): Promise<Overview> {
  const raw = await kbFetch<unknown>(`/v4/leagues/${leagueId}/overview`, opts);
  return OverviewSchema.parse(raw);
}

/** `/v4/leagues/{lid}/me/budget` — exakter eigener Kontostand. */
export async function fetchMeBudget(leagueId: string, opts: EndpointOptions): Promise<MeBudget> {
  const raw = await kbFetch<unknown>(`/v4/leagues/${leagueId}/me/budget`, opts);
  return MeBudgetSchema.parse(raw);
}
