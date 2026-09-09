export const LAYERS: { key: string; label: string }[] = [
  { key: "door", label: "Doors" },
  { key: "drawer", label: "Drawers" },
  { key: "shelf", label: "Shelves" },
  { key: "back", label: "Backs" },
  { key: "panel", label: "Panels" },
  { key: "kick", label: "Kick" },
];

export function LayerToggles({
  vis,
  onChange,
}: {
  vis: Record<string, boolean>;
  onChange: (key: string, v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {LAYERS.map((l) => (
        <label
          key={l.key}
          className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-ink-900/60 px-2.5 py-1.5 text-[12px] text-ink-200 cursor-pointer hover:border-amber-400/30 transition-colors"
        >
          <input
            type="checkbox"
            className="chk"
            checked={vis[l.key] !== false}
            onChange={(e) => onChange(l.key, e.target.checked)}
          />
          {l.label}
        </label>
      ))}
    </div>
  );
}
