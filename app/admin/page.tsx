import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/supabase/server";
import { isAdminEmail, listUsersForAdmin } from "../../lib/db/admin";
import { setUserRole } from "./actions";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  active: "aktiv",
  needs_reconnect: "neu verbinden",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!isAdminEmail(user.email)) {
    return (
      <main className="wrap">
        <div className="empty">
          <h3>Kein Zugriff</h3>
          <p>Diese Seite ist nur für Administratoren.</p>
        </div>
      </main>
    );
  }

  const users = await listUsersForAdmin();
  const premiumCount = users.filter((u) => u.isPremium).length;

  return (
    <main className="wrap">
      <div className="crumb">Administration</div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Nur für Admins</span>
          <h1>Nutzerverwaltung</h1>
          <p className="sub">
            {users.length} Nutzer · {premiumCount} Premium
          </p>
        </div>
      </div>

      {ok && <div className="notice" style={{ marginBottom: 16 }}>Rolle gespeichert.</div>}

      <div className="section">
        <div className="section-head">
          <h2>Nutzer &amp; Rollen</h2>
          <span className="note">Free = 1 Liga · Premium = mehrere Ligen</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="l">E-Mail</th>
                <th className="l">Rolle</th>
                <th>Aktive Ligen</th>
                <th className="l">Verbindung</th>
                <th className="l">Registriert</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === user.id;
                return (
                  <tr key={u.id}>
                    <td className="l">
                      {u.email ?? "—"}
                      {isSelf && <span className="tag">du</span>}
                    </td>
                    <td className="l">
                      {u.isPremium ? (
                        <span className="badge accent">Premium · {u.maxLeagues}</span>
                      ) : (
                        <span className="badge">Free</span>
                      )}
                    </td>
                    <td>{u.activeLeagues}</td>
                    <td className="l muted">
                      {u.connectionStatus ? (STATUS_LABEL[u.connectionStatus] ?? u.connectionStatus) : "—"}
                    </td>
                    <td className="l muted">{fmtDate(u.createdAt)}</td>
                    <td>
                      <form action={setUserRole}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="role" value={u.isPremium ? "free" : "premium"} />
                        <button className="btn" type="submit">
                          {u.isPremium ? "Auf Free setzen" : "Auf Premium setzen"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="foot">
        Admins werden über die Umgebungsvariable <code>ADMIN_EMAILS</code> festgelegt
        (kommagetrennt; Standard <code>hello@ericwicker.de</code>). „Premium" setzt{" "}
        <code>max_leagues</code> auf 10, „Free" auf 1. Bestehende, bereits aktivierte Ligen
        werden bei einer Herabstufung nicht automatisch entfernt — das Limit greift erst beim
        nächsten Aktivieren.
      </div>
    </main>
  );
}
