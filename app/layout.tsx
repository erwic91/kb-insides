import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Topbar from "../components/Topbar";
import { getLeagues } from "../lib/db/queries";

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
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const leagues = await getLeagues();
  return (
    <html lang="de" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Suspense fallback={<header className="topbar" />}>
          <Topbar leagues={leagues.map((l) => ({ id: l.id, name: l.name }))} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
