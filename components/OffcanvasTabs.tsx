"use client";

import { useState, type ReactNode } from "react";

/** Einfache Tab-Umschaltung (Client-State, keine URL-Navigation). */
export default function OffcanvasTabs({
  tabs,
}: {
  tabs: { key: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  return (
    <>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={t.key === active ? "on" : ""}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (t.key === active ? <div key={t.key}>{t.content}</div> : null))}
    </>
  );
}
