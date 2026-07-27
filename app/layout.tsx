import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import "./globals.css";
import Topbar from "../components/Topbar";
import { getLeagues } from "../lib/db/queries";

export const metadata: Metadata = {
  title: "Ligamonitor",
  description: "Kickbase-Liga-Insights über die Mitmanager",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const leagues = await getLeagues();
  return (
    <html lang="de">
      <body>
        <Suspense fallback={<header className="topbar" />}>
          <Topbar leagues={leagues.map((l) => ({ id: l.id, name: l.name }))} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
