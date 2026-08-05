import { optionalEnv } from "../env";

/**
 * Minimaler Client für api-football (API-Sports, direkter Zugang mit
 * `x-apisports-key`). WICHTIG: den DIREKTEN Key von api-football.com nutzen,
 * NICHT den RapidAPI-Umweg — nur der direkte Free-Tier enthält die aktuelle
 * Saison. Endpunkt: /injuries?league=<id>&season=<startjahr>.
 */

const DEFAULT_BASE = "https://v3.football.api-sports.io";
const DEFAULT_LEAGUE = 78; // Bundesliga

export function apiFootballKey(): string | null {
  return optionalEnv("API_FOOTBALL_KEY") ?? null;
}
export function apiFootballBase(): string {
  return optionalEnv("API_FOOTBALL_BASE_URL") ?? DEFAULT_BASE;
}
export function apiFootballLeague(): number {
  const raw = optionalEnv("API_FOOTBALL_LEAGUE");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : DEFAULT_LEAGUE;
}

/** api-football-Saison = Startjahr (ab Juli neue Saison, sonst Vorjahr). */
export function currentSeason(nowMs = Date.now()): number {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 6 ? y : y - 1;
}

export interface ExternalInjury {
  playerExtId: number | null;
  playerName: string | null;
  teamExtId: number | null;
  teamName: string | null;
  type: string | null;
  reason: string | null;
  fixtureDate: string | null;
}

interface InjuriesRaw {
  response?: Array<{
    player?: { id?: number; name?: string; type?: string; reason?: string };
    team?: { id?: number; name?: string };
    fixture?: { date?: string };
  }>;
}

/**
 * Holt die Ausfall-/Sperrliste einer Liga+Saison. Wirft ohne Key oder bei
 * HTTP-Fehler. Gibt normalisierte Items + die Rohantwort (zur Verifikation).
 */
export async function fetchInjuries(
  season = currentSeason(),
  league = apiFootballLeague(),
): Promise<{ items: ExternalInjury[]; raw: unknown }> {
  const key = apiFootballKey();
  if (!key) throw new Error("API_FOOTBALL_KEY fehlt");
  const url = `${apiFootballBase()}/injuries?league=${league}&season=${season}`;
  const res = await fetch(url, {
    headers: { "x-apisports-key": key },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`api-football HTTP ${res.status}`);
  const raw = (await res.json()) as InjuriesRaw;
  const items: ExternalInjury[] = (raw.response ?? []).map((r) => ({
    playerExtId: r.player?.id ?? null,
    playerName: r.player?.name ?? null,
    teamExtId: r.team?.id ?? null,
    teamName: r.team?.name ?? null,
    type: r.player?.type ?? null,
    reason: r.player?.reason ?? null,
    fixtureDate: r.fixture?.date ?? null,
  }));
  return { items, raw };
}
