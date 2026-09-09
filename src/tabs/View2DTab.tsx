import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileImage, Layers2, RotateCcw, RotateCw, Ruler } from "lucide-react";
import type { Cabinet, PanelItem, Settings } from "../types";
import { columnHasDrawers, columnLayout, drawerBank, hasKick, railShelfYs, stackOn, stackedHeights } from "../lib/model";
import { Btn, Empty } from "../components/ui";
import { downloadRaw, frontElevationDxf, frontElevationHtml, openPrintWindow } from "../lib/export";
import { layoutCabs, panelPositions, type CabPos } from "../lib/layout2d";
import { useDebounced } from "../lib/useDebounced";

/* layout math (shared by the renderer, drag hit-testing AND the dimensioned
   elevation export) — pure functions live in lib/layout2d, re-exported here
   for existing importers and the geometry tests */
export { layoutCabs, panelPositions, type CabPos };

type DragGuides = { vx?: number; vy?: number; label?: string };

interface ViewMetrics {
  W: number;
  H: number;
  sc: number; // px per mm
  base: number; // svg y of the floor
  left: number; // svg x of minX
  minX: number; // leftmost mm
}

function viewMetrics(pos: CabPos[], extra?: { maxX?: number; maxH?: number }): ViewMetrics {
  const padL = 110, padB = 110, padT = 70, W = 1400, H = 720;
  // any NaN here (corrupt panel/cab layout) would NaN the whole viewBox —
  // non-finite extras are ignored, and the result is clamped to finite
  const fx = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const minXRaw = Math.min(...pos.map((p) => p.x), 0);
  const maxXRaw = Math.max(...pos.map((p) => p.x + p.cab.width), fx(extra?.maxX), 1);
  const maxHRaw = Math.max(...pos.map((p) => p.cab.height), fx(extra?.maxH), 1);
  const minX = Number.isFinite(minXRaw) ? minXRaw : 0;
  const maxX = Number.isFinite(maxXRaw) ? maxXRaw : 1000;
  const maxH = Number.isFinite(maxHRaw) ? maxHRaw : 1000;
  const totalW = Math.max(1, maxX - minX);
  const sc = Math.min((W - padL - 60) / Math.max(totalW, 1), (H - padT - padB) / maxH);
  const base = H - padB;
  const left = padL + (W - padL - 60 - totalW * sc) / 2;
  return { W, H, sc, base, left, minX };
}

/** Controlled mm input that stays in sync with drags/sticks and has ±5 steppers. */
function PosInput({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-ink-400">{label}</span>
      <input
        className="!w-[56px] !py-0 !px-1 text-[10.5px]"
        value={txt}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parseFloat(e.target.value);
          if (isFinite(n)) onCommit(n);
        }}
      />
      <span className="inline-flex flex-col leading-none">
        <button className="text-[8px] text-ink-300 hover:text-amber-300" onClick={() => onCommit(value + 5)}>▲</button>
        <button className="text-[8px] text-ink-300 hover:text-amber-300" onClick={() => onCommit(Math.max(0, value - 5))}>▼</button>
      </span>
    </span>
  );
}

