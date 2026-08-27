/**
 * Startelf-Wahrscheinlichkeit als kleines Icon (Kickbase `prob`, 1..5):
 * 1 = Startelf sicher (blauer Stern) … 5 = spielt nicht (X). Reine Darstellung.
 */
const MAP: Record<number, { icon: string; color: string; label: string }> = {
  1: { icon: "★", color: "#2f6fed", label: "Startelf sicher" },
  2: { icon: "✓", color: "#0f7a5a", label: "wahrscheinlich" },
  3: { icon: "?", color: "#e0a100", label: "fraglich" },
  4: { icon: "!", color: "#c0143a", label: "unwahrscheinlich" },
  5: { icon: "✕", color: "#7a8189", label: "spielt nicht" },
};

export default function LineupProbIcon({ prob }: { prob: number | null }) {
  if (prob == null) return null;
  const m = MAP[prob];
  if (!m) return null;
  return (
    <span className="prob-ico" style={{ color: m.color }} title={`Startelf-Prognose: ${m.label}`}>
      {m.icon}
    </span>
  );
}
