import { useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ClipboardPaste,
  Columns3,
  DoorClosed,
  DoorOpen,
  Layers,
  Library,
  PencilRuler,
  Plus,
  Rows3,
  SquareMousePointer,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
} from "lucide-react";
import type { Cabinet, ColumnSpec, CoverPanel, DrawerSpec, DoorSpec, RowSpec, Settings } from "../types";
import { AVAILABLE_DRAWER_DEPTHS, duplicateCabinet, HINGE_BRANDS, mkColumn, mkDoor, mkDrawer, nextCopyName, plyMaterialById, plyMaterialsOf, recommendedShelves, shelfGap, TYPE_META, uid, type LibraryItem } from "../lib/defaults";
import { boxHeight, carcassDepth, columnFaceWidth, columnHasDrawers, columnLayout, doorDims, drawerBank, effectiveHingeCount, generateCabinetParts, isCorner, isNotched, kickH, railShelfYs, stackOn, stackedHeights, validateCabinet } from "../lib/model";
/* English-only labels */
const L: Record<string, string> = {
  noCabinets: "No cabinets yet",
  edit: "Edit Cabinet",
  cabinetName: "Cabinet name",
  width: "Width",
  height: "Height",
  depth: "Depth",
  qty: "Qty",
  toeKick: "Toe kick",
  fronts: "MDF fronts",
  back: "Back panel",
  carcassDepth: "Carcass depth",
  rows: "Sections / Rows",
  addRow: "Add section",
  addColumn: "Add column",
  subSection: "Sub-sections",
  addSub: "Add sub-section",
  subHint: "Sub-sections support drawers, shelves and fixed panels — the door belongs to the parent section.",
  shelves: "Shelves",
  drawers: "Drawers",
  drawer: "Drawer",
  hidden: "Hidden",
  door: "Door",
  open: "No door",
  fixed: "Fixed panel",
  auto: "Auto",
  even: "Even",
  gap: "gap",
  sum: "Σ",
  kitchenMode: "Kitchen Mode",
  openDoors: "Open doors",
  closeDoors: "Close doors",
  openDrawers: "Open drawers",
  closeDrawers: "Close drawers",
  dimensions: "Dimensions",
};
const t = (_l: string, k: string) => L[k] ?? k;
import { Btn, Chip, Field, Num } from "../components/ui";
import { ThreeCanvas } from "../components/ThreeCanvas";
import { LayerToggles } from "../components/LayerToggles";
import type { CabinetViewer } from "../three/scene";

const FRONTS = [
  { v: "open", l: "No door" },
  { v: "left", l: "Left" },
  { v: "right", l: "Right" },
  { v: "double", l: "Double" },
  { v: "sliding", l: "Sliding" },
  { v: "drawers", l: "Drawers" },
  { v: "fixed", l: "Fixed panel" },
];

/** door choices available as a cover over hidden drawers */
const HIDDEN_DOORS = [
  { v: "open", l: "No door" },
  { v: "left", l: "Left" },
  { v: "right", l: "Right" },
  { v: "double", l: "Double" },
  { v: "sliding", l: "Sliding" },
];

/** map a column back to the picker value — single doors split by swing side (rule C) */
const frontOf = (c: ColumnSpec) =>
  c.fixed
    ? "fixed"
    : c.drawers.length > 0
      ? "drawers"
      : c.door
        ? c.door.type === "single"
          ? c.door.swing === "left"
            ? "left"
            : "right"
          : c.door.type
        : "open";

/** build a door spec from a picker value (left/right = single + swing) */
const doorFromFront = (v: string, S: Settings): DoorSpec =>
  mkDoor(v === "left" || v === "right" ? "single" : (v as DoorSpec["type"]), {
    swing: v === "right" ? "right" : "left",
    mdfThk: S.mdfThk,
  });

/** divide the row height equally between n drawers (auto split until edited manually) */
function splitDrawers(n: number, rowH: number, keep: DrawerSpec[] = []): DrawerSpec[] {
  const count = Math.max(1, Math.round(n));
  const base = Math.floor(rowH / count);
  return Array.from({ length: count }, (_, i) => {
    const h = i === count - 1 ? rowH - base * (count - 1) : base;
    const prev = keep[i];
    return prev ? { ...prev, frontHeight: h } : mkDrawer(h);
  });
}

