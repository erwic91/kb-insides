import { LeaguesSelectionSchema, type LeaguesSelection } from "../kickbase/schemas";
import { START_BUDGET } from "../compute/constants";

export interface LeagueSelectionRow {
  id: string;
  name: string;
  start_budget: number;
  is_default: boolean;
}

/**
 * Parst `/v4/leagues/selection` → alle Ligen des Nutzers als leagues-Zeilen.
 * Quelle für den globalen Liga-Switch: liefert Namen, Startbudget und die
 * Default-Liga (`idf`) — unabhängig davon, ob schon Ranking-Daten vorliegen.
 */
export function parseLeaguesSelection(
  input: LeaguesSelection | unknown,
): LeagueSelectionRow[] {
  const res = LeaguesSelectionSchema.parse(input);
  return res.it.map((l) => ({
    id: l.i,
    name: l.n,
    start_budget: l.b ?? START_BUDGET,
    is_default: Boolean(l.idf),
  }));
}
