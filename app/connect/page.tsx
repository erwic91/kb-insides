import Link from "next/link";
import { getCurrentUser } from "../../lib/supabase/server";
import {
  getConnectionState,
  getDecryptedTokens,
  getUserLeagues,
  getMaxLeagues,
  reconcileLeagueAccess,
} from "../../lib/db/connections";
import { fetchLeaguesSelection } from "../../lib/kickbase/endpoints";
import { parseLeaguesSelection } from "../../lib/ingest/leaguesSelection";
import { SWITCH_COOLDOWN_DAYS } from "../../lib/compute/leagueBinding";
import { connectKickbase, selectLeague, removeLeague, disconnectKickbase } from "./actions";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

const ERRORS: Record<string, string> = {
  missing: "Bitte Kickbase-E-Mail und -Passwort eingeben.",
  consent: "Bitte der Verarbeitung zustimmen.",
  login: "Kickbase-Login fehlgeschlagen — E-Mail/Passwort prüfen.",
  nouser: "Konnte die Kickbase-User-ID nicht ermitteln.",
  noleague: "Keine Liga ausgewählt.",
  noconnection: "Keine Kickbase-Verbindung gefunden.",
  atcap: "Liga-Limit erreicht — entferne zuerst eine Liga.",
  removecooldown: "Entfernen noch gesperrt (7-Tage-Frist).",
};
const OKS: Record<string, string> = {
  connected: "Kickbase verbunden. Wähle jetzt deine Liga(en).",
  activated: "Liga aktiviert.",
  removed: "Liga entfernt.",
  disconnected: "Kickbase getrennt.",
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; until?: string; max?: string }>;
}) {
  const { error, ok, until, max } = await searchParams;
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
  const needsReconnect = state != null && state.status !== "active";

  let leagues: { id: string; name: string }[] = [];
  let loadError = false;
  let userLeagues: { leagueId: string; activatedAt: string | null }[] = [];
  let maxLeagues = 1;
  if (state) {
    // league_access + Limit brauchen KEIN gültiges Token → immer laden, damit
    // auch bei abgelaufener Sitzung die aktiven Ligen des Nutzers sichtbar sind.
    const [ul, ml] = await Promise.all([getUserLeagues(user.id), getMaxLeagues(user.id)]);
    userLeagues = ul;
    maxLeagues = ml;
    if (state.status === "active") {
      try {
        const tokens = await getDecryptedTokens(user.id);
        if (tokens) {
          const sel = await fetchLeaguesSelection({ token: tokens.accessToken });
          leagues = parseLeaguesSelection(sel).map((l) => ({ id: l.id, name: l.name }));
          // In Kickbase verlassene Ligen aus league_access entfernen (Abgleich).
          // Nur bei nicht-leerer Auswahl (leere Liste = eher API-Hiccup als „alle verlassen").
          if (leagues.length > 0) {
            const removed = await reconcileLeagueAccess(user.id, leagues.map((l) => l.id));
            if (removed.length > 0) userLeagues = await getUserLeagues(user.id);
          }
        }
      } catch {
        loadError = true;
      }
    }
  }

  const activatedAt = new Map(userLeagues.map((l) => [l.leagueId, l.activatedAt]));
  const activeCount = userLeagues.length;
  const atCap = activeCount >= maxLeagues;
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

      {error && (
        <div className="notice warn">
          {ERRORS[error] ?? "Fehler."}
          {error === "atcap" && max ? ` (Limit: ${max})` : ""}
          {error === "removecooldown" && until ? ` Entfernen ab ${fmt(Date.parse(until))} möglich.` : ""}
        </div>
      )}
      {ok && <div className="notice">{OKS[ok] ?? "OK."}</div>}

      {!state ? (
        <ConnectForm />
      ) : (
        <>
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <p className="card-title">Verbindung</p>
            <p>
              Kickbase-Konto verbunden{needsReconnect ? " (Sitzung abgelaufen — bitte neu verbinden)" : ""}.{" "}
              <strong>
                {activeCount} von {maxLeagues} {maxLeagues === 1 ? "Liga" : "Ligen"} aktiv
              </strong>
              {maxLeagues > 1 ? " · Premium" : ""}.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
              <form action={disconnectKickbase}>
                <button className="btn" type="submit">Kickbase trennen</button>
              </form>
              {!needsReconnect && activeCount > 0 && (
                <Link href="/" className="linklike">Zum Dashboard →</Link>
              )}
            </div>
          </div>

          {needsReconnect ? (
            <div className="card card-pad" style={{ maxWidth: 520, marginBottom: 20 }}>
              <p className="card-title">Neu verbinden</p>
              <div className="notice warn" style={{ marginBottom: 12 }}>
                Deine Kickbase-Sitzung ist abgelaufen — das gespeicherte Token lässt sich nicht
                erneuern (u. a. wenn du dich in der Kickbase-App neu einloggst). Bitte melde dich
                erneut an.
                {activeCount > 0
                  ? ` Deine ${activeCount} aktive${activeCount === 1 ? " Liga bleibt" : "n Ligen bleiben"} erhalten.`
                  : ""}
              </div>
              <ReconnectForm />
            </div>
          ) : (
          <section className="section">
            <div className="section-head">
              <h2>Ligen</h2>
              <span className="note">
                {maxLeagues === 1
                  ? "eine aktive Liga"
                  : `bis zu ${maxLeagues} Ligen gleichzeitig`}
              </span>
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
                      const isActive = activatedAt.has(l.id);
                      const at = activatedAt.get(l.id);
                      const removableAt = at ? Date.parse(at) + SWITCH_COOLDOWN_DAYS * DAY_MS : null;
                      const canRemove = removableAt == null || Date.now() >= removableAt;
                      return (
                        <tr key={l.id}>
                          <td className="l">{l.name}</td>
                          <td className="l muted">
                            {isActive ? "aktiv" : atCap ? "Limit erreicht" : "—"}
                          </td>
                          <td>
                            {isActive ? (
                              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                <span className="badge accent">aktiv</span>
                                <form action={removeLeague}>
                                  <input type="hidden" name="leagueId" value={l.id} />
                                  <button
                                    className="btn"
                                    type="submit"
                                    disabled={!canRemove}
                                    title={
                                      canRemove
                                        ? undefined
                                        : `Entfernbar ab ${fmt(removableAt!)}`
                                    }
                                  >
                                    Entfernen
                                  </button>
                                </form>
                              </span>
                            ) : (
                              <form action={selectLeague}>
                                <input type="hidden" name="leagueId" value={l.id} />
                                <button className="btn" type="submit" disabled={atCap}>
                                  Aktivieren
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
            {atCap && maxLeagues > 0 && (
              <p className="note" style={{ marginTop: 8 }}>
                Limit erreicht. Zum Wechseln zuerst eine aktive Liga entfernen (7-Tage-Frist).
              </p>
            )}
          </section>
          )}
        </>
      )}
    </main>
  );
}

/** Nur die Zugangsdaten-Felder (Login) — für die Neu-Verbinden-Card. */
function ReconnectForm() {
  return (
    <form action={connectKickbase} style={{ display: "grid", gap: 12 }}>
      <input type="email" name="kbEmail" required placeholder="Kickbase-E-Mail" style={inputStyle} />
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
          Ich verbinde meinen Kickbase-Account erneut. Es wird ein neues Token (verschlüsselt)
          gespeichert, nicht mein Passwort.
        </span>
      </label>
      <button className="btn" type="submit">Neu verbinden</button>
    </form>
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
        <input type="email" name="kbEmail" required placeholder="Kickbase-E-Mail" style={inputStyle} />
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
