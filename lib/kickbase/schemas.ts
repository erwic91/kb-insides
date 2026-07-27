import { z } from "zod";

/**
 * zod-Schemas für die Kickbase-v4-Antworten (verifiziert an den echten Fixtures
 * unter /fixtures, Checkpoint B). Kickbase nutzt kurze, kryptische Keys und
 * liefert je nach Manager-Aktivität unterschiedlich viele Felder — deshalb sind
 * fast alle Felder optional und die Objekte `.passthrough()` (unbekannte Felder
 * überleben, statt die Validierung zu sprengen).
 */

/** Ein Manager-Eintrag im Ranking (`us[]`). Inaktive Manager haben kein tv/sp. */
export const RankingUserSchema = z
  .object({
    i: z.string(), // Manager-/User-ID (in v4 global, aber je Liga eigene Daten)
    n: z.string().optional(), // Anzeigename
    tv: z.number().optional(), // Kaderwert (Team Value)
    sp: z.number().optional(), // Saisonpunkte
    spl: z.number().optional(), // Saison-Platzierung
    mdp: z.number().optional(), // Spieltagspunkte
    mdpl: z.number().optional(), // Spieltags-Platzierung
    lp: z.array(z.number()).optional(), // Punkte je Spieltag (Serie)
    adm: z.boolean().optional(),
    uim: z.string().optional(),
  })
  .passthrough();
export type RankingUser = z.infer<typeof RankingUserSchema>;

/** Antwort von `/v4/leagues/{lid}/ranking`. */
export const RankingSchema = z
  .object({
    ti: z.string().optional(), // Liga-Titel
    day: z.number(), // aktueller Spieltag (dayNumber)
    sn: z.string().optional(), // Saison, z. B. "25/26"
    us: z.array(RankingUserSchema), // Manager
  })
  .passthrough();
export type Ranking = z.infer<typeof RankingSchema>;

/** Antwort von `/v4/leagues/{lid}/overview` (Teilmenge, die wir nutzen). */
export const OverviewSchema = z
  .object({
    i: z.string().optional(), // Liga-ID
    lnm: z.string().optional(), // Liga-Name
    cpn: z.string().optional(), // Wettbewerbsname ("Bundesliga")
    mgc: z.number().optional(), // Mitgliederzahl
  })
  .passthrough();
export type Overview = z.infer<typeof OverviewSchema>;

/** Antwort von `/v4/leagues/{lid}/me/budget` — exakter eigener Kontostand. */
export const MeBudgetSchema = z
  .object({
    b: z.number(), // Kontostand in ganzen Euro
  })
  .passthrough();
export type MeBudget = z.infer<typeof MeBudgetSchema>;
