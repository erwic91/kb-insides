"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
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

  return (
    <main className="wrap">
      <div className="page-head">
        <span className="eyebrow">Anmeldung</span>
        <h1>Ligamonitor</h1>
        <p className="sub">Melde dich per Magic-Link an — kein Passwort nötig.</p>
      </div>

      <div className="card card-pad" style={{ maxWidth: 460 }}>
        {status === "sent" ? (
          <p className="note">
            Link verschickt an <strong>{email}</strong>. Öffne die E-Mail und klicke auf den
            Anmelde-Link. Danach kannst du deinen Kickbase verbinden.
          </p>
        ) : (
          <form onSubmit={sendLink} style={{ display: "grid", gap: 12 }}>
            <label className="label" htmlFor="email">
              E-Mail-Adresse
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="du@example.com"
              style={{
                padding: "10px 12px",
                border: "1px solid var(--line)",
                borderRadius: 3,
                fontFamily: "var(--body)",
                fontSize: 14,
              }}
            />
            <button className="btn" type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Sende…" : "Magic-Link senden"}
            </button>
            {status === "error" && (
              <p className="note" style={{ color: "var(--loss)" }}>
                {msg}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
