"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Off-canvas von rechts (Intercepting Route). Schließt per Backdrop-Klick, Esc
 * oder ×. Die volle Seite bleibt unter der jeweiligen URL erhalten.
 */
export default function OffcanvasShell({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [router]);

  return (
    <div
      className="oc-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) router.back();
      }}
    >
      <div className="oc-panel" role="dialog" aria-modal="true">
        <button type="button" className="oc-close" aria-label="Schließen" onClick={() => router.back()}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
