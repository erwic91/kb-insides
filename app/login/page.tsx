"use client";

import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type Mode = "magic" | "password";
type Status = "idle" | "working" | "sent" | "error";

const inputStyle = {
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 3,
  fontFamily: "var(--body)",
  fontSize: 14,
} as const;

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const pwFormRef = useRef<HTMLFormElement>(null);

  const working = status === "working";

  /**
   * Liest E-Mail/Passwort DIREKT aus dem Formular (nicht aus React-State) — so
   * greift auch Browser-Autofill, das oft kein onChange auslöst und sonst leere
   * Werte an Supabase schickt (→ „Anonymous sign-ins are disabled").
   */
  function readCreds(): { email: string; password: string } | { error: string } {
    const form = pwFormRef.current;
    const email = String(
      (form?.elements.namedItem("email") as HTMLInputElement | null)?.value ?? "",
    ).trim();
    const password = String(
      (form?.elements.namedItem("password") as HTMLInputElement | null)?.value ?? "",
    );
    if (!email) return { error: "Bitte E-Mail eingeben." };
    if (password.length < 6) return { error: "Passwort mit mindestens 6 Zeichen eingeben." };
    return { email, password };
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setMsg("");
    const supabase = createSupabaseBrowserClient();
    const emailRedirectTo = `${window.location.origin}/auth/confirm`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
    if (error) {
      setStatus("error");
      setMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const creds = readCreds();
    if ("error" in creds) {
      setStatus("error");
      setMsg(creds.error);
      return;
    }
    setStatus("working");
    setMsg("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword(creds);
    if (error) {
      setStatus("error");
      setMsg(error.message);
      return;
    }
    // Volle Navigation, damit der Server die frischen Session-Cookies sieht.
    window.location.assign("/connect");
  }

  async function signUp() {
    const creds = readCreds();
    if ("error" in creds) {
      setStatus("error");
      setMsg(creds.error);
      return;
    }
    setStatus("working");
    setMsg("");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp(creds);
    if (error) {
      setStatus("error");
      setMsg(error.message);
      return;
    }
    if (data.session) {
      window.location.assign("/connect");
      return;
    }
    // Keine Session → E-Mail-Bestätigung ist aktiv.
    setStatus("sent");
    setMsg(
      "Konto angelegt. Falls E-Mail-Bestätigung aktiv ist, bitte bestätigen — zum reinen Testen in Supabase unter Authentication → Providers → Email die Option Confirm email deaktivieren.",
    );
  }

  return (
    <main className="wrap">
      <div className="page-head">
        <span className="eyebrow">Anmeldung</span>
        <h1>Ligamonitor</h1>
        <p className="sub">
          {mode === "magic"
            ? "Anmeldung per Magic-Link — kein Passwort nötig."
            : "Anmeldung mit E-Mail & Passwort (Testweg)."}
        </p>
      </div>

      <div className="card card-pad" style={{ maxWidth: 460 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            className="btn"
            style={mode === "password" ? undefined : { opacity: 0.6 }}
            onClick={() => {
              setMode("password");
              setStatus("idle");
              setMsg("");
            }}
            type="button"
          >
            Passwort
          </button>
          <button
            className="btn"
            style={mode === "magic" ? undefined : { opacity: 0.6 }}
            onClick={() => {
              setMode("magic");
              setStatus("idle");
              setMsg("");
            }}
            type="button"
          >
            Magic-Link
          </button>
        </div>

        {status === "sent" && mode === "magic" ? (
          <p className="note">
            Link verschickt an <strong>{email}</strong>. Öffne die E-Mail und klicke auf den
            Anmelde-Link.
          </p>
        ) : mode === "magic" ? (
          <form onSubmit={sendMagicLink} style={{ display: "grid", gap: 12 }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="du@example.com"
              style={inputStyle}
            />
            <button className="btn" type="submit" disabled={working}>
              {working ? "Sende…" : "Magic-Link senden"}
            </button>
          </form>
        ) : (
          <form ref={pwFormRef} onSubmit={signIn} style={{ display: "grid", gap: 12 }}>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="du@example.com"
              style={inputStyle}
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={6}
              placeholder="Passwort (min. 6 Zeichen)"
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" type="submit" disabled={working} style={{ flex: 1 }}>
                {working ? "…" : "Anmelden"}
              </button>
              <button
                className="btn"
                type="button"
                disabled={working}
                onClick={() => void signUp()}
                style={{ flex: 1, opacity: 0.85 }}
              >
                Registrieren
              </button>
            </div>
          </form>
        )}

        {status === "error" && (
          <p className="note" style={{ color: "var(--loss)", marginTop: 12 }}>
            {msg}
          </p>
        )}
        {status === "sent" && mode === "password" && (
          <p className="note" style={{ marginTop: 12 }}>
            {msg}
          </p>
        )}
      </div>
    </main>
  );
}
