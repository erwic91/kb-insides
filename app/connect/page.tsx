import Link from "next/link";
import { getCurrentUser } from "../../lib/supabase/server";
import { getConnectionState, getDecryptedTokens } from "../../lib/db/connections";
import { fetchLeaguesSelection } from "../../lib/kickbase/endpoints";
import { parseLeaguesSelection } from "../../lib/ingest/leaguesSelection";
import { SWITCH_COOLDOWN_DAYS } from "../../lib/compute/leagueBinding";
import { connectKickbase, selectLeague, disconnectKickbase } from "./actions";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

const ERRORS: Record<string, string> = {
  missing: "Bitte Kickbase-E-Mail und -Passwort eingeben.",
  consent: "Bitte der Verarbeitung zustimmen.",
  login: "Kickbase-Login fehlgeschlagen — E-Mail/Passwort prüfen.",
  nouser: "Konnte die Kickbase-User-ID nicht ermitteln.",
  noleague: "Keine Liga ausgewählt.",
  noconnection: "Keine Kickbase-Verbindung gefunden.",
  cooldown: "Liga-Wechsel noch gesperrt (7-Tage-Frist).",
};
const OKS: Record<string, string> = {
  connected: "Kickbase verbunden. Wähle jetzt deine Liga.",
  activated: "Liga aktiviert.",
  disconnected: "Kickbase getrennt.",
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; until?: string }>;
}) {
  const { error, ok, until } = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="wrap">
        <div className="page-head">
          <span className="eyebrow">Kickbase verbinden</span>
          <h1>Nicht angemeldet</h1>
        </div>
        <div className="card card-pad">
          <p>
            Bitte zuerst <Link href="/login" className="linklike">anmelden</Link>.
          </p>
        </div>
      </main>
    );
  }

  const state = await getConnectionState(user.id);

  // Ligen laden, falls verbunden.
  let leagues: { id: string; name: string }[] = [];
  let loadError = false;
  if (state && state.status === "active") {
    try {
      const tokens = await getDecryptedTokens(user.id);
      if (tokens) {
        const sel = await fetchLeaguesSelection({ token: tokens.accessToken });
        leagues = parseLeaguesSelection(sel).map((l) => ({ id: l.id, name: l.name }));
      }
    } catch {
      loadError = true;
    }
  }

  // 7-Tage-Wechselsperre für die UI.
  const activatedMs = state?.leagueActivatedAt ? Date.parse(state.leagueActivatedAt) : null;
  const switchAt = activatedMs != null ? activatedMs + SWITCH_COOLDOWN_DAYS * DAY_MS : null;
  const canSwitch = switchAt == null || Date.now() >= switchAt;
  const fmt = (ms: number) => new Date(ms).toLocaleDateString("de-DE");

  return (
    <main className="wrap">
      <div className="page-head" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="eyebrow">Kickbase verbinden</span>
          <h1>Dein Zugang</h1>
          <p className="sub">Angemeldet als {user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="btn" type="submit">Abmelden</button>
        </form>
      </div>

      {error && <div className="notice warn">{ERRORS[error] ?? "Fehler."}
        {error === "cooldown" && until ? ` Wechsel ab ${fmt(Date.parse(until))} möglich.` : ""}
      </div>}
      {ok && <div className="notice">{OKS[ok] ?? "OK."}</div>}

      {!state ? (
        <ConnectForm />
      ) : (
        <>
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <p className="card-title">Verbindung</p>
            <p>
              Kickbase-Konto verbunden{state.status !== "active" ? " (bitte neu verbinden)" : ""}.
              {state.activeLeagueId ? (
                <> Aktive Liga: <strong>{leagues.find((l) => l.id === state.activeLeagueId)?.name ?? state.activeLeagueId}</strong>.</>
              ) : (
                <> Noch keine Liga aktiviert.</>
              )}
            </p>
            {state.activeLeagueId && !canSwitch && switchAt != null && (
              <p className="note">Liga-Wechsel ab {fmt(switchAt)} möglich (7-Tage-Frist).</p>
            )}
            <form action={disconnectKickbase} style={{ marginTop: 12 }}>
              <button className="btn" type="submit">Kickbase trennen</button>
            </form>
          </div>

          <section className="section">
            <div className="section-head">
              <h2>Liga wählen</h2>
              <span className="note">genau eine aktive Liga</span>
            </div>
            {loadError ? (
              <div className="notice warn">Ligen konnten nicht geladen werden — bitte neu verbinden.</div>
            ) : leagues.length === 0 ? (
              <div className="notice">Keine Ligen gefunden.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="l">Liga</th>
                      <th className="l">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {leagues.map((l) => {
                      const isActive = l.id === state.activeLeagueId;
                      // Wechsel auf eine ANDERE Liga nur nach Ablauf der Frist.
                      const blocked = !isActive && state.activeLeagueId != null && !canSwitch;
                      return (
                        <tr key={l.id}>
                          <td className="l">{l.name}</td>
                          <td className="l muted">{isActive ? "aktiv" : blocked ? "gesperrt" : "—"}</td>
                          <td>
                            {isActive ? (
                              <span className="badge accent">aktiv</span>
                            ) : (
                              <form action={selectLeague}>
                                <input type="hidden" name="leagueId" value={l.id} />
                                <button className="btn" type="submit" disabled={blocked}>
                                  {state.activeLeagueId ? "Wechseln" : "Aktivieren"}
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function ConnectForm() {
  return (
    <div className="card card-pad" style={{ maxWidth: 520 }}>
      <p className="card-title">Kickbase verbinden</p>
      <p className="note" style={{ marginBottom: 12 }}>
        Wir speichern ein verschlüsseltes Zugriffs-Token, <strong>nicht dein Passwort</strong>, und
        rufen damit die Daten deiner Liga ab.
      </p>
      <form action={connectKickbase} style={{ display: "grid", gap: 12 }}>
        <input
          type="email"
          name="kbEmail"
          required
          placeholder="Kickbase-E-Mail"
          style={inputStyle}
        />
        <input
          type="password"
          name="kbPassword"
          required
          placeholder="Kickbase-Passwort"
          style={inputStyle}
        />
        <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
          <input type="checkbox" name="consent" value="1" required style={{ marginTop: 3 }} />
          <span>
            Ich verbinde meinen Kickbase-Account mit Ligamonitor. Es wird ein Token (verschlüsselt)
            gespeichert, nicht mein Passwort. Ich kann jederzeit trennen und meine Daten löschen
            lassen.
          </span>
        </label>
        <button className="btn" type="submit">Verbinden</button>
      </form>
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 3,
  fontFamily: "var(--body)",
  fontSize: 14,
} as const;