function Seg({ options, value, onChange }: { options: { v: string; l: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-600/70 bg-ink-900/90 p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${value === o.v ? "bg-amber-glow text-ink-950 font-semibold" : "text-ink-300 hover:text-ink-100"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function EditTab({
  cabinets,
  settings,
  selectedId,
  setSelectedId,
  updateCabinet,
  clipboard,
  setClipboard,
  onDuplicate,
  setLibrary,
}: {
  cabinets: Cabinet[];
  settings: Settings;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  updateCabinet: (id: string, fn: (c: Cabinet) => Cabinet) => void;
  clipboard: { kind: "column"; col: ColumnSpec } | null;
  setClipboard: (v: { kind: "column"; col: ColumnSpec } | null) => void;
  onDuplicate?: (id: string) => void;
  /** rule C2 — "Save as template" writes the cabinet into the project library */
  setLibrary?: (fn: (l: LibraryItem[]) => LibraryItem[]) => void;
}) {
  const cab = cabinets.find((c) => c.id === selectedId) ?? cabinets[0] ?? null;
  const viewer = useRef<CabinetViewer | null>(null);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [drawersOpen, setDrawersOpen] = useState(false);
  const [showDims, setShowDims] = useState(true);
  const [layers, setLayers] = useState<Record<string, boolean>>({});
  /** stacked-boxes view: which box's rows are shown / targeted by Add & Even ("all" = every box) */
  const [boxSel, setBoxSel] = useState<"all" | number>("all");
  const single = useMemo(() => (cab ? [cab] : []), [cab]);
  const issues = useMemo(() => (cab ? validateCabinet(cab, settings) : []), [cab, settings]);
  const lang = "en";

  if (!cab) return <div className="card p-10 anim-rise text-center text-ink-300">{t(lang, "noCabinets")}</div>;

  const BH = boxHeight(cab, settings);
  const rowSum = cab.rows.reduce((a, r) => a + r.h, 0);
  const parts = generateCabinetParts(cab, settings);

  /* ---- stacked boxes: per-box row targets ---- */
  const stacked = stackOn(cab);
  const heights = stackedHeights(cab);
  /** the height rows of box `bi` must fill: box height minus the toe kick (box 1 only) */
  const boxTargetOf = (bi: number) => Math.max(0, (heights[bi] ?? 0) - (bi === 0 ? kickH(cab, settings) : 0));
  const boxSumOf = (bi: number) => cab.rows.filter((r) => (r.box ?? 0) === bi).reduce((a, r) => a + r.h, 0);
  /** clamped view state — falls back to "all" if the selected box no longer exists */
  const boxView: "all" | number = boxSel !== "all" && (boxSel as number) >= Math.max(1, heights.length) ? "all" : boxSel;

  const setRows = (fn: (rows: RowSpec[]) => RowSpec[]) => updateCabinet(cab.id, (c) => ({ ...c, rows: fn(c.rows) }));
  const patchCovers = (fn: (cs: CoverPanel[]) => CoverPanel[]) => updateCabinet(cab.id, (c) => ({ ...c, covers: fn(c.covers ?? []) }));
  const patchCol = (rid: string, cid: string, patch: Partial<ColumnSpec>) =>
    setRows((rs) => rs.map((r) => (r.id === rid ? { ...r, columns: r.columns.map((c) => (c.id === cid ? { ...c, ...patch } : c)) } : r)));
  const patchDoor = (rid: string, cid: string, patch: Partial<DoorSpec>) =>
    setRows((rs) =>
      rs.map((r) => (r.id === rid ? { ...r, columns: r.columns.map((c) => (c.id === cid && c.door ? { ...c, door: { ...c.door, ...patch } } : c)) } : r)),
    );
  const patchDrawer = (rid: string, cid: string, did: string, patch: Partial<DrawerSpec>) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === rid
          ? { ...r, columns: r.columns.map((c) => (c.id === cid ? { ...c, drawers: c.drawers.map((d) => (d.id === did ? { ...d, ...patch } : d)) } : c)) }
          : r,
      ),
    );

  return (
    <div className="grid gap-5 xl:grid-cols-[500px_1fr] anim-rise">
      <div className="space-y-4 max-h-[calc(100vh-170px)] overflow-y-auto pr-1 pb-6">
        <div className="card p-4">
          {/* large Kitchen Mode toggle sits before the cabinet name field */}
          <button
            onClick={() => updateCabinet(cab.id, (c) => ({ ...c, isKitchen: !c.isKitchen }))}
            className={`mb-4 flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all ${
              cab.isKitchen
                ? "border-emerald-400/50 bg-gradient-to-r from-emerald-400/20 to-emerald-500/10 shadow-[0_4px_20px_-8px_rgba(52,211,153,0.6)]"
                : "border-white/[0.08] bg-ink-900/70 hover:border-white/20"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span className={`text-lg ${cab.isKitchen ? "" : "grayscale opacity-60"}`}>🍳</span>
              <span className="text-left">
                <span className={`block font-display text-[14px] font-bold ${cab.isKitchen ? "text-emerald-200" : "text-ink-200"}`}>
                  {t(lang, "kitchenMode")}
                </span>
                <span className="block text-[10.5px] text-ink-400">500mm slides · no hidden drawers</span>
              </span>
            </span>
            <span
              className={`relative h-7 w-14 shrink-0 rounded-full transition-colors ${cab.isKitchen ? "bg-emerald-500" : "bg-ink-600"}`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${cab.isKitchen ? "left-8" : "left-1"}`}
              />
            </span>
          </button>

          <Field label={t(lang, "edit") + " — " + t(lang, "cabinetName")}>
            <div className="flex gap-2">
              <select className="inp flex-1" value={cab.id} onChange={(e) => setSelectedId(e.target.value)}>
                {cabinets.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.width}×{c.height}×{c.depth}</option>
                ))}
              </select>
              {onDuplicate && (
                <Btn
                  title={`Duplicate — next unit number (${nextCopyName(cab.name, cabinets.map((c) => c.name))})`}
                  onClick={() => onDuplicate(cab.id)}
                >
                  <Copy size={14} /> Duplicate
                </Btn>
              )}
              {setLibrary && (
                <Btn
                  title="Save this cabinet as a reusable template — it goes to the Project tab library, where it can be added to any project"
                  onClick={() => {
                    const name = window.prompt("Template name…", `${cab.name} template`);
                    if (!name || !name.trim()) return; // cancelled
                    setLibrary((l) => [...l, { id: uid(), name: name.trim(), cabinet: duplicateCabinet(cab, cab.name) }]);
                  }}
                >
                  <Library size={14} /> Save as template
                </Btn>
              )}
            </div>
          </Field>
          <Field label="Rename this cabinet" className="mt-3">
            <input className="inp" value={cab.name} onChange={(e) => updateCabinet(cab.id, (c) => ({ ...c, name: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-4 gap-3 mt-4">
            <Field label={t(lang, "width") + " mm"}><Num value={cab.width} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, width: v }))} /></Field>
            <Field label={t(lang, "height") + " mm"}><Num value={cab.height} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, height: v }))} /></Field>
            <Field label={t(lang, "depth") + " mm"}><Num value={cab.depth} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, depth: v }))} /></Field>
            <Field label={t(lang, "qty")}><Num value={cab.qty} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, qty: Math.max(1, Math.round(v)) }))} /></Field>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Chip tone="cyan">{TYPE_META[cab.type].label}</Chip>
            <Chip>box H {Math.round(BH)}mm</Chip>
            <Chip tone={Math.abs(rowSum - BH) < 1 ? "green" : "red"}>rows Σ {Math.round(rowSum)}mm</Chip>
            <Chip tone="amber">{parts.reduce((a, p) => a + p.qty, 0)} parts</Chip>
          </div>

          {/* construction options */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              ["hasToeKick", t(lang, "toeKick"), `${settings.kickHeight}mm · off by default`],
              ["hasFronts", t(lang, "fronts"), "doors · drawer fronts"],
              ["hasBack", t(lang, "back"), `${settings.backThk}mm`],
            ] as const).map(([key, label, sub]) => (
              <label
                key={key}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-2.5 py-2 transition-colors ${
                  cab[key] !== false ? "border-amber-400/30 bg-amber-400/[0.07]" : "border-white/[0.06] bg-ink-900/60"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[12px] text-ink-100">
                  <input type="checkbox" className="chk" checked={cab[key] !== false} onChange={(e) => updateCabinet(cab.id, (c) => ({ ...c, [key]: e.target.checked }))} />
                  {label}
                </span>
                <span className="text-[10px] text-ink-400 pl-6">{sub}</span>
              </label>
            ))}
          </div>
          {/* plywood material — same thickness, different color/name; set in Settings → Plywood materials */}
          <Field label="Plywood material" className="mt-3">
            <div className="flex items-center gap-2">
              <select
                className="inp"
                value={cab.matId ?? ""}
                onChange={(e) => updateCabinet(cab.id, (c) => ({ ...c, matId: e.target.value || null }))}
              >
                <option value="">Default — {plyMaterialById(settings, null).name}</option>
                {plyMaterialsOf(settings).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              {cab.matId && <Chip tone="cyan"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: plyMaterialById(settings, cab.matId).color }} /></Chip>}
            </div>
          </Field>
          {/* linear slot in the side panels (glass panel / track) */}
          <Field label="Linear slot (side panels)" className="mt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Seg
                options={[{ v: "none", l: "Off" }, { v: "left", l: "Left" }, { v: "right", l: "Right" }, { v: "both", l: "Both" }]}
                value={cab.slot ?? "none"}
                onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, slot: v as Cabinet["slot"] }))}
              />
              {(cab.slot ?? "none") !== "none" && (
                <Chip tone="cyan">{settings.slotWidth}mm × full height · {settings.slotFromFront}mm from front</Chip>
              )}
            </div>
          </Field>
          <p className="hint mt-2">
            Slot width &amp; distance are global (Settings → Drilling). The slot is skipped on corner / notched side panels.
          </p>
          <p className="hint mt-2">
            {t(lang, "carcassDepth")}: <span className="text-amber-300 font-mono">{Math.round(carcassDepth(cab, settings))}mm</span> (overall {cab.depth} − front − back)
          </p>
        </div>

        {/* stacked boxes — separate boxes bolted on top of each other */}
        {!isCorner(cab.type) && (
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="card-h text-[14px]"><Layers size={15} className="text-amber-400" /> Stacked boxes</h3>
              <Btn
                size="sm"
                variant={stackOn(cab) ? "danger" : "ok"}
                onClick={() =>
                  updateCabinet(cab.id, (c) => {
                    if (stackOn(c)) return { ...c, stack: null, rows: c.rows.map((r) => ({ ...r, box: undefined })) };
                    const kickH2 = c.hasToeKick && TYPE_META[c.type].kick ? settings.kickHeight : 0;
                    const stack = [Math.round(c.height / 2), c.height - Math.round(c.height / 2)];
                    const carcass = stack.map((h, i) => (i === 0 ? h - kickH2 : h));
                    const bounds: number[] = [];
                    let a2 = 0;
                    for (let i = 0; i < carcass.length - 1; i++) {
                      a2 += carcass[i];
                      bounds.push(a2);
                    }
                    let acc = 0;
                    const rows = c.rows.map((r) => {
                      const box = bounds.filter((b) => acc >= b - 0.5).length;
                      acc += r.h;
                      return { ...r, box };
                    });
                    return { ...c, stack, rows };
                  })
                }
              >
                {stackOn(cab) ? "Turn off" : "Split into boxes"}
              </Btn>
            </div>
            {stackOn(cab) ? (
              <>
                <p className="hint mt-2">
                  The cabinet is built as SEPARATE boxes bolted on top of each other — each box gets its own 2 side panels,
                  top and bottom (+ back). Rows are assigned to boxes below. A door marked <b>Full height</b> spans all boxes.
                </p>
                <div className="mt-3 space-y-2">
                  {stackedHeights(cab).map((bh, bi) => {
                    const target = bi === 0 ? bh - (cab.hasToeKick ? settings.kickHeight : 0) : bh;
                    const bsum = cab.rows.filter((r) => (r.box ?? 0) === bi).reduce((a, r) => a + r.h, 0);
                    const isLast = bi === stackedHeights(cab).length - 1;
                    return (
                      <div key={bi} className="flex items-center gap-2 flex-wrap rounded-lg border border-white/[0.06] bg-ink-900/50 px-2 py-1.5">
                        <span className="font-mono text-[11px] text-ink-400 w-16">Box {bi + 1}</span>
                        <Num
                          className="!w-[86px] !py-1 !px-2"
                          value={bh}
                          onChange={(v) => {
                            const clamped = Math.max(0, Math.round(v));
                            const arr = stackedHeights(cab).map((x, i) => (i === bi ? clamped : x));
                            const lastIdx = arr.length - 1;
                            if (!isLast && arr.length >= 2) {
                              // auto-calculate the last box so Σ = cabinet height
                              const sumOthers = arr.reduce((a, x, i) => (i === lastIdx ? a : a + x), 0);
                              arr[lastIdx] = Math.max(0, Math.round(cab.height) - sumOthers);
                            }
                            updateCabinet(cab.id, (c) => ({ ...c, stack: arr }));
                          }}
                        />
                        <span className="text-[11px] text-ink-500">mm</span>
                        {bi === 0 && cab.hasToeKick && <Chip>incl. {settings.kickHeight}mm kick</Chip>}
                        {isLast && !isLast === false && <span className="text-[10px] text-ink-500">auto</span>}
                        <Chip tone={Math.abs(bsum - target) < 1 ? "green" : "amber"}>rows {Math.round(bsum)}/{Math.round(target)}</Chip>
                        {stackedHeights(cab).length > 2 && (
                          <Btn
                            size="sm"
                            variant="danger"
                            className="ml-auto"
                            onClick={() => {
                              const arr = stackedHeights(cab).filter((_, i) => i !== bi);
                              updateCabinet(cab.id, (c) => ({ ...c, stack: arr }));
                              setRows((rs) =>
                                rs.map((r) => ((r.box ?? 0) === bi ? { ...r, box: 0 } : (r.box ?? 0) > bi ? { ...r, box: (r.box ?? 0) - 1 } : r)),
                              );
                            }}
                          >
                            <Trash2 size={11} />
                          </Btn>
                        )}
                      </div>
                    );
                  })}
                </div>
                {stackedHeights(cab).length < 5 && (
                  <Btn
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      const arr = [...stackedHeights(cab)];
                      const take = Math.round(arr[arr.length - 1] / 2);
                      arr[arr.length - 1] -= take;
                      setRows((rs) => rs.map((r) => ({ ...r, box: Math.min(r.box ?? 0, arr.length - 1) })));
                      updateCabinet(cab.id, (c) => ({ ...c, stack: [...arr, take] }));
                    }}
                  >
                    <Plus size={13} /> Add box
                  </Btn>
                )}
              </>
            ) : (
              <p className="hint mt-2">
                Off — one normal carcass with shared side panels. Turn on to build e.g. a 2000mm + 800mm wardrobe as two
                separate bolted boxes, each with its own side panels, top and bottom.
              </p>
            )}
            {stackOn(cab) && (
              <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] text-amber-200 font-semibold">Doors cover the whole cabinet (all boxes):</span>
                  <Seg
                    options={[
                      { v: "off", l: "Per section" },
                      { v: "mdf", l: "MDF doors" },
                      { v: "glass", l: "Glass" },
                    ]}
                    value={cab.fullDoor ?? "off"}
                    onChange={(v) =>
                      updateCabinet(cab.id, (c) => ({ ...c, fullDoor: (v === "off" ? null : v) as Cabinet["fullDoor"] }))
                    }
                  />
                  {cab.fullDoor && cab.fullDoor !== "off" && (
                    <>
                      <span className="text-[10.5px] text-ink-400">Hinges:</span>
                      <select
                        className="inp !w-[86px] !py-1 !px-1.5 text-[11px]"
                        title="Hinge count for the full-height door(s) covering the whole cabinet — Auto = 2 under 900mm, 3 above"
                        value={cab.fullDoorHinges ?? ""}
                        onChange={(e) =>
                          updateCabinet(cab.id, (c) => ({ ...c, fullDoorHinges: e.target.value ? Number(e.target.value) : undefined }))
                        }
                      >
                        <option value="">Auto</option>
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <Chip tone={cab.fullDoorHinges ? "cyan" : "green"}>
                        {cab.fullDoorHinges ? `${cab.fullDoorHinges} hinges` : `auto`} · one long door
                      </Chip>
                    </>
                  )}
                </div>
                <p className="text-[10.5px] text-ink-400 mt-1.5 leading-snug">
                  Picked here, this door replaces the section doors below — universal 35mm hinges, cups only in the door (never
                  in the plywood, never in the DXF).
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---- cover panels (L / R / T / B) ---- */}
        <div className="card p-4">
          <h3 className="card-h text-[14px]"><Layers size={15} className="text-amber-400" /> Cover panels</h3>
          <p className="hint mt-1">
            Decorative finish panels attached OUTSIDE the cabinet — full height (floor → top) and full depth (front → back) by
            default. Real parts: cut list, nesting and DXF. Rendered in 2D + 3D.
          </p>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {(["L", "R", "T", "B"] as const).map((side) => {
              const exists = (cab.covers ?? []).some((cv) => cv.side === side);
              const label = side === "L" ? "⟨ Left" : side === "R" ? "Right ⟩" : side === "T" ? "⌃ Top" : "⌄ Bottom";
              return (
                <Btn
                  key={side}
                  size="sm"
                  disabled={exists}
                  title={exists ? `A ${side} cover already exists` : `Add a ${side} cover panel`}
                  onClick={() =>
                    patchCovers((cs) => [
                      ...cs,
                      {
                        id: uid(),
                        side,
                        w: side === "T" || side === "B" ? cab.width : cab.depth,
                        h: side === "T" || side === "B" ? cab.depth : cab.height,
                        thk: 0, // 0 = auto (ply 16.5 / MDF 19)
                        mat: "mdf",
                      },
                    ])
                  }
                >
                  <Plus size={12} /> {label}
                </Btn>
              );
            })}
          </div>
          {(cab.covers ?? []).length > 0 && (
            <div className="mt-3 space-y-2">
              {(cab.covers ?? []).map((cv) => (
                <div key={cv.id} className="flex items-center gap-2 flex-wrap rounded-lg border border-white/[0.06] bg-ink-900/50 px-2 py-1.5">
                  <Chip tone="cyan">{cv.side === "L" ? "Left" : cv.side === "R" ? "Right" : cv.side === "T" ? "Top" : "Bottom"}</Chip>
                  <Num
                    className="!w-[74px] !py-1 !px-2"
                    value={cv.w}
                    onChange={(v) => patchCovers((cs) => cs.map((x) => (x.id === cv.id ? { ...x, w: Math.round(v) } : x)))}
                  />
                  <span className="text-[10.5px] text-ink-500">× </span>
                  <Num
                    className="!w-[74px] !py-1 !px-2"
                    value={cv.h}
                    onChange={(v) => patchCovers((cs) => cs.map((x) => (x.id === cv.id ? { ...x, h: Math.round(v) } : x)))}
                  />
                  <Num
                    className="!w-[64px] !py-1 !px-2"
                    value={cv.thk ?? 0}
                    onChange={(v) => patchCovers((cs) => cs.map((x) => (x.id === cv.id ? { ...x, thk: Math.round(v) } : x)))}
                    min={0}
                  />
                  <span className="text-[10.5px] text-ink-500" title={cv.thk > 0 ? "mm" : "0 = auto — plywood 16.5mm / MDF 19mm"}>
                    {cv.thk > 0 ? "mm" : "auto"}
                  </span>
                  <Seg
                    options={[{ v: "mdf", l: "MDF" }, { v: "plywood", l: "Plywood" }]}
                    value={cv.mat ?? "mdf"}
                    onChange={(v) => patchCovers((cs) => cs.map((x) => (x.id === cv.id ? { ...x, mat: v as CoverPanel["mat"] } : x)))}
                  />
                  {cv.mat === "mdf" && (
                    <Seg
                      options={[{ v: "white", l: "White" }, { v: "oak", l: "Oak" }]}
                      value={cv.finish ?? settings.mdfFinish ?? "white"}
                      onChange={(v) => patchCovers((cs) => cs.map((x) => (x.id === cv.id ? { ...x, finish: v as CoverPanel["finish"] } : x)))}
                    />
                  )}
                  {cv.mat === "plywood" && (
                    <select
                      className="inp !w-[150px] !py-1 !px-1.5 text-[11px]"
                      title="Plywood material for this cover panel — any material from Settings → materials"
                      value={cv.matId ?? ""}
                      onChange={(e) =>
                        patchCovers((cs) => cs.map((x) => (x.id === cv.id ? { ...x, matId: e.target.value || null } : x)))
                      }
                    >
                      <option value="">Default — {plyMaterialById(settings, null).name}</option>
                      {plyMaterialsOf(settings).map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  )}
                  <Chip tone={cv.mat === "plywood" || (cv.finish ?? settings.mdfFinish ?? "white") === "oak" ? "amber" : "slate"}>
                    {cv.mat === "plywood"
                      ? `plywood · banded`
                      : (cv.finish ?? settings.mdfFinish ?? "white") === "oak"
                        ? "oak · banded"
                        : "white MDF · no banding"}
                  </Chip>
                  <Chip tone="amber">
                    {Math.round(cv.w * 10) / 10} × {Math.round(cv.h * 10) / 10} × {cv.thk > 0 ? `${cv.thk}mm` : `auto (${cv.mat === "plywood" ? settings.bodyThk : settings.mdfThk}mm)`}
                  </Chip>
                  <Btn
                    size="sm"
                    variant="danger"
                    className="ml-auto"
                    onClick={() => patchCovers((cs) => cs.filter((x) => x.id !== cv.id))}
                  >
                    <Trash2 size={11} />
                  </Btn>
                </div>
              ))}
            </div>
          )}
        </div>

        {isNotched(cab.type) && (
          <div className="card p-4">
            <h3 className="card-h text-[14px]">◱ {cab.type} notch — side panel cut-outs</h3>
            <p className="hint mt-1">
              {cab.type === "L"
                ? "Rectangular notch removed from the TOP-FRONT corner of both side panels."
                : "TWO notches on both side panels: top-front corner and mid-panel."}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {cab.type === "L" ? (
                <>
                  <Field label="Notch width lCutW (mm)"><Num value={cab.lCutW} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, lCutW: v }))} /></Field>
                  <Field label="Notch height lCutH (mm)"><Num value={cab.lCutH} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, lCutH: v }))} /></Field>
                </>
              ) : (
                <>
                  <Field label="Notch width cCutW (mm)"><Num value={cab.cCutW} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, cCutW: v }))} /></Field>
                  <Field label="Top notch height cCutTopH (mm)"><Num value={cab.cCutTopH} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, cCutTopH: v }))} /></Field>
                  <Field label="Mid notch height cCutMidH (mm)"><Num value={cab.cCutMidH} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, cCutMidH: v }))} /></Field>
                  <Field label="Mid offset from floor (mm)"><Num value={cab.cCutOffsetFromBottom} onChange={(v) => updateCabinet(cab.id, (c) => ({ ...c, cCutOffsetFromBottom: v }))} /></Field>
                </>
              )}
            </div>
          </div>
        )}

        <div className="card p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="card-h text-[14px]"><Rows3 size={15} className="text-amber-400" /> {t(lang, "rows")}</h3>
            <div className="flex gap-1.5 flex-wrap items-center">
              {stacked && (
                <Seg
                  options={[{ v: "all", l: "All" }, ...heights.map((_, bi) => ({ v: String(bi), l: `Box ${bi + 1}` }))]}
                  value={String(boxView)}
                  onChange={(v) => setBoxSel(v === "all" ? "all" : Number(v))}
                />
              )}
              <Btn
                size="sm"
                title="Split rows evenly (per box on stacked cabinets)"
                onClick={() =>
                  setRows((rs) => {
                    if (!stacked) {
                      const n = rs.length || 1;
                      const base = Math.floor(BH / n);
                      return rs.map((r, i) => ({ ...r, h: i === n - 1 ? BH - base * (n - 1) : base }));
                    }
                    // stacked: even-split each targeted box independently against its own height
                    const next = [...rs];
                    const boxes = boxView === "all" ? heights.map((_, bi) => bi) : [boxView as number];
                    boxes.forEach((bi) => {
                      const idx = next.map((r, i) => ((r.box ?? 0) === bi ? i : -1)).filter((i) => i >= 0);
                      if (idx.length === 0) return;
                      const n = idx.length;
                      const target = boxTargetOf(bi);
                      const base = Math.floor(target / n);
                      idx.forEach((i, k) => {
                        next[i] = { ...next[i], h: k === n - 1 ? target - base * (n - 1) : base };
                      });
                    });
                    return next;
                  })
                }
              >
                <ArrowDownUp size={13} /> Even
              </Btn>
              <Btn
                size="sm"
                variant="ok"
                title={stacked ? "Add a section to the selected box — sized to fill that box's remaining height" : "Add a section"}
                onClick={() =>
                  setRows((rs) => {
                    if (!stacked) return [...rs, { id: uid(), h: Math.max(100, BH - rowSum), columns: [mkColumn({ shelves: 1 })] }];
                    const bi = boxView === "all" ? 0 : (boxView as number);
                    const sum = rs.filter((r) => (r.box ?? 0) === bi).reduce((a, r) => a + r.h, 0);
                    return [...rs, { id: uid(), h: Math.max(100, boxTargetOf(bi) - sum), box: bi, columns: [mkColumn({ shelves: 1 })] }];
                  })
                }
              >
                <Plus size={13} /> {t(lang, "addRow")}
              </Btn>
            </div>
          </div>
          <p className="hint mt-2">
            Rows bottom → top. The section divider is auto-emitted and always present.
            {stacked && " Add / Even target the selected box — a row's height defaults to ITS BOX's remaining height, not the whole cabinet."}
          </p>
          {stacked && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {heights.map((_, bi) => {
                const sum = boxSumOf(bi);
                const tgt = boxTargetOf(bi);
                const ok = Math.abs(sum - tgt) < 1;
                return (
                  <Chip key={bi} tone={ok ? "green" : "red"}>
                    Box {bi + 1} Σ {Math.round(sum)}/{Math.round(tgt)}mm
                  </Chip>
                );
              })}
            </div>
          )}

          <div className="mt-3 space-y-3">
            {cab.rows.map((r, ri) => {
              if (boxView !== "all" && (r.box ?? 0) !== boxView) return null; // box-tab filter
              const lays = columnLayout(cab, r, settings);
              return (
                <div key={r.id} className="rounded-xl border border-white/[0.08] bg-ink-900/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-ink-400 w-8">
                      {stacked ? `R${cab.rows.filter((x) => (x.box ?? 0) === (r.box ?? 0)).indexOf(r) + 1}` : `R${ri + 1}`}
                    </span>
                    <div className="w-[92px]"><Num value={r.h} onChange={(v) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, h: v } : x)))} /></div>
                    <span className="text-[11px] text-ink-500">mm tall</span>
                    {stackOn(cab) && (
                      <select
                        className="inp !w-[76px] !py-1 !px-1.5 text-[11px]"
                        title="Which stacked box this row belongs to"
                        value={r.box ?? 0}
                        onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, box: Number(e.target.value) } : x)))}
                      >
                        {stackedHeights(cab).map((_, bi) => (
                          <option key={bi} value={bi}>Box {bi + 1}</option>
                        ))}
                      </select>
                    )}
                    <Chip>gap {Math.round(shelfGap(r.h, Math.max(1, r.columns[0]?.shelves ?? 0), settings))}mm</Chip>
                    <Btn size="sm" className="ml-auto" onClick={() => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, columns: [...x.columns, mkColumn({ shelves: 1 })] } : x)))}>
                      <Columns3 size={13} /> {t(lang, "addColumn")}
                    </Btn>
                    <Btn size="sm" variant="danger" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><Trash2 size={13} /></Btn>
                  </div>


                  <div className="mt-2.5 space-y-2.5">
                    {r.columns.map((col, ci) => {
                      const lay = lays[ci];
                      const hasDr = columnHasDrawers(col);
                      return (
                        <ColumnEditor
                          key={col.id}
                          col={col}
                          ci={ci}
                          ri={ri}
                          r={r}
                          cab={cab}
                          lay={lay}
                          settings={settings}
                          hasDr={hasDr}
                          clipboard={clipboard}
                          setClipboard={setClipboard}
                          patchCol={patchCol}
                          patchDoor={patchDoor}
                          patchDrawer={patchDrawer}
                          setRows={setRows}
                          updateCabinet={updateCabinet}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {cab.rows.length === 0 && <div className="text-xs text-ink-400 py-3 text-center">No rows — add one above.</div>}
          </div>
        </div>

        {issues.length > 0 && (
          <div className="card p-4 border-amber-500/20">
            <h3 className="card-h text-[13px] text-amber-300">Validation</h3>
            <ul className="mt-2 space-y-1.5">
              {issues.map((v, i) => (
                <li key={i} className="text-xs flex gap-2 items-start">
                  <Chip tone={v.level === "err" ? "red" : "amber"}>{v.level === "err" ? "ERR" : "WARN"}</Chip>
                  <span className="text-ink-200 pt-0.5">{v.msg}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card p-4 xl:sticky xl:top-[120px] h-fit">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="card-h text-[14px]"><PencilRuler size={15} className="text-amber-400" /> {cab.name} — 360°</h3>
          <div className="flex gap-1.5">
            <Btn size="sm" onClick={() => viewer.current?.setView("iso")}>Iso</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("front")}>Front</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("side")}>Side</Btn>
          </div>
        </div>
        <p className="hint mt-1.5">Drag = rotate · Scroll = zoom · Right-drag = pan</p>
        <div className="mt-3 h-[430px] rounded-xl overflow-hidden border border-white/[0.07] bg-[#0a0f18]">
          <ThreeCanvas cabinets={single} settings={settings} showDims={showDims} doorsOpen={doorsOpen} drawersOpen={drawersOpen} onReady={(v) => (viewer.current = v)} />
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Btn size="sm" variant={doorsOpen ? "ok" : "default"} onClick={() => setDoorsOpen(!doorsOpen)}>
            {doorsOpen ? <DoorOpen size={14} /> : <DoorClosed size={14} />} {doorsOpen ? t(lang, "closeDoors") : t(lang, "openDoors")}
          </Btn>
          <Btn size="sm" variant={drawersOpen ? "ok" : "default"} onClick={() => setDrawersOpen(!drawersOpen)}>
            <SquareMousePointer size={14} /> {drawersOpen ? t(lang, "closeDrawers") : t(lang, "openDrawers")}
          </Btn>
          <label className="flex items-center gap-2 text-[12px] text-ink-200 ml-1 cursor-pointer">
            <input type="checkbox" className="chk" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} /> {t(lang, "dimensions")}
          </label>
        </div>
        <hr className="sep" />
        <h4 className="field-label !mb-2 flex items-center gap-1.5"><Layers size={12} /> Visibility</h4>
        <LayerToggles vis={layers} onChange={(k, v) => { setLayers((s) => ({ ...s, [k]: v })); viewer.current?.setLayer(k, v); }} />
      </div>
    </div>
  );
}

/* ============== column editor ============== */

function ColumnEditor({
  col,
  ci,
  r,
  cab,
  lay,
  ri,
  settings,
  hasDr,
  clipboard,
  setClipboard,
  patchCol,
  patchDoor,
  patchDrawer,
  setRows,
  updateCabinet,
}: {
  col: ColumnSpec;
  ci: number;
  ri: number;
  r: RowSpec;
  cab: Cabinet;
  lay: ReturnType<typeof columnLayout>[number] | undefined;
  settings: Settings;
  hasDr: boolean;
  clipboard: { kind: "column"; col: ColumnSpec } | null;
  setClipboard: (v: { kind: "column"; col: ColumnSpec } | null) => void;
  patchCol: (rid: string, cid: string, patch: Partial<ColumnSpec>) => void;
  patchDoor: (rid: string, cid: string, patch: Partial<DoorSpec>) => void;
  patchDrawer: (rid: string, cid: string, did: string, patch: Partial<DrawerSpec>) => void;
  setRows: (fn: (rows: RowSpec[]) => RowSpec[]) => void;
  updateCabinet: (id: string, fn: (c: Cabinet) => Cabinet) => void;
}) {
  const lang = "en";
  const [showSub, setShowSub] = useState(false);
  void ri;
  // sub-sections are only relevant when the column holds a hidden (inner) drawer
  const hasHidden = !cab.isKitchen && col.drawers.some((d) => d.hidden);
  // when a column is split into sub-rows, the sub-rows own the content
  const isSplit = (col.rows ?? []).length > 0;
  // drawers sit at the bank position (bottom / top / custom); shelves fill the zone left over
  const bank = drawerBank(col, r.h, settings);
  const aboveBank = col.drawerAlign !== "top";
  const shelfZoneH = Math.max(0, aboveBank ? r.h - bank.y - bank.h : bank.y);
  const shelfGapNow = col.shelves > 0 ? Math.round(shelfGap(shelfZoneH, col.shelves, settings)) : 0;
  // door W×H (rule F) + auto hinge count (rule E) — same math as the model
  const BH = boxHeight(cab, settings);
  const faceW = !lay || r.columns.length === 1 ? cab.width : columnFaceWidth(cab, lay, settings);
  const leafH = col.door ? (col.door.full ? BH : r.h) : 0;
  const doorDim = col.door ? doorDims(faceW, leafH, col.door, settings) : null;
  const autoHinges = col.door ? effectiveHingeCount(col.door, leafH) : 0;
  // shelves above the rail (rule D) — auto preview count / manual Y list
  const railH = col.railHeight ?? (col.rail === "suits" ? settings.railSuitsH : col.rail === "dresses" ? settings.railDressesH : settings.railDouble1);
  const railMode = col.railShelfMode ?? "auto";
  const autoRailYs = col.railShelf ? railShelfYs({ ...col, railShelfMode: "auto" }, settings, r.h) : [];
  const manualRailCount = Math.max(1, Math.round(col.railShelfCount ?? (col.shelfPositions?.length || 1)));
  const manualRailYs = (col.shelfPositions ?? []).slice(0, manualRailCount);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-ink-850/70 p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        {r.columns.length > 1 && <Chip tone="cyan">C{ci + 1}</Chip>}
        <label className="flex items-center gap-1 text-[11px] text-ink-400">
          W
          <Num className="!w-[74px] !py-1 !px-2" value={col.width} onChange={(v) => patchCol(r.id, col.id, { width: Math.max(0, v) })} />
        </label>
        <Chip>{Math.round(lay?.w ?? 0)}mm</Chip>
        <select className="inp !w-[112px] !py-1 text-[12px]" value={frontOf(col)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "fixed") {
              patchCol(r.id, col.id, { fixed: true, door: null, drawers: [] });
              updateCabinet(cab.id, (c) => ({ ...c, hasFronts: true }));
            } else if (v === "drawers") patchCol(r.id, col.id, { fixed: false, door: null, drawers: col.drawers.length ? col.drawers : splitDrawers(1, r.h) });
            else if (v === "open") patchCol(r.id, col.id, { fixed: false, door: null, drawers: [] });
            else {
              // adding a door explicitly enables MDF fronts on this cabinet
              // (rule C — Left / Right / Double / Sliding, material picked below)
              patchCol(r.id, col.id, { fixed: false, door: doorFromFront(v, settings), drawers: [] });
              updateCabinet(cab.id, (c) => ({ ...c, hasFronts: true }));
            }
          }}>
          {FRONTS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
        </select>
        {hasHidden && (
          <button className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200" onClick={() => setShowSub((v) => !v)}>
            {showSub ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {t(lang, "subSection")}{col.sub?.length ? ` (${col.sub.length})` : ""}
          </button>
        )}
        {/* single split control — pick the direction, one click */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-ink-600/70 bg-ink-900/90 p-0.5">
          <span className="px-1.5 text-[10.5px] text-ink-400">Split</span>
          <button
            title="Split this section into stacked rows"
            onClick={() =>
              patchCol(r.id, col.id, {
                rows:
                  (col.rows ?? []).length > 0
                    ? [...(col.rows ?? []), { id: uid(), h: 100, columns: [mkColumn()] }]
                    : [
                        { id: uid(), h: 100, columns: [mkColumn()] },
                        { id: uid(), h: 100, columns: [mkColumn()] },
                      ],
              })
            }
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-ink-200 transition-all hover:bg-amber-glow hover:text-ink-950"
          >
            <Rows3 size={11} /> by row{col.rows?.length ? ` (${col.rows.length})` : ""}
          </button>
          <button
            title="Split this section into side-by-side columns"
            onClick={() => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, columns: [...x.columns, mkColumn()] } : x)))}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-ink-200 transition-all hover:bg-amber-glow hover:text-ink-950"
          >
            <Columns3 size={11} /> by column
          </button>
        </div>
        {r.columns.length > 1 && (
          <Btn size="sm" variant="danger" onClick={() => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, columns: x.columns.filter((c) => c.id !== col.id) } : x)))}>
            <Trash2 size={11} />
          </Btn>
        )}
        <Btn size="sm" title="Copy this column" onClick={() => setClipboard({ kind: "column", col: { ...col, id: uid() } })}>
          <Copy size={11} />
        </Btn>
        {clipboard && (
          <Btn size="sm" variant="ok" title="Paste column" onClick={() => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, columns: [...x.columns, { ...clipboard.col, id: uid() }] } : x)))}>
            <ClipboardPaste size={11} />
          </Btn>
        )}
      </div>

      {/* shelves can coexist with drawers — shelves on top, drawers below */}
      <div className={`flex items-center gap-2 mt-2 flex-wrap ${isSplit ? "hidden" : ""}`}>
        <label className="flex items-center gap-1.5 text-[11px] text-ink-300">
          {t(lang, "shelves")}
          <Num className="!w-[62px] !py-1 !px-2" value={col.shelves} onChange={(v) => patchCol(r.id, col.id, { shelves: Math.max(0, Math.round(v)) })} />
        </label>
        <Btn size="sm" onClick={() => patchCol(r.id, col.id, { shelves: recommendedShelves(shelfZoneH, settings) })}>{t(lang, "auto")}</Btn>
        {col.shelves > 0 && shelfZoneH > 20 && (
          <Chip tone={shelfGapNow >= settings.shelfGapMin && shelfGapNow <= settings.shelfGapMax ? "green" : "amber"}>
            {t(lang, "gap")} {shelfGapNow}mm
          </Chip>
        )}
        {col.shelves > 0 && <Chip>{(Math.max(0, lay?.w ?? 0) - settings.shelfIncrease).toFixed(0)}mm</Chip>}
        {hasDr && col.shelves > 0 && <Chip tone="cyan">{aboveBank ? "shelves above · drawers below" : "shelves below · drawers top"} · +splitter</Chip>}
      </div>

      {hasDr && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10.5px] text-ink-400">Bank position:</span>
            <Seg
              options={[{ v: "bottom", l: "Bottom" }, { v: "top", l: "Top" }, { v: "custom", l: "Custom" }]}
              value={col.drawerAlign ?? "bottom"}
              onChange={(v) => patchCol(r.id, col.id, { drawerAlign: v as ColumnSpec["drawerAlign"] })}
            />
            {(col.drawerAlign ?? "bottom") === "custom" && (
              <Num
                className="!w-[72px] !py-1 !px-2"
                value={col.drawerOffsetY ?? 0}
                onChange={(v) => patchCol(r.id, col.id, { drawerOffsetY: Math.max(0, Math.round(v)) })}
              />
            )}
            <Chip tone={shelfZoneH > 20 ? "green" : "amber"}>
              bank {Math.round(bank.y)}→{Math.round(bank.y + bank.h)}mm{col.shelves > 0 ? ` · shelf zone ${Math.round(shelfZoneH)}mm` : ""}
            </Chip>
          </div>
          <p className="text-[10.5px] text-sky-300/85 leading-snug">
            Slide holes are laid out <b>from the bank bottom</b> — Y offset is measured from the bottom of the drawer bank (auto:
            first {settings.drawerHoleYStart}mm, then +{settings.drawerHoleYStep}mm). You can override it per drawer.
          </p>
          {col.drawers.map((d, di) => (
            <div key={d.id} className="flex items-center gap-1.5 text-[11px] text-ink-300 flex-wrap">
              <span className="font-mono text-ink-500 w-4">{di + 1}</span>
              <Num className="!w-[72px] !py-1 !px-2" value={d.frontHeight} onChange={(v) => patchDrawer(r.id, col.id, d.id, { frontHeight: v })} />
              {!cab.isKitchen && (
                <label className="flex items-center gap-1 cursor-pointer rounded-md border border-white/[0.07] px-1.5 py-0.5" title="Hidden — inner drawer behind a door">
                  <input type="checkbox" className="chk !h-3 !w-3" checked={d.hidden} onChange={(e) => patchDrawer(r.id, col.id, d.id, { hidden: e.target.checked })} />
                  {t(lang, "hidden")}
                </label>
              )}
              {!cab.isKitchen && (
                <select className="inp !w-[86px] !py-1 !px-1.5 text-[11px]" value={d.slideDepthCm}
                  onChange={(e) => patchDrawer(r.id, col.id, d.id, { slideDepthCm: parseInt(e.target.value) })}>
                  {AVAILABLE_DRAWER_DEPTHS.map((cm) => <option key={cm} value={cm}>{cm * 10}mm</option>)}
                </select>
              )}
              {cab.isKitchen && <Chip tone="green">500mm</Chip>}
              {/* MDF fronts are opt-in for EVERY drawer (hidden or not) */}
              <label
                className={`flex items-center gap-1 cursor-pointer rounded-md border px-1.5 py-0.5 ${
                  d.frontMdf ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-white/[0.07]"
                }`}
                title={`No MDF front is generated unless enabled · inlaid ${settings.hiddenFrontInset}mm inside`}
              >
                <input
                  type="checkbox"
                  className="chk !h-3 !w-3"
                  checked={!!d.frontMdf}
                  onChange={(e) => patchDrawer(r.id, col.id, d.id, { frontMdf: e.target.checked })}
                />
                Front MDF
              </label>
              <Btn size="sm" variant="danger" onClick={() => patchCol(r.id, col.id, { drawers: col.drawers.filter((x) => x.id !== d.id) })}><Trash2 size={11} /></Btn>
            </div>
          ))}
          <div className="flex items-center justify-between pt-0.5 gap-2 flex-wrap">
            <Btn size="sm" onClick={() => patchCol(r.id, col.id, { drawers: splitDrawers(col.drawers.length + 1, r.h, col.drawers) })}>
              <Plus size={11} /> {t(lang, "drawer")}
            </Btn>
            <Btn size="sm" title="Divide the row height equally" onClick={() => patchCol(r.id, col.id, { drawers: splitDrawers(col.drawers.length, r.h, col.drawers) })}>
              <ArrowDownUp size={11} /> {t(lang, "even")}
            </Btn>
            <Chip tone={Math.abs(col.drawers.reduce((a, d) => a + d.frontHeight, 0) - r.h) < 20 ? "green" : "amber"}>
              {t(lang, "sum")} {Math.round(col.drawers.reduce((a, d) => a + d.frontHeight, 0))}/{Math.round(r.h)}
            </Chip>
          </div>
        </div>
      )}

      {/* ---- shelf placement (auto even gap · or manual Y) + hanging rail ---- */}
      {col.shelves > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10.5px] text-ink-400">Shelves:</span>
            <Seg
              options={[{ v: "auto", l: "Auto" }, { v: "manual", l: "Manual Y" }]}
              value={col.shelfMode ?? "auto"}
              onChange={(v) => patchCol(r.id, col.id, { shelfMode: v as ColumnSpec["shelfMode"] })}
            />
            <Chip tone="green">{col.shelves > 1 ? `${col.shelves} shelves` : "1 shelf"} · zone {Math.round(shelfZoneH)}mm</Chip>
          </div>
          {(col.shelfMode ?? "auto") === "manual" && (
            <div className="space-y-1">
              {(col.shelfPositions ?? []).slice(0, col.shelves).map((y, yi) => (
                <div key={yi} className="flex items-center gap-1.5 text-[11px] text-ink-300">
                  <span className="font-mono text-ink-500 w-4">{yi + 1}</span>
                  <Num
                    className="!w-[72px] !py-1 !px-2"
                    value={y}
                    onChange={(v) => {
                      const arr = [...(col.shelfPositions ?? Array(col.shelves).fill(0))];
                      arr[yi] = Math.max(0, Math.min(Math.round(v), Math.round(shelfZoneH)));
                      patchCol(r.id, col.id, { shelfPositions: arr });
                    }}
                  />
                  <span className="text-ink-500">mm from bottom</span>
                  <span className="text-[9.5px] text-ink-600" title="Y is measured to the CENTER of the middle shelf-pin hole (the row of 3 holes)">(Y = middle hole center)</span>
                  <Btn size="sm" variant="ghost" title="Place at top" onClick={() => {
                    const arr = [...(col.shelfPositions ?? Array(col.shelves).fill(0))];
                    arr[yi] = Math.round(shelfZoneH);
                    patchCol(r.id, col.id, { shelfPositions: arr });
                  }}>▲ top</Btn>
                  <Btn size="sm" variant="ghost" title="Place at bottom" onClick={() => {
                    const arr = [...(col.shelfPositions ?? Array(col.shelves).fill(0))];
                    arr[yi] = 0;
                    patchCol(r.id, col.id, { shelfPositions: arr });
                  }}>▼ bottom</Btn>
                </div>
              ))}
              <p className="text-[10.5px] text-sky-300/85 leading-snug">
                Type the Y of each shelf in mm measured from the <b>bottom of this section</b>. Pin holes are drilled at each Y
                (2 columns × {Math.max(1, Math.round(settings.shelfHolesPerSide))} pins per side, {settings.shelfHoleSpacing}mm apart).
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---- decorative MDF back panel (niche back) ---- */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="text-[10.5px] text-ink-400">Niche back:</span>
        <Seg
          options={[{ v: "off", l: "Off" }, { v: "on", l: "MDF back" }]}
          value={col.mdfBack ? "on" : "off"}
          onChange={(v) => patchCol(r.id, col.id, { mdfBack: v === "on" })}
        />
        {col.mdfBack && (
          <>
            <Num
              className="!w-[72px] !py-1 !px-2"
              value={col.mdfBackThk || settings.mdfThk}
              onChange={(v) => patchCol(r.id, col.id, { mdfBackThk: Math.max(6, Math.round(v)) })}
            />
            <span className="text-[10.5px] text-ink-400">mm thk</span>
            <Chip tone="amber">real MDF part · in front of the back panel</Chip>
          </>
        )}
      </div>

      {/* ---- hanging rail (suits / dresses) ---- */}
      <div className="mt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10.5px] text-ink-400">Hanging:</span>
          <Seg
            options={[{ v: "off", l: "Off" }, { v: "suits", l: "Suits" }, { v: "dresses", l: "Dresses" }, { v: "double", l: "Double" }]}
            value={col.rail ?? "off"}
            onChange={(v) => patchCol(r.id, col.id, { rail: v as ColumnSpec["rail"] })}
          />
          {col.rail && col.rail !== "off" && (
            <>
              <Chip tone="amber">
                {col.rail === "suits" ? `suits rail` : col.rail === "dresses" ? `dresses rail` : `double rail`}
              </Chip>
              <Num
                className="!w-[86px] !py-1 !px-2"
                value={col.railHeight ?? (col.rail === "dresses" ? settings.railDressesH : settings.railSuitsH)}
                onChange={(v) => patchCol(r.id, col.id, { railHeight: Math.max(0, Math.round(v)) })}
              />
              <span className="text-[10.5px] text-ink-400">mm height</span>
              <label className="flex items-center gap-1.5 cursor-pointer rounded-md border border-white/10 px-2 py-1 text-[11px]" title="Add shelves directly above the rail — Auto: max count with every gap ≥ the min gap from Settings; Manual: exact Y positions">
                <input type="checkbox" className="chk !h-3 !w-3" checked={!!col.railShelf} onChange={(e) => patchCol(r.id, col.id, { railShelf: e.target.checked })} />
                <span className={col.railShelf ? "text-amber-200" : "text-ink-300"}>Shelf above</span>
              </label>
              {!!col.railShelf && (
                <>
                  <Seg
                    options={[{ v: "auto", l: "Auto" }, { v: "manual", l: "Manual Y" }]}
                    value={railMode}
                    onChange={(v) => patchCol(r.id, col.id, { railShelfMode: v as "auto" | "manual" })}
                  />
                  {railMode === "auto" ? (
                    <Chip tone="green">
                      auto: {autoRailYs.length} shelf{autoRailYs.length === 1 ? "" : "s"} · gaps ≥ {settings.railShelfMinGap}mm
                    </Chip>
                  ) : (
                    <>
                      <span title="Number of shelves above the rail (manual mode)" className="inline-flex">
                        <Num
                          className="!w-[58px] !py-1 !px-2"
                          min={1}
                          max={10}
                          value={manualRailCount}
                          onChange={(v) => {
                            const n = Math.max(1, Math.round(v));
                            const prev = (col.shelfPositions ?? []).slice(0, manualRailCount);
                            const space = Math.max(0, r.h - railH);
                            patchCol(r.id, col.id, {
                              railShelfCount: n,
                              shelfPositions: Array.from({ length: n }, (_, k) => prev[k] ?? railH + (space * (k + 1)) / (n + 1)),
                            });
                          }}
                        />
                      </span>
                      <span className="text-[10.5px] text-ink-400">shelves</span>
                    </>
                  )}
                </>
              )}
              {railMode === "manual" && !!col.railShelf && (
                <div className="w-full pl-5 space-y-1">
                  {manualRailYs.map((y, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-ink-500 w-8">Y{i + 1}</span>
                      <Num
                        className="!w-[74px] !py-0.5 !px-2"
                        min={0}
                        value={Math.round(y)}
                        onChange={(v) =>
                          patchCol(r.id, col.id, {
                            shelfPositions: manualRailYs.map((yy, k) => (k === i ? Math.max(0, Math.round(v)) : yy)),
                          })
                        }
                      />
                      <span className="text-[10px] text-ink-400">
                        mm from bottom · gap {Math.round(y - (i === 0 ? railH : manualRailYs[i - 1]))}mm
                        {Math.round(y - (i === 0 ? railH : manualRailYs[i - 1])) < settings.railShelfMinGap ? (
                          <span className="text-red-300/90"> (tight)</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {col.door && !hasDr && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Seg options={[{ v: "overlay", l: "Overlay" }, { v: "inset", l: "Inset" }]} value={col.door.style} onChange={(v) => patchDoor(r.id, col.id, { style: v as DoorSpec["style"] })} />
            {col.door.type === "single" && (
              <Seg options={[{ v: "left", l: "Hinge L" }, { v: "right", l: "Hinge R" }]} value={col.door.swing} onChange={(v) => patchDoor(r.id, col.id, { swing: v as DoorSpec["swing"] })} />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Seg
              options={[{ v: "mdf", l: "MDF" }, { v: "poly", l: "Plywood" }, { v: "glass", l: "Glass / Alu" }]}
              value={col.door.material}
              onChange={(v) => patchDoor(r.id, col.id, { material: v as DoorSpec["material"] })}
            />
            {col.door.material === "mdf" && (
              <Seg
                options={[{ v: "white", l: "White" }, { v: "oak", l: "Oak" }]}
                value={col.door.finish ?? settings.mdfFinish ?? "white"}
                onChange={(v) => patchDoor(r.id, col.id, { finish: v as DoorSpec["finish"] })}
              />
            )}
            {/* MDF thickness comes from the system defaults — no manual override */}
            <Chip>{col.door.material === "glass" ? "Glass + aluminum — no cut part" : col.door.material === "mdf" ? `MDF ${settings.mdfThk}mm` : `Plywood ${settings.bodyThk}mm`}</Chip>
            {col.door.type !== "sliding" && (
              <select className="inp !w-[170px] !py-1 text-[11px]" value={col.door.hingeBrand} onChange={(e) => patchDoor(r.id, col.id, { hingeBrand: e.target.value })}>
                {HINGE_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10.5px] text-ink-400">W×H:</span>
            <span title="Computed door size — width from the column opening, height from the section (or the manual override below)">
              <Chip tone="cyan">{doorDim ? `${doorDim.count === 2 ? `2× ` : ""}${Math.round(doorDim.w)} × ${Math.round(doorDim.h)}mm` : "—"}</Chip>
            </span>
            <span className="text-[10.5px] text-ink-400">Manual H:</span>
            <Num
              className="!w-[74px] !py-1 !px-2"
              min={0}
              value={col.door.hOverride ?? 0}
              onChange={(v) => patchDoor(r.id, col.id, { hOverride: v > 0 ? Math.round(v) : undefined })}
            />
            <span className="text-[10px] text-ink-500">mm · 0 = auto from section</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10.5px] text-ink-400">Hinges:</span>
            <select
              className="inp !w-[86px] !py-1 !px-1.5 text-[11px]"
              title="Number of universal 35mm hinges — Auto: ≤1000→2 · ≤1500→3 · ≤2000→4 · ≤2400→5 · >2400→6. Cups 140mm from top & bottom. Cups are bored in the door (never the plywood, never the DXF)."
              value={col.door.hingeCount ?? ""}
              onChange={(e) => patchDoor(r.id, col.id, { hingeCount: e.target.value ? Number(e.target.value) : undefined })}
            >
              <option value="">Auto</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <Chip tone={col.door.hingeCount ? "cyan" : "green"}>
              {col.door.hingeCount ? `${col.door.hingeCount} hinges · manual` : `Auto — ${autoHinges} hinges`}
            </Chip>
            {col.door.material === "mdf" && (
              <Chip tone={(col.door.finish ?? settings.mdfFinish ?? "white") === "oak" ? "amber" : "slate"}>
                {(col.door.finish ?? settings.mdfFinish ?? "white") === "oak" ? "oak · banded" : "white · no banding"}
              </Chip>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label
              className="flex items-center gap-1.5 cursor-pointer rounded-md border px-2 py-1 text-[11px]"
              title="One long door spanning the WHOLE cabinet height (all rows / all stacked boxes) instead of just this row"
            >
              <input type="checkbox" className="chk !h-3 !w-3" checked={!!col.door.full} onChange={(e) => patchDoor(r.id, col.id, { full: e.target.checked })} />
              <span className={col.door.full ? "text-amber-200" : "text-ink-300"}>Full height</span>
            </label>
            {col.door.full && (
              <Chip tone="amber">spans the whole cabinet — one long door part{stackOn(cab) ? " across all boxes" : ""}</Chip>
            )}
          </div>
        </div>
      )}

      {/* column → row split: stacked sub-rows, each splittable into columns again */}
      {(col.rows ?? []).length > 0 && (
        <div className="mt-2.5 rounded-md border border-cyan-400/25 bg-cyan-400/[0.05] p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <Chip tone="cyan">column → rows</Chip>
            <span className="text-[10.5px] text-ink-400">heights are relative shares of this column</span>
          </div>
          {(col.rows ?? []).map((sr, sri) => {
            const setSubRows = (fn: (rows: RowSpec[]) => RowSpec[]) => patchCol(r.id, col.id, { rows: fn(col.rows ?? []) });
            return (
              <div key={sr.id} className="rounded border border-white/[0.06] bg-ink-850/70 p-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-[10.5px] text-ink-500 w-9">R{sri + 1}</span>
                  <Num
                    className="!w-[70px] !py-1 !px-2"
                    value={sr.h}
                    onChange={(v) => setSubRows((rs) => rs.map((x) => (x.id === sr.id ? { ...x, h: Math.max(1, v) } : x)))}
                  />
                  <Btn
                    size="sm"
                    title="Split this sub-row into columns"
                    onClick={() => setSubRows((rs) => rs.map((x) => (x.id === sr.id ? { ...x, columns: [...x.columns, mkColumn()] } : x)))}
                  >
                    <Columns3 size={11} /> col
                  </Btn>
                  <Chip>{sr.columns.length} col</Chip>
                  <Btn size="sm" variant="danger" className="ml-auto" onClick={() => setSubRows((rs) => rs.filter((x) => x.id !== sr.id))}>
                    <Trash2 size={10} />
                  </Btn>
                </div>
                <div className="mt-1.5 space-y-1">
                  {sr.columns.map((sc, sci) => {
                    const patchSubCol = (patch: Partial<ColumnSpec>) =>
                      setSubRows((rs) =>
                        rs.map((x) => (x.id === sr.id ? { ...x, columns: x.columns.map((y) => (y.id === sc.id ? { ...y, ...patch } : y)) } : x)),
                      );
                    const k = sc.fixed ? "fixed" : sc.drawers.length > 0 ? "drawers" : sc.door ? "door" : sc.shelves > 0 ? "shelves" : "open";
                    return (
                      <div key={sc.id} className="flex items-center gap-1.5 text-[11px] text-ink-300 flex-wrap">
                        <span className="font-mono text-ink-500 w-8">C{sci + 1}</span>
                        <Num className="!w-[62px] !py-1 !px-2" value={sc.width} onChange={(v) => patchSubCol({ width: Math.max(0, v) })} />
                        <select
                          className="inp !w-[100px] !py-1 !px-1.5 text-[11px]"
                          value={k}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "open") patchSubCol({ fixed: false, door: null, drawers: [], shelves: 0 });
                            else if (v === "shelves") patchSubCol({ fixed: false, door: null, drawers: [], shelves: 1 });
                            else if (v === "drawers") patchSubCol({ fixed: false, door: null, shelves: 0, drawers: [mkDrawer(180)] });
                            else if (v === "fixed") patchSubCol({ fixed: true, door: null, drawers: [], shelves: 0 });
                            else patchSubCol({ fixed: false, drawers: [], door: mkDoor("single", { mdfThk: settings.mdfThk }) });
                          }}
                        >
                          <option value="open">None (empty)</option>
                          <option value="shelves">Shelves</option>
                          <option value="drawers">Drawer</option>
                          <option value="door">Door</option>
                          <option value="fixed">Fixed</option>
                        </select>
                        {k === "shelves" && (
                          <Num className="!w-[52px] !py-1 !px-2" value={sc.shelves} onChange={(v) => patchSubCol({ shelves: Math.max(0, Math.round(v)) })} />
                        )}
                        {sr.columns.length > 1 && (
                          <Btn
                            size="sm"
                            variant="danger"
                            onClick={() => setSubRows((rs) => rs.map((x) => (x.id === sr.id ? { ...x, columns: x.columns.filter((y) => y.id !== sc.id) } : x)))}
                          >
                            <Trash2 size={10} />
                          </Btn>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* hidden drawer → splitter above it, then empty space or shelves */}
      {hasHidden && (
        <div className="mt-2 rounded-md border border-cyan-400/25 bg-cyan-400/[0.05] p-2 space-y-1.5">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-200 cursor-pointer">
            <input
              type="checkbox"
              className="chk !h-3.5 !w-3.5"
              checked={!!col.splitter}
              onChange={(e) => patchCol(r.id, col.id, { splitter: e.target.checked, splitterShelves: e.target.checked ? col.splitterShelves ?? 0 : 0 })}
            />
            Splitter above the drawer
          </label>
          {col.splitter && (
            <div className="flex items-center gap-2 flex-wrap pl-5">
              <span className="text-[10.5px] text-ink-400">Space above:</span>
              <Seg
                options={[{ v: "none", l: "None (empty)" }, { v: "shelves", l: "Shelves" }]}
                value={(col.splitterShelves ?? 0) > 0 ? "shelves" : "none"}
                onChange={(v) => patchCol(r.id, col.id, { splitterShelves: v === "shelves" ? Math.max(1, col.splitterShelves ?? 1) : 0 })}
              />
              {(col.splitterShelves ?? 0) > 0 && (
                <Num
                  className="!w-[58px] !py-1 !px-2"
                  value={col.splitterShelves ?? 1}
                  onChange={(v) => patchCol(r.id, col.id, { splitterShelves: Math.max(1, Math.round(v)) })}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* hidden drawer → the inner box sits inside the cabinet, so an MDF door can cover it */}
      {hasHidden && (
        <div className="mt-2 flex items-center gap-2 flex-wrap rounded-md border border-amber-400/25 bg-amber-400/[0.06] p-2">
          <span className="text-[10.5px] text-amber-200/90">{t(lang, "hidden")} → {t(lang, "door")}</span>
          <select
            className="inp !w-[128px] !py-1 !px-1.5 text-[11px]"
            value={col.door ? frontOf(col) : "open"}
            onChange={(e) => {
              const v = e.target.value;
              patchCol(r.id, col.id, { door: v === "open" ? null : { ...doorFromFront(v, settings), material: "mdf" } });
            }}
          >
            {HIDDEN_DOORS.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
          {col.door && <Chip tone="green">MDF {settings.mdfThk}mm</Chip>}
        </div>
      )}

      {/* sub-sections — drawers / shelves / fixed panels (no doors) */}
      {showSub && (
        <div className="mt-2.5 rounded-md border border-white/[0.05] bg-ink-900/60 p-2 space-y-1.5">
          <p className="text-[10.5px] text-ink-400">{t(lang, "subHint")}</p>
          {(col.sub ?? []).map((sub, si) => {
            const setSub = (patch: Partial<ColumnSpec>) =>
              patchCol(r.id, col.id, { sub: (col.sub ?? []).map((x) => (x.id === sub.id ? { ...x, ...patch } : x)) });
            const kind = sub.fixed ? "fixed" : sub.drawers.length > 0 ? "drawers" : sub.shelves > 0 ? "shelves" : "open";
            return (
              <div key={sub.id} className="rounded border border-white/[0.05] bg-ink-850/70 p-1.5">
                <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                  <span className="font-mono text-ink-500 w-9">C{ci + 1}.{si + 1}</span>
                  <select
                    className="inp !w-[104px] !py-1 !px-1.5 text-[11px]"
                    value={kind}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "open") setSub({ fixed: false, door: null, drawers: [], shelves: 0 });
                      else if (v === "shelves") setSub({ fixed: false, door: null, drawers: [], shelves: 1 });
                      else if (v === "drawers") setSub({ fixed: false, door: null, shelves: 0, drawers: [mkDrawer(Math.max(120, Math.round(r.h / Math.max(1, (col.sub ?? []).length))))] });
                      else setSub({ fixed: true, door: null, drawers: [], shelves: 0 });
                    }}
                  >
                    <option value="open">{t(lang, "open")}</option>
                    <option value="shelves">{t(lang, "shelves")}</option>
                    <option value="drawers">{t(lang, "drawers")}</option>
                    <option value="fixed">{t(lang, "fixed")}</option>
                  </select>
                  {kind === "shelves" && (
                    <>
                      <Num className="!w-[58px] !py-1 !px-2" value={sub.shelves} onChange={(v) => setSub({ shelves: Math.max(0, Math.round(v)) })} />
                      <Btn
                        size="sm"
                        title="Auto shelf count for this sub-section"
                        onClick={() => setSub({ shelves: recommendedShelves(r.h / Math.max(1, (col.sub ?? []).length), settings) })}
                      >
                        {t(lang, "auto")}
                      </Btn>
                      <Chip>
                        {t(lang, "gap")}{" "}
                        {Math.round(shelfGap(r.h / Math.max(1, (col.sub ?? []).length), Math.max(1, sub.shelves), settings))}mm
                      </Chip>
                      <Chip>{Math.round(Math.max(0, (lay?.w ?? 0) - settings.shelfIncrease))}mm</Chip>
                    </>
                  )}
                  <Btn size="sm" variant="danger" className="ml-auto" onClick={() => patchCol(r.id, col.id, { sub: (col.sub ?? []).filter((x) => x.id !== sub.id) })}>
                    <Trash2 size={10} />
                  </Btn>
                </div>
                {kind === "drawers" && (
                  <div className="mt-1.5 space-y-1">
                    {sub.drawers.map((d, di) => (
                      <div key={d.id} className="flex items-center gap-1.5 text-[11px] text-ink-300">
                        <span className="font-mono text-ink-500 w-4">{di + 1}</span>
                        <Num className="!w-[70px] !py-1 !px-2" value={d.frontHeight} onChange={(v) => setSub({ drawers: sub.drawers.map((x) => (x.id === d.id ? { ...x, frontHeight: v } : x)) })} />
                        {!cab.isKitchen && (
                          <label className="flex items-center gap-1 cursor-pointer rounded-md border border-white/[0.07] px-1.5 py-0.5">
                            <input type="checkbox" className="chk !h-3 !w-3" checked={d.hidden} onChange={(e) => setSub({ drawers: sub.drawers.map((x) => (x.id === d.id ? { ...x, hidden: e.target.checked } : x)) })} />
                            {t(lang, "hidden")}
                          </label>
                        )}
                        <label
                          className={`flex items-center gap-1 cursor-pointer rounded-md border px-1.5 py-0.5 ${
                            d.frontMdf ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-white/[0.07]"
                          }`}
                          title="No MDF front unless enabled"
                        >
                          <input
                            type="checkbox"
                            className="chk !h-3 !w-3"
                            checked={!!d.frontMdf}
                            onChange={(e) => setSub({ drawers: sub.drawers.map((x) => (x.id === d.id ? { ...x, frontMdf: e.target.checked } : x)) })}
                          />
                          Front MDF
                        </label>
                        <Btn size="sm" variant="danger" onClick={() => setSub({ drawers: sub.drawers.filter((x) => x.id !== d.id) })}><Trash2 size={10} /></Btn>
                      </div>
                    ))}
                    <Btn size="sm" onClick={() => setSub({ drawers: [...sub.drawers, mkDrawer(sub.drawers.at(-1)?.frontHeight ?? 180)] })}>
                      <Plus size={10} /> {t(lang, "drawer")}
                    </Btn>
                  </div>
                )}
              </div>
            );
          })}
          <Btn size="sm" onClick={() => patchCol(r.id, col.id, { sub: [...(col.sub ?? []), mkColumn({ shelves: 1 })] })}>
            <Plus size={11} /> {t(lang, "addSub")}
          </Btn>
        </div>
      )}
    </div>
  );
}
