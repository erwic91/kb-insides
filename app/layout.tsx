import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Topbar from "../components/Topbar";
import { getLeagues } from "../lib/db/queries";
import { getCurrentUser } from "../lib/supabase/server";
import { isAdminEmail } from "../lib/db/admin";

// Self-hosted über next/font (zur Build-Zeit geladen) — kein Runtime-CDN-Call.
const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
});
const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ligamonitor",
  description: "Kickbase-Liga-Insights über die Mitmanager",
  applicationName: "Ligamonitor",
  // „Zum Home-Bildschirm" → startet als eigenständige App (ohne Safari-Leisten).
  appleWebApp: {
    capable: true,
    title: "Ligamonitor",
    statusBarStyle: "black-translucent",
  },
  // iOS verlinkt sonst lange Zahlen (z. B. 206.355.446) als Telefonnummern.
  formatDetection: { telephone: false, date: false, address: false, email: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Inhalt bis in die Ränder (Notch/Home-Indikator) — Abstände via safe-area-inset.
  viewportFit: "cover",
  themeColor: "#14181f",
};

export default async function RootLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  const [leagues, currentUser] = await Promise.all([getLeagues(), getCurrentUser()]);
  const isAdmin = isAdminEmail(currentUser?.email);
  // Dieselbe Default-Auflösung wie resolveLeague (isDefault, sonst erste), damit
  // der Liga-Switch ohne ?league-Param dieselbe Liga markiert, die angezeigt wird.
  const defaultLeagueId = (leagues.find((l) => l.isDefault) ?? leagues[0])?.id ?? null;
  return (
    <html lang="de" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Suspense fallback={<header className="topbar" />}>
          <Topbar
            leagues={leagues.map((l) => ({ id: l.id, name: l.name }))}
            defaultLeagueId={defaultLeagueId}
            isAdmin={isAdmin}
          />
        </Suspense>
        {children}
        {modal}
      </body>
    </html>
  );
}
