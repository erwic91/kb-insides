"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Kleines Info-Icon („i") mit Erklärung. Desktop: Tooltip auf Hover/Fokus.
 * Touch (iPhone): Antippen öffnet die Erklärung als Karte über der Tab-Bar,
 * Tippen irgendwo anders (oder Scrollen) schließt sie. Styles in globals.css
 * (.infodot / .infodot-tip). Als Client-Komponente auch in Server-Komponenten
 * nutzbar (nur serialisierbare Props).
 */
export default function InfoDot({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className={`infodot ${open ? "open" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={text}
      aria-expanded={open}
      onClick={(e) => {
        // Nicht zur Tabellenzeile/Sortierung durchreichen.
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
    >
      i
      <span className={`infodot-tip ${align === "right" ? "tip-right" : ""}`} role="tooltip">
        {text}
      </span>
    </span>
  );
}