export function View2DTab({
  cabinets,
  settings,
  setCabinets,
  panels = [],
  setPanels,
}: {
  cabinets: Cabinet[];
  settings: Settings;
  setCabinets: (fn: (c: Cabinet[]) => Cabinet[]) => void;
  panels?: PanelItem[];
  setPanels?: (fn: (p: PanelItem[]) => PanelItem[]) => void;
}) {
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<"front" | "side">("front");
  const [sel, setSel] = useState<string[]>([]); // ordered: [0] = A (mover), [1] = B (target)
  const [sideLine, setSideLine] = useState<"bottom" | "top">("bottom");
  const [preview, setPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<DragGuides | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const drag = useRef<{ id: string; x0: number; y0: number; vx0: number; vy0: number; moved: boolean } | null>(null);
  const dSettings = useDebounced(settings, 160);
  const pos = useMemo(() => layoutCabs(cabinets), [cabinets]);
  const pposMemo = useMemo(() => panelPositions(cabinets, panels), [cabinets, panels]);
  const vm = useMemo(() => viewMetrics(pos, pposMemo.length ? { maxX: Math.max(...pposMemo.map(p=>p.x+p.pn.w)), maxH: Math.max(...pposMemo.map(p=>(p.y??0)+p.pn.h)) } : undefined), [pos, pposMemo]);
  const anyLayout = cabinets.some((c) => c.layout);
  // during a drag the preview position is overlaid straight into the SVG (no
  // debounce) so the cabinet sticks to the cursor; the state commit happens on release
  // live overlap detection — includes the dragged preview position so the banner
  // updates in real time while moving. Touching edges are NOT overlap.
  const curPos = useMemo(
    () => (preview ? pos.map((p) => (p.cab.id === preview.id ? { ...p, x: preview.x, y: preview.y } : p)) : pos),
    [pos, preview],
  );
  // overlap detection over cabinets AND raw panels (Phase 8) — the dragged
  // preview position is included so the banner updates live while moving
  const allBoxes = useMemo(
    () => [
      ...curPos.map((p) => ({
        id: p.cab.id,
        name: p.cab.name,
        x: p.x,
        y: p.y,
        w: p.cab.width,
        h: p.cab.height,
        z: p.cab.plan && Number.isFinite(p.cab.plan.z) ? p.cab.plan.z : 0,
      })),
      ...pposMemo.map((pp) => ({
        id: pp.pn.id,
        name: pp.pn.name,
        x: pp.x,
        y: pp.y ?? 0,
        w: pp.pn.w,
        h: pp.pn.h,
        z: pp.pn.plan && Number.isFinite(pp.pn.plan.z) ? pp.pn.plan.z : 0,
      })),
    ].filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h)),
    [curPos, pposMemo],
  );
  const overlaps = useMemo(() => overlapBoxes(allBoxes), [allBoxes]);
  const warn = useMemo(() => overlaps.flatMap((o) => [o.a, o.b]), [overlaps]);
  const svg = useMemo(
    () => buildFrontSvg(cabinets, dSettings, { override: preview, sel, guides, warn }, panels),
    [cabinets, dSettings, preview, sel, guides, warn, tick],
  );
  // depth (side) view — read-only true-depth profile of the same arrangement
  const sideSvg = useMemo(() => buildSideSvg(cabinets, dSettings, panels), [cabinets, dSettings, panels, tick]);

  const moveCab = (id: string, x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return; // a NaN commit blanks 3D
    setCabinets((prev) => prev.map((c) => (c.id === id ? { ...c, layout: { x: Math.round(x), y: Math.max(0, Math.round(y)) } } : c)));
  };
  const movePanel = (id: string, x: number, y: number) => {
    if (!setPanels) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return; // a NaN commit blanks 3D
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, layout: { x: Math.round(x), y: Math.round(y) } } : p)));
  };

  const resetAuto = () => {
    setSel([]);
    setPreview(null);
    setGuides(null);
    setCabinets((prev) => prev.map((c) => ({ ...c, layout: null })));
    if (setPanels) setPanels((prev) => prev.map((p) => ({ ...p, layout: null })));
  };
  const floorAll = () => {
    setCabinets((prev) => prev.map((c) => (c.layout ? { ...c, layout: { ...c.layout, y: 0 } } : c)));
    if (setPanels) setPanels((prev) => prev.map((p) => (p.layout ? { ...p, layout: { ...p.layout, y: 0 } } : p)));
  };

  if (cabinets.length === 0 && panels.length === 0)
    return (
      <div className="card p-4 anim-rise">
        <Empty title="No cabinets" sub="Add cabinets (or raw panels) to see the front elevation drawing." icon={<Layers2 size={26} />} />
      </div>
    );

  /* ---- pointer helpers: client px → viewBox coords, hit boxes, snapping ---- */
  const toView = (e: React.PointerEvent) => {
    const svgEl = (e.currentTarget as HTMLElement).querySelector("svg");
    if (!svgEl) return null;
    const r = svgEl.getBoundingClientRect();
    return {
      vx: ((e.clientX - r.left) / r.width) * vm.W,
      vy: ((e.clientY - r.top) / r.height) * vm.H,
    };
  };
  const cabAt = (vx: number, vy: number) =>
    pos.find((p) => {
      const sx = vm.left + (p.x - vm.minX) * vm.sc;
      const floorY = vm.base - p.y * vm.sc;
      const topY = floorY - p.cab.height * vm.sc;
      return vx >= sx && vx <= sx + p.cab.width * vm.sc && vy >= topY && vy <= floorY;
    });
  const panelAt = (vx: number, vy: number) => {
    // use pposMemo for hit test
    return pposMemo.find((pp) => {
      const px = vm.left + (pp.x - vm.minX) * vm.sc;
      const py = vm.base - (pp.y ?? 0) * vm.sc - pp.pn.h * vm.sc;
      return vx >= px && vx <= px + pp.pn.w * vm.sc && vy >= py && vy <= py + pp.pn.h * vm.sc;
    });
  };

  const snapDrag = (id: string, nx: number, ny: number): { x: number; y: number; g: DragGuides } => {
    const cab = cabinets.find((c) => c.id === id);
    const pn = panels.find((p) => p.id === id);
    const isPanel = !!pn && !cab;
    const width = isPanel ? pn!.w : cab?.width ?? 0;
    const height = isPanel ? pn!.h : cab?.height ?? 0;
    if (!cab && !pn) return { x: nx, y: ny, g: {} };
    const GRID = 5;
    const TH = 12 / vm.sc; // 12 px snap threshold expressed in mm
    // --- X candidates: edges of other cabinets, then the 5 mm grid ---
    const xc: { v: number; e: number; d: number }[] = [];
    pos.forEach((p) => {
      if (p.cab.id === id) return;
      [p.x, p.x + p.cab.width].forEach((e) => {
        const d1 = Math.abs(nx - e);
        if (d1 <= TH) xc.push({ v: e, e, d: d1 });
        const d2 = Math.abs(nx + width - e);
        if (d2 <= TH) xc.push({ v: e - width, e, d: d2 });
      });
    });
    // also snap to panel edges
    pposMemo.forEach((pp) => {
      if (pp.pn.id === id) return;
      [pp.x, pp.x + pp.pn.w].forEach((e) => {
        const d1 = Math.abs(nx - e);
        if (d1 <= TH) xc.push({ v: e, e, d: d1 });
        const d2 = Math.abs(nx + width - e);
        if (d2 <= TH) xc.push({ v: e - width, e, d: d2 });
      });
    });
    const gx = Math.round(nx / GRID) * GRID;
    if (Math.abs(nx - gx) <= TH) xc.push({ v: gx, e: gx, d: Math.abs(nx - gx) });
    // --- Y candidates: floor touch, stack on top, hang under, edge-align ---
    const yc: { v: number; d: number; kind: "floor" | "stack" | "under" | "edge" }[] = [];
    const tryY = (v: number, kind: "floor" | "stack" | "under" | "edge") => {
      const d = Math.abs(ny - v);
      if (d <= TH) yc.push({ v, d, kind });
    };
    tryY(0, "floor");
    pos.forEach((p) => {
      if (p.cab.id === id) return;
      tryY(p.y + p.cab.height, "stack");
      tryY(p.y - height, "under");
      tryY(p.y, "edge");
      tryY(p.y + p.cab.height - height, "edge");
    });
    pposMemo.forEach((pp) => {
      if (pp.pn.id === id) return;
      const py = pp.y ?? 0;
      tryY(py + pp.pn.h, "stack");
      tryY(py - height, "under");
      tryY(py, "edge");
      tryY(py + pp.pn.h - height, "edge");
    });
    const bx = xc.length ? xc.reduce((m, c) => (c.d < m.d ? c : m)) : null;
    const by = yc.length ? yc.reduce((m, c) => (c.d < m.d ? c : m)) : null;
    // --- one axis by intent: strong touch snaps (floor / stack / under) win,
    //     otherwise the axis with the smaller correction wins, so lifting a
    //     cabinet never yanks it sideways ---
    const strongY = by !== null && by.kind !== "edge";
    let applyX = false;
    let applyY = false;
    if (bx && by) {
      if (strongY) applyY = true;
      else if (bx.d <= by.d) applyX = true;
      else applyY = true;
    } else if (bx) applyX = true;
    else if (by) applyY = true;
    const g: DragGuides = {};
    let x = nx;
    let y = Math.max(0, ny);
    if (applyX && bx) {
      x = bx.v;
      g.vx = bx.e;
    }
    if (applyY && by) {
      y = Math.max(0, by.v);
      g.vy = by.kind === "under" ? by.v + height : by.v;
      g.label = by.kind === "floor" ? "floor" : by.kind === "stack" ? "stack" : by.kind === "under" ? "under" : undefined;
    }
    return { x, y, g };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const v = toView(e);
    if (!v) return;
    const hitCab = cabAt(v.vx, v.vy);
    const hitPan = !hitCab ? panelAt(v.vx, v.vy) : null;
    if (!hitCab && !hitPan) {
      setSel([]);
      return;
    }
    if (hitPan) {
      // panel drag – no selection logic for cabinets, but allow dragging
      drag.current = { id: hitPan.pn.id, x0: hitPan.x, y0: hitPan.y ?? 0, vx0: v.vx, vy0: v.vy, moved: false } as any;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      return;
    }
    const hit = hitCab!;
    // click = select (A first pick amber, B second pick cyan); the same press
    // also arms a drag which only starts after a 3 px move threshold
    setSel((prev) => {
      if (prev.includes(hit.cab.id)) return prev[0] === hit.cab.id && prev.length === 2 ? [prev[1]] : [];
      return prev.length >= 2 ? [hit.cab.id] : [...prev, hit.cab.id];
    });
    drag.current = { id: hit.cab.id, x0: hit.x, y0: hit.y, vx0: v.vx, vy0: v.vy, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture unsupported — drag still works while hovered */
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const v = toView(e);
    if (!v) return;
    if (!d.moved) {
      if (Math.hypot(v.vx - d.vx0, v.vy - d.vy0) < 3) return; // still a click
      d.moved = true;
    }
    const dxMm = (v.vx - d.vx0) / vm.sc;
    const dyMm = (v.vy - d.vy0) / vm.sc;
    const s = snapDrag(d.id, d.x0 + dxMm, d.y0 + dyMm);
    setPreview({ id: d.id, x: s.x, y: s.y });
    setGuides(s.g);
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      const p = previewRef.current;
      if (p && p.id === d.id) {
        const isPanel = panels.some((pp) => pp.id === p.id);
        if (isPanel) movePanel(p.id, p.x, p.y);
        else moveCab(d.id, p.x, p.y);
      }
      setPreview(null);
      setGuides(null);
    }
  };

  /* ---- keyboard: arrows nudge the first selected cabinet, Esc clears ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") {
        setSel([]);
        return;
      }
      if (!sel[0]) return;
      const p = pos.find((q) => q.cab.id === sel[0]);
      if (!p) return;
      const step = e.shiftKey ? 50 : 5;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const n = nudge[e.key];
      if (n) {
        e.preventDefault();
        moveCab(sel[0], p.x + n[0], p.y + n[1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---- stick operations: A (= sel[0]) is placed against B (= sel[1]) ---- */
  type Box = { x: number; y: number; w: number; h: number };
  const posOf = (id: string) => pos.find((p) => p.cab.id === id);
  const stickWith = (fn: (a: Box, b: Box) => { x: number; y: number }) => {
    const a = posOf(sel[0]);
    const b = posOf(sel[1]);
    if (!a || !b) return;
    const r = fn(
      { x: a.x, y: a.y, w: a.cab.width, h: a.cab.height },
      { x: b.x, y: b.y, w: b.cab.width, h: b.cab.height },
    );
    moveCab(sel[0], r.x, r.y);
  };
  const stickAbove = (a: Box, b: Box) => ({ x: Math.round(b.x + b.w / 2 - a.w / 2), y: b.y + b.h });
  const stickBelow = (a: Box, b: Box) => ({ x: Math.round(b.x + b.w / 2 - a.w / 2), y: Math.max(0, b.y - a.h) });
  const stickLeft = (a: Box, b: Box) => ({ x: b.x - a.w, y: sideLine === "bottom" ? b.y : b.y + b.h - a.h });
  const stickRight = (a: Box, b: Box) => ({ x: b.x + b.w, y: sideLine === "bottom" ? b.y : b.y + b.h - a.h });
  const stickFloor = () => {
    const p = posOf(sel[0]);
    if (p) moveCab(sel[0], Math.round(p.x / 5) * 5, 0);
  };
  const alignLR = (mode: "l" | "r") => {
    const a = posOf(sel[0]);
    if (!a) return;
    let best: CabPos | null = null;
    let bd = Infinity;
    pos.forEach((p) => {
      if (p.cab.id === a.cab.id) return;
      const overlap = Math.min(a.x + a.cab.width, p.x + p.cab.width) - Math.max(a.x, p.x);
      if (overlap <= 0) return;
      const d = Math.abs(a.x - p.x) + Math.abs(a.y - p.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    const t = best as CabPos | null;
    if (!t) return;
    moveCab(a.cab.id, mode === "l" ? t.x : t.x + t.cab.width - a.cab.width, a.y);
  };

return (
    <div className="card p-5 anim-rise">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="card-h"><Layers2 size={17} className="text-amber-400" /> 2D View — {mode === "front" ? "Front Elevation" : "Depth (Side) View"} — All Cabinets</h2>
          <p className="hint mt-1">
            {mode === "front" ? (
              <>
                Front elevation with rows, columns, doors, drawers, shelves and toe kicks. <b>Drag</b> any cabinet or <b>raw panel</b> —
                click one to select, click a second to pair, then <b>Stick</b> A on top of / below / left / right of B
                to build the real kitchen or wardrobe. Panels draggable with snap 5mm.
              </>
            ) : (
              <>
                True-depth side profile: carcass, veneer back, toe-kick recess, overlay front and cover panels drawn to scale
                (rear at LEFT · front at RIGHT). Read-only — positions are set in the Front / Plan views.
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            <Btn size="sm" variant={mode === "front" ? "ok" : "default"} onClick={() => setMode("front")} title="Front elevation (width × height)">Front</Btn>
            <Btn size="sm" variant={mode === "side" ? "ok" : "default"} onClick={() => setMode("side")} title="Depth view (depth × height) — side profile">Depth</Btn>
          </div>
          {anyLayout && <Btn size="sm" variant="danger" onClick={resetAuto}><RotateCcw size={14} /> Reset auto</Btn>}
          {anyLayout && <Btn size="sm" onClick={floorAll}>Floor all</Btn>}
          <Btn size="sm" onClick={() => downloadRaw(mode === "front" ? "front-elevation.svg" : "depth-view.svg", mode === "front" ? svg : sideSvg, "image/svg+xml")}><FileImage size={14} /> Export SVG</Btn>
          <Btn
            size="sm"
            variant="ok"
            title={mode === "front" ? "Dimensioned front elevation — floor line, per-cabinet W×H, chain dimension, overall + height dims" : "Print the depth (side) view — true depth profiles with dims"}
            onClick={() =>
              mode === "front"
                ? openPrintWindow(frontElevationHtml(cabinets, panels))
                : openPrintWindow(`<!doctype html><html><head><meta charset="utf-8"><title>Depth view</title><style>body{margin:0;padding:16px;background:#fff}</style></head><body>${sideSvg}<script>window.onload=()=>window.print()</script></body></html>`)
            }
          >
            <Ruler size={14} /> {mode === "front" ? "Elevation (print)" : "Depth (print)"}
          </Btn>
          {mode === "front" && (
            <Btn
              size="sm"
              title="Dimensioned front elevation as DXF (FLOOR / ELEVATION / DIMENSION / LABEL layers, real mm)"
              onClick={() => downloadRaw("front-elevation-dims.dxf", frontElevationDxf(cabinets, panels), "application/dxf")}
            >
              <Ruler size={14} /> Elevation (DXF)
            </Btn>
          )}
          <Btn size="sm" onClick={() => setTick((t) => t + 1)}><RotateCw size={14} /> Refresh</Btn>
        </div>
      </div>

      {overlaps.length > 0 && (
        <div className={`mt-3 rounded-lg border px-3 py-2 ${preview ? "border-amber-400/30 bg-amber-400/[0.06]" : "border-red-400/40 bg-red-500/[0.08]"}`}>
          <div className="text-[12px] font-bold flex items-center gap-2 text-amber-200">
            <AlertTriangle size={14} className="text-amber-300" />
            {preview
              ? "Overlapping — keep moving to a free spot or drop here to fix later"
              : `${overlaps.length} overlap${overlaps.length > 1 ? "s" : ""} — you must change position or dimension (or set a DIFFERENT Z in Plan View):`}
          </div>
          {overlaps.map((o, i) => (
            <div key={i} className="text-[11px] font-mono text-ink-200 mt-1">
              ⚠ {o.wa} ↔ {o.wb} · overlap {o.ow} × {o.oh}mm
            </div>
          ))}
        </div>
      )}

      {(anyLayout || pposMemo.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 items-center rounded-lg border border-cyan-400/20 bg-cyan-400/[0.05] px-3 py-2">
          <span className="text-[11.5px] text-cyan-200 font-semibold">Positions (mm):</span>
          {pos.map((p) => (
            <span key={p.cab.id} className="font-mono text-[10.5px] px-2 py-0.5 rounded bg-ink-900/60 border border-white/[0.06] inline-flex items-center gap-1">
              <span className="text-amber-300">{p.cab.name}</span>
              <PosInput label="X" value={p.x} onCommit={(n) => moveCab(p.cab.id, n, p.y)} />
              <PosInput label="Y" value={p.y} onCommit={(n) => moveCab(p.cab.id, p.x, n)} />
              <span
                className="inline-flex items-center gap-0.5"
                title="Z (depth) — read-only, taken from the Plan View. Two items at DIFFERENT Z sit on different depth planes and do NOT count as overlapping in this 2D view."
              >
                <span className="text-ink-400">Z</span>
                <span className="text-cyan-300">{p.cab.plan && Number.isFinite(p.cab.plan.z) ? p.cab.plan.z : 0}</span>
              </span>
            </span>
          ))}
          {pposMemo.map((pp) => (
            <span key={pp.pn.id} className="font-mono text-[10.5px] px-2 py-0.5 rounded bg-ink-900/60 border border-cyan-400/25 inline-flex items-center gap-1">
              <span className="text-cyan-300">{pp.pn.name}</span>
              <PosInput label="X" value={pp.x} onCommit={(n) => movePanel(pp.pn.id, n, pp.y ?? 0)} />
              <PosInput label="Y" value={pp.y ?? 0} onCommit={(n) => movePanel(pp.pn.id, pp.x, n)} />
              <span
                className="inline-flex items-center gap-0.5"
                title="Z (depth) — read-only, taken from the Plan View. Two items at DIFFERENT Z sit on different depth planes and do NOT count as overlapping in this 2D view."
              >
                <span className="text-ink-400">Z</span>
                <span className="text-cyan-300">{pp.pn.plan && Number.isFinite(pp.pn.plan.z) ? pp.pn.plan.z : 0}</span>
              </span>
            </span>
          ))}
          <span className="text-[10.5px] text-ink-400">
            drag = move · snap 5 mm · arrows nudge (Shift = 50) · <span className="text-cyan-300">Z comes from Plan View</span> — different Z = no overlap · Esc clears
          </span>
        </div>
      )}

      {mode === "front" && sel.length > 0 && (() => {
        const a = posOf(sel[0]);
        const b = sel[1] ? posOf(sel[1]) : null;
        if (!a) return null;
        return (
          <div className="mt-3 flex flex-wrap gap-2 items-center rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2">
            <span className="text-[11.5px] font-bold text-amber-300">A: {a.cab.name}</span>
            {b && <span className="text-[11.5px] font-bold text-cyan-300">B: {b.cab.name}</span>}
            {b && <Btn size="sm" onClick={() => setSel([sel[1], sel[0]])}>Swap A⇄B</Btn>}
            <Btn size="sm" onClick={stickFloor}>Floor</Btn>
            <Btn size="sm" onClick={() => alignLR("l")}>Align ⟨</Btn>
            <Btn size="sm" onClick={() => alignLR("r")}>Align ⟩</Btn>
            {b && (
              <>
                <Btn size="sm" variant="ok" onClick={() => stickWith(stickAbove)}>A on top of B ▲</Btn>
                <Btn size="sm" variant="ok" onClick={() => stickWith(stickBelow)}>A below B ▼</Btn>
                <Btn size="sm" variant="ok" onClick={() => stickWith(stickLeft)}>A left of B ⟨</Btn>
                <Btn size="sm" variant="ok" onClick={() => stickWith(stickRight)}>A right of B ⟩</Btn>
                <Btn size="sm" variant={sideLine === "top" ? "ok" : "default"} onClick={() => setSideLine(sideLine === "bottom" ? "top" : "bottom")}>
                  {sideLine === "bottom" ? "bottoms level" : "tops level"}
                </Btn>
              </>
            )}
            {!b && <span className="text-[10.5px] text-ink-400">pick a second cabinet to stick A to it</span>}
          </div>
        );
      })()}

      <div
        className={`mt-4 overflow-auto rounded-xl border border-white/[0.07] bg-[#0a0f18] p-3 ${mode === "front" ? "cursor-move select-none" : "select-none"}`}
        onPointerDown={mode === "front" ? onPointerDown : undefined}
        onPointerMove={mode === "front" ? onPointerMove : undefined}
        onPointerUp={mode === "front" ? endDrag : undefined}
        onPointerCancel={mode === "front" ? endDrag : undefined}
        style={{ touchAction: "none" }}
      >
        <div key={`${mode}-${tick}`} dangerouslySetInnerHTML={{ __html: mode === "front" ? svg : sideSvg }} />
      </div>
    </div>
  );
}

export interface SvgOpts {
  override?: { id: string; x: number; y: number } | null;
  sel?: string[];
  guides?: { vx?: number; vy?: number; label?: string } | null;
  /** cabinet ids currently overlapping another cabinet — drawn with a warning outline */
  warn?: string[];
}

export interface WarnBox {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** plan-view Z (mm). Different Z means they sit on different depth planes — no 2D overlap. */
  z?: number;
}

/** pairwise rectangle intersections (>1mm in BOTH axes) — exactly touching edges are NOT overlap.
 *  Different plan Z (from Plan View) also means no overlap. */
export function overlapBoxes(boxes: WarnBox[]) {
  const out: { a: string; b: string; wa: string; wb: string; ow: number; oh: number }[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      const zA = Number.isFinite(A.z) ? (A.z as number) : 0;
      const zB = Number.isFinite(B.z) ? (B.z as number) : 0;
      if (Math.abs(zA - zB) > 1) continue;
      const ow = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oh = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ow > 1 && oh > 1)
        out.push({ a: A.id, b: B.id, wa: A.name, wb: B.name, ow: Math.round(ow), oh: Math.round(oh) });
    }
  return out;
}

/** cabinets-only wrapper (legacy signature — tests / other importers) */
export function overlapPairs(pos: CabPos[]) {
  return overlapBoxes(pos.map((p) => ({ id: p.cab.id, name: p.cab.name, x: p.x, y: p.y, w: p.cab.width, h: p.cab.height })));
}

export function buildFrontSvg(cabs: Cabinet[], S: Settings, opts?: SvgOpts, panels: PanelItem[] = []): string {
  const pos = layoutCabs(cabs);
  // raw project panels — labeled rectangles (manual layout or auto-flow
  // after the rightmost cabinet); they extend the drawing bounds
  const ppos = panelPositions(cabs, panels);
  const extra = ppos.length
    ? { maxX: Math.max(...ppos.map((p) => p.x + p.pn.w)), maxH: Math.max(...ppos.map((p) => (p.y ?? 0) + p.pn.h)) }
    : undefined;
  // metrics are computed WITHOUT the drag override so the canvas never
  // rescales mid-drag; the override is applied only for drawing
  const { W, H, sc, base, left, minX } = viewMetrics(pos, extra);
  const draw = opts?.override
    ? pos.map((p) => (p.cab.id === opts.override!.id ? { ...p, x: opts.override!.x, y: opts.override!.y } : p))
    : pos;
  const arranged = cabs.some((c) => c.layout);

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="JetBrains Mono, monospace">`;
  out += `<defs><pattern id="kickhatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#0d1520"/><rect width="2" height="6" fill="#1b2740"/></pattern></defs>`;
  out += `<rect width="${W}" height="${H}" fill="#0a0f18"/>`;
  for (let gy = 70; gy <= H; gy += 50) out += `<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="#101a2a"/>`;
  for (let gx = 0; gx <= W; gx += 50) out += `<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="#101a2a"/>`;
  out += `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#3d5878" stroke-width="2"/>`;

  draw.forEach((p, ci) => {
    const cab = p.cab;
    const kick = hasKick(cab) ? S.kickHeight : 0;
    const x = left + (p.x - minX) * sc;
    const floor = base - p.y * sc; // this cabinet's floor line (lifted when stacked)
    const cw = cab.width * sc;
    const ch = cab.height * sc;
    const top = floor - ch;
    const g = S.doorGap * sc;
    // column indices that carry a full-height door — suppress non-full doors in
    // those columns so we don't draw one door per box.
    const fullDoorCols = new Set<number>();
    cab.rows.forEach((r) => r.columns.forEach((c, ci) => {
      if (c.door && c.door.full) fullDoorCols.add(ci);
    }));
    const selA = opts?.sel?.[0] === cab.id;
    const selB = opts?.sel?.[1] === cab.id;
    const warnOv = !!opts?.warn?.includes(cab.id);
    if (p.y > 0)
      out += `<line x1="${f(x - 12)}" y1="${f(floor)}" x2="${f(x - 12)}" y2="${f(base)}" stroke="#3d5878" stroke-width="1" stroke-dasharray="4 3"/>`;
    out += `<rect x="${f(x)}" y="${f(top)}" width="${f(cw)}" height="${f(ch)}" fill="#14202f" stroke="${warnOv ? "#fb923c" : selB ? "#22d3ee" : "#f5b33c"}" stroke-width="${warnOv ? 3 : selA || selB ? 3 : 1.6}"${warnOv ? ' stroke-dasharray="7 4"' : ""}/>`;
    if (warnOv)
      out += `<text x="${f(x + cw / 2)}" y="${f(top - 5)}" fill="#fb923c" font-size="10" text-anchor="middle" font-weight="700">⚠ overlap</text>`;
    if (selA || selB)
      out += `<rect x="${f(x + 4)}" y="${f(top + 4)}" width="18" height="18" rx="4" fill="${selA ? "#f5b33c" : "#22d3ee"}"/><text x="${f(x + 13)}" y="${f(top + 18)}" fill="#0a0f18" font-size="12" font-weight="700" text-anchor="middle">${selA ? "A" : "B"}</text>`;
    if (kick > 0) out += `<rect x="${f(x)}" y="${f(floor - kick * sc)}" width="${f(cw)}" height="${f(kick * sc)}" fill="url(#kickhatch)" stroke="#2c3c55"/>`;

    let y0 = 0;
    cab.rows.forEach((row) => {
      const rowTopY = floor - (kick + y0 + row.h) * sc;
      const rowH = row.h * sc;
      const lays = columnLayout(cab, row, S);
      lays.forEach((lay, ci) => {
        const colX = x + (S.bodyThk + lay.x) * sc;
        const colW = lay.w * sc;
        const col = lay.col;
        // suppress a non-full door if another row/box has a full door in the
        // same column index (the full door spans the whole carcass)
        const suppressed = fullDoorCols.has(ci) && col.door && !col.door.full;
        if (!lay.last) out += `<rect x="${f(colX + colW)}" y="${f(rowTopY)}" width="${f(S.bodyThk * sc)}" height="${f(rowH)}" fill="#243449" stroke="#4a6a94" stroke-width="0.8"/>`;

        // decorative MDF back panel — drawn first so drawers/doors render on top
        if (col.mdfBack) {
          out += `<rect x="${f(colX)}" y="${f(rowTopY)}" width="${f(colW)}" height="${f(rowH)}" fill="#6b4a2c" opacity="0.9"/>`;
          out += `<text x="${f(colX + colW / 2)}" y="${f(rowTopY + 12)}" fill="#e8cfa8" font-size="7.5" text-anchor="middle" opacity="0.9">MDF BACK</text>`;
        }

        if (columnHasDrawers(col)) {
          // drawers sit where the bank dictates (bottom / top / custom); shelves go in the zone left over
          const bank = drawerBank(col, row.h, S);
          let dy = bank.y;
          col.drawers.forEach((d) => {
            const fh = d.frontHeight * sc;
            const yy = floor - (kick + y0 + dy + d.frontHeight) * sc;
            const inset = Math.min((S.hiddenFrontInset || 30) * sc, colW / 3);
            if (d.hidden) {
              const fill = d.frontMdf ? "#26405d" : "#16283d";
              out += `<rect x="${f(colX + inset)}" y="${f(yy + g)}" width="${f(Math.max(4, colW - 2 * inset))}" height="${f(fh - 2 * g)}" fill="${fill}" stroke="#7ea3cc" stroke-dasharray="5 3" rx="2"/>`;
              out += `<text x="${f(colX + colW / 2)}" y="${f(yy + fh / 2 + 4)}" fill="#9dc0e4" font-size="9" text-anchor="middle">${d.frontMdf ? "INNER + MDF" : "INNER"}</text>`;
            } else if (d.frontMdf) {
              out += `<rect x="${f(colX + g)}" y="${f(yy + g)}" width="${f(colW - 2 * g)}" height="${f(fh - 2 * g)}" fill="#1d3049" stroke="#5f8fb9" rx="2"/>`;
            } else {
              out += `<rect x="${f(colX + inset)}" y="${f(yy + g)}" width="${f(Math.max(4, colW - 2 * inset))}" height="${f(fh - 2 * g)}" fill="#12202f" stroke="#456b93" stroke-dasharray="4 3" rx="2"/>`;
              out += `<text x="${f(colX + colW / 2)}" y="${f(yy + fh / 2 + 4)}" fill="#7fa0c4" font-size="8.5" text-anchor="middle">BOX</text>`;
            }
            dy += d.frontHeight;
          });

const aboveBank = col.drawerAlign !== "top";
          const shelfH = aboveBank ? row.h - bank.y - bank.h : bank.y;
          const above = col.shelves > 0 ? col.shelves : col.splitter ? col.splitterShelves ?? 0 : 0;
          if (shelfH > 20 && (col.shelves > 0 || col.splitter)) {
            const splitY = floor - (kick + y0 + (aboveBank ? bank.y + bank.h : bank.y)) * sc;
            out += `<line x1="${f(colX)}" y1="${f(splitY)}" x2="${f(colX + colW)}" y2="${f(splitY)}" stroke="#f5b33c" stroke-width="2"/>`;
            for (let k = 0; k < above; k++) {
              const sy = floor - (kick + y0 + (aboveBank ? bank.y + bank.h : 0) + (shelfH * (k + 1)) / (above + 1)) * sc;
              out += `<line x1="${f(colX + 3)}" y1="${f(sy)}" x2="${f(colX + colW - 3)}" y2="${f(sy)}" stroke="#3f6c99" stroke-dasharray="3 4"/>`;
            }
          }
          if (col.door && col.drawers.every((d) => d.hidden) && !col.door.full && !suppressed) {
            const n = col.door.type === "double" || col.door.type === "sliding" ? 2 : 1;
            const glass = col.door.material === "glass";
            for (let j = 0; j < n; j++) {
              const dw = colW / n;
              out += `<rect x="${f(colX + j * dw + g)}" y="${f(rowTopY + g)}" width="${f(dw - 2 * g)}" height="${f(rowH - 2 * g)}" fill="${glass ? "rgba(140,190,230,0.25)" : "rgba(34,54,78,0.55)"}" stroke="${glass ? "#9cc3e8" : "#7ea3cc"}" stroke-width="1.4"/>`;
              const hx = n === 2 && j === 0 ? colX + dw - g - 9 : colX + j * dw + g + 9;
              out += `<circle cx="${f(hx)}" cy="${f(rowTopY + rowH - 40)}" r="2.4" fill="#c9ccd4"/>`;
            }
            out += `<text x="${f(colX + colW / 2)}" y="${f(rowTopY + 14)}" fill="#9dc0e4" font-size="8.5" text-anchor="middle">${glass ? "GLASS DOOR" : "MDF DOOR"}</text>`;
          }
        } else if (col.fixed) {
          out += `<rect x="${f(colX + g)}" y="${f(rowTopY + g)}" width="${f(colW - 2 * g)}" height="${f(rowH - 2 * g)}" fill="#182838" stroke="#4a6a94" stroke-dasharray="6 3"/>`;
        } else if (col.door && !col.door.full && !suppressed) {
          const n = col.door.type === "double" || col.door.type === "sliding" ? 2 : 1;
          const glass = col.door.material === "glass";
          for (let j = 0; j < n; j++) {
            const dw = colW / n;
            out += `<rect x="${f(colX + j * dw + g)}" y="${f(rowTopY + g)}" width="${f(dw - 2 * g)}" height="${f(rowH - 2 * g)}" fill="${glass ? "rgba(140,190,230,0.25)" : "#22364e"}" stroke="${glass ? "#9cc3e8" : "#7ea3cc"}" stroke-width="${glass ? 2 : 1}"/>`;
            const hx = n === 2 && j === 0 ? colX + dw - g - 9 : colX + j * dw + g + 9;
            out += `<circle cx="${f(hx)}" cy="${f(rowTopY + rowH - 40)}" r="2.4" fill="#c9ccd4"/>`;
          }
          for (let k = 0; k < col.shelves; k++) {
            const sy = floor - (kick + y0 + (row.h * (k + 1)) / (col.shelves + 1)) * sc;
            out += `<line x1="${f(colX + 3)}" y1="${f(sy)}" x2="${f(colX + colW - 3)}" y2="${f(sy)}" stroke="#3f6c99" stroke-dasharray="3 4" opacity="0.7"/>`;
          }
        } else {
          out += `<rect x="${f(colX)}" y="${f(rowTopY)}" width="${f(colW)}" height="${f(rowH)}" fill="#0e1a2a" stroke="#33507a" stroke-dasharray="4 3"/>`;
          for (let k = 0; k < col.shelves; k++) {
            const sy = floor - (kick + y0 + (row.h * (k + 1)) / (col.shelves + 1)) * sc;
            out += `<line x1="${f(colX + 3)}" y1="${f(sy)}" x2="${f(colX + colW - 3)}" y2="${f(sy)}" stroke="#3f6c99" stroke-dasharray="3 4"/>`;
          }
        }

        // ---- sub-sections: stacked drawers / shelves / fixed panels ----
        const subs = col.sub ?? [];
        if (subs.length > 0) {
          const subMm = row.h / subs.length;
          subs.forEach((sub, si) => {
            const yBase = y0 + si * subMm;
            const yTop = floor - (kick + yBase + subMm) * sc;
            const hPx = subMm * sc;
            if (si > 0) {
              const dY = floor - (kick + yBase) * sc;
              out += `<line x1="${f(colX)}" y1="${f(dY)}" x2="${f(colX + colW)}" y2="${f(dY)}" stroke="#22d3ee" stroke-width="1.6"/>`;
            }
            if (sub.drawers.length > 0) {
              let sdy = 0;
              sub.drawers.forEach((sd) => {
                const dh = sd.frontHeight * sc;
                const dyTop = floor - (kick + yBase + sdy + sd.frontHeight) * sc;
                out += `<rect x="${f(colX + 6)}" y="${f(dyTop + 1)}" width="${f(colW - 12)}" height="${f(Math.max(2, dh - 2))}" fill="#1d3049" stroke="#5f8fb9" stroke-dasharray="4 2" rx="2"/>`;
                sdy += sd.frontHeight;
              });
            } else if (sub.fixed) {
              out += `<rect x="${f(colX + 4)}" y="${f(yTop + 2)}" width="${f(colW - 8)}" height="${f(Math.max(2, hPx - 4))}" fill="#182838" stroke="#4a6a94" stroke-dasharray="6 3"/>`;
            } else if (sub.shelves > 0) {
              for (let k = 0; k < sub.shelves; k++) {
                const sy = floor - (kick + yBase + (subMm * (k + 1)) / (sub.shelves + 1)) * sc;
                out += `<line x1="${f(colX + 5)}" y1="${f(sy)}" x2="${f(colX + colW - 5)}" y2="${f(sy)}" stroke="#3f6c99" stroke-dasharray="3 4"/>`;
              }
            }
          });
        }
        // ---- hanging rail (suits / dresses) ----
        const rail = col.rail ?? "off";
        if (rail !== "off") {
          const railY = (railH: number) => floor - (kick + y0 + railH) * sc;
          const drawRail = (h: number, label: string) => {
            const ry = railY(h);
            out += `<line x1="${f(colX + 6)}" y1="${f(ry)}" x2="${f(colX + colW - 6)}" y2="${f(ry)}" stroke="#d4af37" stroke-width="2.5"/>`;
            out += `<circle cx="${f(colX + 6)}" cy="${f(ry)}" r="3" fill="#d4af37"/>`;
            out += `<circle cx="${f(colX + colW - 6)}" cy="${f(ry)}" r="3" fill="#d4af37"/>`;
            out += `<text x="${f(colX + colW / 2)}" y="${f(ry - 4)}" fill="#d4af37" font-size="7.5" text-anchor="middle">${label}</text>`;
          };
          const rh = col.railHeight ?? (rail === "suits" ? S.railSuitsH : rail === "dresses" ? S.railDressesH : S.railDouble1);
          if (rail === "suits") drawRail(rh, "SUITS");
          else if (rail === "dresses") drawRail(rh, "DRESSES");
          else if (rail === "double") { drawRail(rh, "SUITS"); drawRail(S.railDouble2, "DRESSES"); }

          // shelves above the rail (auto = max count with gap ≥ railShelfMinGap, evenly spaced; manual = Y positions)
          if (col.railShelf) {
            railShelfYs(col, S, row.h).forEach((shelfY) => {
              const sy = floor - (kick + y0 + shelfY) * sc;
              out += `<line x1="${f(colX + 3)}" y1="${f(sy)}" x2="${f(colX + colW - 3)}" y2="${f(sy)}" stroke="#3f6c99" stroke-dasharray="3 4"/>`;
            });
          }
        }
      });
      y0 += row.h;
    });

    // ---- stacked boxes: draw the joint line between each pair of boxes ----
    if (stackOn(cab)) {
      const kick0 = kick;
      let cum = 0;
      stackedHeights(cab).forEach((bh, bi) => {
        cum += bi === 0 ? bh - kick0 : bh;
        if (bi < stackedHeights(cab).length - 1) {
          const jy = floor - (kick0 + cum) * sc;
          out += `<line x1="${f(x)}" y1="${f(jy)}" x2="${f(x + cw)}" y2="${f(jy)}" stroke="#0a0f18" stroke-width="3"/>`;
          out += `<line x1="${f(x)}" y1="${f(jy)}" x2="${f(x + cw)}" y2="${f(jy)}" stroke="#3d5878" stroke-width="1" stroke-dasharray="8 4"/>`;
          out += `<text x="${f(x + cw - 6)}" y="${f(jy - 5)}" fill="#6d8fae" font-size="9" text-anchor="end">box ${bi + 1} / box ${bi + 2} joint</text>`;
        }
      });
    }

    // ---- full-height doors: one long door spanning the whole carcass ----
    const fullBodyH = stackOn(cab) ? stackedHeights(cab).reduce((a, h) => a + h, 0) - kick : cab.height - kick;
    // cabinet-level full door (Boxes control) — supports mdf-left/right/double etc
    if (cab.fullDoor && cab.fullDoor !== "off") {
      const fd = cab.fullDoor as string;
      const glass = fd.startsWith("glass");
      const suffix = fd.includes("-") ? fd.split("-")[1] : "";
      const doorH = fullBodyH * sc;
      const doorTopY = floor - (kick + fullBodyH) * sc;
      const n = suffix === "double" ? 2 : suffix === "left" || suffix === "right" ? 1 : (cab.width > 620 ? 2 : 1);
      for (let j=0;j<n;j++) {
        const dw = cw / n;
        out += `<rect x="${f(x + j*dw + g)}" y="${f(doorTopY + g)}" width="${f(dw - 2*g)}" height="${f(doorH - 2*g)}" fill="${glass ? "rgba(140,190,230,0.25)" : "#22364e"}" stroke="${glass ? "#9cc3e8" : "#7ea3cc"}" stroke-width="${glass ? 2 : 1.4}"/>`;
        [doorTopY + doorH*0.2, doorTopY + doorH*0.8].forEach((cy)=> {
          const hx = n===2 && j===0 ? x + dw - g - 9 : x + j*dw + g + 9;
          out += `<circle cx="${f(hx)}" cy="${f(cy)}" r="2.4" fill="#c9ccd4"/>`;
        });
      }
      out += `<text x="${f(x + cw/2)}" y="${f(doorTopY+16)}" fill="#9dc0e4" font-size="9" text-anchor="middle">${glass ? "GLASS / ALU · FULL CABINET" : "FULL-CABINET DOOR"}</text>`;
    } else {
      cab.rows.forEach((row) => {
        const lays = columnLayout(cab, row, S);
        lays.forEach((lay) => {
          const col = lay.col;
          if (!col.door?.full || col.fixed) return;
          if (columnHasDrawers(col) && !col.drawers.every((d) => d.hidden)) return;
          const colX = x + (S.bodyThk + lay.x) * sc;
          const colW = lay.w * sc;
          const n = col.door.type === "double" || col.door.type === "sliding" ? 2 : 1;
          const glass = col.door.material === "glass";
          const doorH = fullBodyH * sc;
          const doorTopY = floor - (kick + fullBodyH) * sc;
          for (let j = 0; j < n; j++) {
            const dw = colW / n;
            out += `<rect x="${f(colX + j * dw + g)}" y="${f(doorTopY + g)}" width="${f(dw - 2 * g)}" height="${f(doorH - 2 * g)}" fill="${glass ? "rgba(140,190,230,0.25)" : "#22364e"}" stroke="${glass ? "#9cc3e8" : "#7ea3cc"}" stroke-width="${glass ? 2 : 1.4}"/>`;
            [doorTopY + doorH * 0.2, doorTopY + doorH * 0.8].forEach((cy) => {
              const hx = n === 2 && j === 0 ? colX + dw - g - 9 : colX + j * dw + g + 9;
              out += `<circle cx="${f(hx)}" cy="${f(cy)}" r="2.4" fill="#c9ccd4"/>`;
            });
          }
          out += `<text x="${f(colX + colW / 2)}" y="${f(doorTopY + 16)}" fill="#9dc0e4" font-size="9" text-anchor="middle">${glass ? "GLASS / ALU · FULL HEIGHT" : "FULL-HEIGHT DOOR"}</text>`;
        });
      });
    }

    // ---- cover panels (L / R only in the FRONT view) ----
    // Top/Bottom covers are horizontal panels (width × DEEP) — they are NOT
    // visible in a front elevation, so they are not drawn here (they still
    // appear in 3D, the cut list, nesting and DXF).
    (cab.covers ?? []).forEach((cv) => {
      if (cv.side !== "L" && cv.side !== "R") return;
      const label = cv.side === "L" ? "L" : "R";
      // thk 0 = auto (ply 16.5 / MDF 19) — same rule as the model
      const cvThk = cv.thk > 0 ? cv.thk : cv.mat === "plywood" ? S.bodyThk : S.mdfThk;
      const pthk = Math.max(2, cvThk * sc);
      const finish = cv.finish ?? "white";
      const mdf = cv.mat !== "plywood";
      const fill = mdf ? (finish === "oak" ? "#6b4a2c" : "#3a4f6a") : "#5a4a36";
      const stroke = mdf ? (finish === "oak" ? "#a97b48" : "#6b8bb0") : "#8a7a5a";
      if (cv.side === "L") {
        out += `<rect x="${f(x - pthk)}" y="${f(top)}" width="${f(pthk)}" height="${f(ch)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
        out += `<text x="${f(x - pthk / 2)}" y="${f(top + 12)}" fill="${stroke}" font-size="7" text-anchor="middle" transform="rotate(-90,${f(x - pthk / 2)},${f(top + 12)})">COVER ${label} ${Math.round(cv.w)}×${Math.round(cv.h)}</text>`;
      } else {
        out += `<rect x="${f(x + cw)}" y="${f(top)}" width="${f(pthk)}" height="${f(ch)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
        out += `<text x="${f(x + cw + pthk / 2)}" y="${f(top + 12)}" fill="${stroke}" font-size="7" text-anchor="middle" transform="rotate(-90,${f(x + cw + pthk / 2)},${f(top + 12)})">COVER ${label} ${Math.round(cv.w)}×${Math.round(cv.h)}</text>`;
      }
    });

    out += `<text x="${f(x + cw / 2)}" y="${f(top - 26)}" fill="#f5b33c" font-size="13" font-weight="700" text-anchor="middle">${esc(cab.name)}${cab.qty > 1 ? ` ×${cab.qty}` : ""}</text>`;
    out += `<text x="${f(x + cw / 2)}" y="${f(top - 10)}" fill="#6d7f96" font-size="10" text-anchor="middle">${cab.width}×${cab.height}×${cab.depth}${cab.isKitchen ? " · K" : ""}${cab.type === "L" || cab.type === "C" ? ` · ${cab.type}-notch` : ""}</text>`;
    out += dim(x, floor + 34, x + cw, floor + 34, `${cab.width}`, "#f5b33c");
    if (!arranged && ci === pos.length - 1) out += dim(x + 26, floor, x + 26, top, `${cab.height}`, "#7dd3fc", "v");
  });
  const gu = opts?.guides;
  if (gu) {
    if (gu.vx !== undefined)
      out += `<line x1="${f(left + (gu.vx - minX) * sc)}" y1="40" x2="${f(left + (gu.vx - minX) * sc)}" y2="${f(base)}" stroke="#f5b33c" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.85"/>`;
    if (gu.vy !== undefined) {
      const gy = base - gu.vy * sc;
      out += `<line x1="30" y1="${f(gy)}" x2="${f(W - 30)}" y2="${f(gy)}" stroke="#22d3ee" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.85"/>`;
      if (gu.label) out += `<text x="${f(W - 34)}" y="${f(gy - 6)}" fill="#22d3ee" font-size="11" text-anchor="end">${gu.label}</text>`;
    }
  }
  // raw project panels — cyan dashed labeled rectangles on the floor row
  ppos.forEach(({ pn, x, y }) => {
    const pw = pn.w * sc;
    const ph = pn.h * sc;
    const px = left + (x - minX) * sc;
    const py = base - (y + pn.h) * sc;
    const thk = pn.thk > 0 ? pn.thk : pn.material === "plywood" ? S.bodyThk : pn.material === "back" ? S.backThk : S.mdfThk;
    const fill =
      pn.material === "mdf" ? (pn.finish === "oak" ? "#4a3620" : "#2c3f58") : pn.material === "back" ? "#33402f" : "#5a4a36";
    const warnPn = !!opts?.warn?.includes(pn.id);
    out += `<rect x="${f(px)}" y="${f(py)}" width="${f(pw)}" height="${f(ph)}" rx="2" fill="${fill}" stroke="${warnPn ? "#fb923c" : "#22d3ee"}" stroke-width="${warnPn ? 2.5 : 1.5}" stroke-dasharray="7 4"/>`;
    if (warnPn)
      out += `<text x="${f(px + pw / 2)}" y="${f(py - 22)}" fill="#fb923c" font-size="10" text-anchor="middle" font-weight="700">⚠ overlap</text>`;
    out += `<text x="${f(px + pw / 2)}" y="${f(py - 8)}" fill="${warnPn ? "#fb923c" : "#22d3ee"}" font-size="11" font-weight="700" text-anchor="middle">${esc(pn.name)}</text>`;
    out += `<text x="${f(px + pw / 2)}" y="${f(py + ph / 2 + 4)}" fill="#bfe8f7" font-size="10" text-anchor="middle">${Math.round(pn.w)}×${Math.round(pn.h)}×${thk}</text>`;
  });
  out += "</svg>";
  return out;

function dim(x1: number, y1: number, x2: number, y2: number, label: string, color: string, o: "h" | "v" = "h") {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    let s = `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}"/>`;
    if (o === "h") {
      s += `<line x1="${f(x1)}" y1="${f(y1 - 6)}" x2="${f(x1)}" y2="${f(y1 + 6)}" stroke="${color}"/><line x1="${f(x2)}" y1="${f(y2 - 6)}" x2="${f(x2)}" y2="${f(y2 + 6)}" stroke="${color}"/>`;
      s += `<text x="${f(mx)}" y="${f(my - 6)}" fill="${color}" font-size="12" text-anchor="middle">${label}</text>`;
    } else {
      s += `<line x1="${f(x1 - 6)}" y1="${f(y1)}" x2="${f(x1 + 6)}" y2="${f(y1)}" stroke="${color}"/><line x1="${f(x2 - 6)}" y1="${f(y2)}" x2="${f(x2 + 6)}" y2="${f(y2)}" stroke="${color}"/>`;
      s += `<text x="${f(mx + 8)}" y="${f(my)}" fill="${color}" font-size="12" transform="rotate(90 ${f(mx + 8)} ${f(my)})">${label}</text>`;
    }
    return s;
  }
}

/**
 * DEPTH (side) view — every cabinet drawn in true depth profile.
 * Horizontal axis = depth (rear at LEFT, front at RIGHT), vertical = height.
 * Shows: carcass, veneer back, toe-kick recess, overlay front (door/drawer
 * plane), stacked-box joints and cover panels (L cover = the side you see).
 * Raw panels are edge-on slabs (thk × h). Read-only — positions come from the
 * front view / plan view.
 */
export function buildSideSvg(cabs: Cabinet[], S: Settings, panels: PanelItem[] = []): string {
  const pos = layoutCabs(cabs).filter((p) => Number.isFinite(p.cab.depth) && p.cab.depth > 0);
  const ppos = panelPositions(cabs, panels);
  const thkOf = (pn: PanelItem) =>
    (Number.isFinite(pn.thk) && pn.thk > 0 ? pn.thk : pn.material === "mdf" ? S.mdfThk : pn.material === "back" ? S.backThk : S.bodyThk);

  // metrics — horizontal extent = depths (cabinets) + panel thicknesses
  const W = 1400, H = 720, padL = 110, padR = 130, padT = 96, padB = 110;
  const minXRaw = Math.min(...pos.map((p) => p.x), ...ppos.map((p) => p.x), 0);
  const maxXRaw = Math.max(...pos.map((p) => p.x + p.cab.depth), ...ppos.map((p) => p.x + thkOf(p.pn)), 1);
  const maxHRaw = Math.max(...pos.map((p) => p.y + p.cab.height), ...ppos.map((p) => (p.y ?? 0) + p.pn.h), 1);
  const minX = Number.isFinite(minXRaw) ? minXRaw : 0;
  const maxX = Number.isFinite(maxXRaw) ? maxXRaw : 1000;
  const maxH = Number.isFinite(maxHRaw) ? maxHRaw : 1000;
  const totalW = Math.max(1, maxX - minX);
  const sc = Math.min((W - padL - padR) / totalW, (H - padT - padB) / maxH);
  const base = H - padB;
  const left = padL + (W - padL - padR - totalW * sc) / 2;

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="JetBrains Mono, monospace">`;
  out += `<defs><pattern id="kickhatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#0d1520"/><rect width="2" height="6" fill="#1b2740"/></pattern></defs>`;
  out += `<rect width="${W}" height="${H}" fill="#0a0f18"/>`;
  for (let gy = 70; gy <= H; gy += 50) out += `<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="#101a2a"/>`;
  for (let gx = 0; gx <= W; gx += 50) out += `<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="#101a2a"/>`;
  out += `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#3d5878" stroke-width="2"/>`;
  out += `<text x="${W / 2}" y="26" fill="#9dc0e4" font-size="15" font-weight="700" text-anchor="middle">DEPTH (SIDE) VIEW — rear at LEFT · front at RIGHT · true depth</text>`;
  out += `<text x="${W / 2}" y="44" fill="#5f7a98" font-size="10" text-anchor="middle">left side viewed · kick recess, veneer back, overlay front and covers shown to scale</text>`;

  pos.forEach((p, ci) => {
    const cab = p.cab;
    const kick = hasKick(cab, S) ? S.kickHeight : 0;
    const D = cab.depth;
    const Hc = cab.height;
    const frontThk = cab.hasFronts !== false ? S.mdfThk : 0;
    const bodyD = Math.max(20, D - frontThk);
    const x = left + (p.x - minX) * sc;
    const floor = base - p.y * sc;
    const top = floor - Hc * sc;
    const dw = D * sc;
    const bodyW = bodyD * sc;

    // silhouette (carcass) — amber outline like the front view
    out += `<rect x="${f(x)}" y="${f(top)}" width="${f(dw)}" height="${f(Hc * sc)}" fill="#14202f" stroke="#f5b33c" stroke-width="1.6"/>`;
    // veneer back at the rear
    if (cab.hasBack !== false)
      out += `<rect x="${f(x)}" y="${f(top)}" width="${f(S.backThk * sc)}" height="${f((Hc - kick) * sc)}" fill="#0c141f" stroke="#3d5878" stroke-width="0.7"/>`;
    // overlay front plane (door / drawer faces)
    if (frontThk > 0) {
      out += `<rect x="${f(x + bodyW)}" y="${f(top)}" width="${f(frontThk * sc)}" height="${f((Hc - kick) * sc)}" fill="#22364e" stroke="#7ea3cc" stroke-width="1"/>`;
      const full = cab.fullDoor && cab.fullDoor !== "off";
      out += `<text x="${f(x + dw + 6)}" y="${f(top + (Hc - kick) * sc * 0.4)}" fill="#9dc0e4" font-size="7.5" transform="rotate(-90 ${f(x + dw + 6)} ${f(top + (Hc - kick) * sc * 0.4)})" text-anchor="middle">${full ? (String(cab.fullDoor).startsWith("glass") ? "GLASS" : "FULL DOOR") : "FRONTS"}</text>`;
    }
    // toe kick recess: board face kickDepth behind the carcass front
    if (kick > 0) {
      const kbW = Math.max(0, bodyW - (S.kickDepth + frontThk) * sc);
      out += `<rect x="${f(x)}" y="${f(floor - kick * sc)}" width="${f(kbW)}" height="${f(kick * sc)}" fill="url(#kickhatch)" stroke="#2c3c55"/>`;
      out += `<rect x="${f(x + kbW)}" y="${f(floor - kick * sc)}" width="${f(frontThk * sc)}" height="${f(kick * sc)}" fill="none" stroke="#5f7a98" stroke-width="0.7" stroke-dasharray="3 3"/>`;
    }
    // stacked boxes: joint line
    if (stackOn(cab)) {
      let cum = kick;
      stackedHeights(cab).forEach((bh, bi) => {
        cum += bh;
        if (bi < stackedHeights(cab).length - 1) {
          const jy = floor - cum * sc;
          out += `<line x1="${f(x)}" y1="${f(jy)}" x2="${f(x + dw)}" y2="${f(jy)}" stroke="#3d5878" stroke-width="1" stroke-dasharray="8 4"/>`;
        }
      });
    }

    // cover panels
    (cab.covers ?? []).forEach((cv) => {
      const cvThk = Number.isFinite(cv.thk) && cv.thk > 0 ? cv.thk : cv.mat === "mdf" ? S.mdfThk : S.bodyThk;
      const fill = cv.mat === "mdf" ? (cv.finish === "oak" ? "#6b4a2c" : "#3a4f6a") : "#5a4a36";
      const stroke = cv.mat === "mdf" ? (cv.finish === "oak" ? "#a97b48" : "#6b8bb0") : "#8a7a5a";
      if (cv.side === "L") {
        // the side we are looking at — the cover IS the silhouette
        out += `<rect x="${f(x)}" y="${f(top)}" width="${f(dw)}" height="${f(Hc * sc)}" fill="${fill}" opacity="0.28"/>`;
        out += `<rect x="${f(x - cvThk * sc)}" y="${f(floor - Math.min(cv.h, Hc) * sc)}" width="${f(Math.max(0.8, cvThk * sc))}" height="${f(Math.min(cv.h, Hc) * sc)}" fill="${fill}" stroke="${stroke}"/>`;
      } else if (cv.side === "R") {
        out += `<rect x="${f(x)}" y="${f(top)}" width="${f(dw)}" height="${f(Hc * sc)}" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="6 4"/>`;
      } else if (cv.side === "T") {
        out += `<rect x="${f(x)}" y="${f(top - cvThk * sc)}" width="${f(dw)}" height="${f(cvThk * sc)}" fill="${fill}" stroke="${stroke}"/>`;
        out += `<text x="${f(x + dw / 2)}" y="${f(top - cvThk * sc - 5)}" fill="${stroke}" font-size="7.5" text-anchor="middle">COVER TOP ${Math.round(cv.w)}×${Math.round(cv.h)}</text>`;
      } else {
        const by = floor + kick * sc;
        out += `<rect x="${f(x)}" y="${f(by)}" width="${f(dw)}" height="${f(cvThk * sc)}" fill="${fill}" stroke="${stroke}"/>`;
        out += `<text x="${f(x + dw / 2)}" y="${f(by + cvThk * sc + 11)}" fill="${stroke}" font-size="7.5" text-anchor="middle">COVER BOTTOM ${Math.round(cv.w)}×${Math.round(cv.h)}</text>`;
        out += `<line x1="${f(x)}" y1="${f(by + cvThk * sc)}" x2="${f(x + dw)}" y2="${f(by + cvThk * sc)}" stroke="#3d5878" stroke-width="1" stroke-dasharray="4 3"/>`;
      }
    });

    // labels + dims
    out += `<text x="${f(x + dw / 2)}" y="${f(top - 26)}" fill="#f5b33c" font-size="13" font-weight="700" text-anchor="middle">${esc(cab.name)}${cab.qty > 1 ? ` ×${cab.qty}` : ""}</text>`;
    out += `<text x="${f(x + dw / 2)}" y="${f(top - 10)}" fill="#6d7f96" font-size="10" text-anchor="middle">D ${Math.round(D)} × H ${Math.round(Hc)} · W ${Math.round(cab.width)}</text>`;
    out += dim(x, floor + 34, x + dw, floor + 34, `${Math.round(D)}`, "#f5b33c");
    if (ci === pos.length - 1) out += dim(x + 26, floor, x + 26, top, `${Math.round(Hc)}`, "#7dd3fc", "v");
  });

  // raw panels — edge-on slabs (thk × h), dashed cyan
  ppos.forEach(({ pn, x, y }) => {
    const t = thkOf(pn);
    const px = left + (x - minX) * sc;
    const py = base - ((y ?? 0) + pn.h) * sc;
    const pw = Math.max(1.2, t * sc);
    const fill = pn.material === "mdf" ? (pn.finish === "oak" ? "#4a3620" : "#2c3f58") : pn.material === "back" ? "#33402f" : "#5a4a36";
    out += `<rect x="${f(px)}" y="${f(py)}" width="${f(pw)}" height="${f(pn.h * sc)}" rx="1" fill="${fill}" stroke="#22d3ee" stroke-width="1.4" stroke-dasharray="5 3"/>`;
    out += `<text x="${f(px + pw / 2)}" y="${f(py - 8)}" fill="#22d3ee" font-size="10" font-weight="700" text-anchor="middle">${esc(pn.name)}</text>`;
    out += `<text x="${f(px + pw / 2)}" y="${f(py + pn.h * sc / 2 + 4)}" fill="#bfe8f7" font-size="9" transform="rotate(-90 ${f(px + pw / 2)} ${f(py + pn.h * sc / 2 + 4)})" text-anchor="middle">${t} × ${Math.round(pn.h)}</text>`;
  });

  out += "</svg>";
  return out;

  function dim(x1: number, y1: number, x2: number, y2: number, label: string, color: string, o: "h" | "v" = "h") {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    let s = `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}"/>`;
    if (o === "h") {
      s += `<line x1="${f(x1)}" y1="${f(y1 - 6)}" x2="${f(x1)}" y2="${f(y1 + 6)}" stroke="${color}"/><line x1="${f(x2)}" y1="${f(y2 - 6)}" x2="${f(x2)}" y2="${f(y2 + 6)}" stroke="${color}"/>`;
      s += `<text x="${f(mx)}" y="${f(my - 6)}" fill="${color}" font-size="12" text-anchor="middle">${label}</text>`;
    } else {
      s += `<line x1="${f(x1 - 6)}" y1="${f(y1)}" x2="${f(x1 + 6)}" y2="${f(y1)}" stroke="${color}"/><line x1="${f(x2 - 6)}" y1="${f(y2)}" x2="${f(x2 + 6)}" y2="${f(y2)}" stroke="${color}"/>`;
      s += `<text x="${f(mx + 8)}" y="${f(my)}" fill="${color}" font-size="12" transform="rotate(90 ${f(mx + 8)} ${f(my)})">${label}</text>`;
    }
    return s;
  }
}

const f = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));