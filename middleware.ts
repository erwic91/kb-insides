import { type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

/**
 * Erneuert die Auth-Session (Cookie-Refresh) bei jedem Request. Läuft nicht auf
 * statischen Assets. Nicht-blockierend (siehe lib/supabase/middleware.ts).
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Alles außer Next-internen Pfaden und statischen Dateien.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
