"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Overlay-Rahmen für die Spielerkarte (Intercepting Route). Schließt per
 * Backdrop-Klick, Esc oder ×-Button via router.back() — die volle Seite
 * /player/[id] bleibt für Direktaufruf/Teilen erhalten.
 */
export default function PlayerModalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKey);
    // Body-Scroll sperren, solange das Modal offen ist.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [router]);

  return (
    <div
      className="pc-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) router.back();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="pc-panel" ref={panelRef}>
        <button type="button" className="pc-close" aria-label="Schließen" onClick={() => router.back()}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
