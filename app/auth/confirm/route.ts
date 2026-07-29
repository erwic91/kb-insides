import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * Magic-Link-Ziel. Deckt beide Supabase-E-Mail-Varianten ab:
 *  - PKCE-Code-Flow (Standard-Template): `?code=…` → exchangeCodeForSession.
 *  - OTP/token_hash (angepasstes Template): `?token_hash=…&type=…` → verifyOtp.
 * Setzt die Session-Cookies und leitet weiter (Standard: /connect).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/connect";

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
