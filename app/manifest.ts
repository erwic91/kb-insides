import type { MetadataRoute } from "next";

/**
 * Web-App-Manifest: Ligamonitor lässt sich auf dem Home-Bildschirm installieren
 * und startet dann eigenständig (ohne Browser-Leisten) — wie eine native App.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ligamonitor",
    short_name: "Ligamonitor",
    description: "Kickbase-Liga-Insights über die Mitmanager",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#edefec",
    theme_color: "#14181f",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
