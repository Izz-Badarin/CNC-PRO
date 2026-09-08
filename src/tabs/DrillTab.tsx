import { useMemo, useRef, useState } from "react";
import { CornerUpRight, Crosshair, FileSpreadsheet, Move, Plus, Minus, RotateCcw, RotateCw } from "lucide-react";
import type { Cabinet, HoleKind, Part, Settings } from "../types";
import { HOLE_COLOR, MATERIAL_LABEL } from "../types";
import { allParts, drillOps } from "../lib/model";
import { download, drillingCsv } from "../lib/export";
import { Btn, Chip, Empty, Stat } from "../components/ui";
import { useDebounced } from "../lib/useDebounced";

export function DrillTab({ cabinets, settings }: { cabinets: Cabinet[]; settings: Settings }) {
  const dCabinets = useDebounced(cabinets, 180);
  const dSettings = useDebounced(settings, 180);
  const parts = useMemo(() => allParts(dCabinets, dSettings).filter((p) => p.holes.length > 0 || p.grooves.length > 0), [dCabinets, dSettings]);
  const ops = useMemo(() => drillOps(dCabinets, dSettings), [dCabinets, dSettings]);
  const [sel, setSel] = useState(0);
  /** selection by part identity — editing cabinets reorders the list but the
   * preview keeps showing the SAME part (index is only a keyboard-nav fallback). */
  const [selKey, setSelKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dimMode, setDimMode] = useState<"chain" | "datum">("datum");
  const [grid32, setGrid32] = useState(false);
  /** hidden hole kinds in the preview (filters rebuild the dimension chains) */
  const [hide, setHide] = useState<HoleKind[]>([]);
  const [showGrooves, setShowGrooves] = useState(true);
  const partKey = (p: Part) => `${p.cabId}|${p.cabName}|${p.name}`;

  if (cabinets.length === 0) {
    return (
      <div className="card p-4 anim-rise">
        <Empty title="No drilling data" sub="Drilling operations appear once cabinets exist: 32mm shelf pins, hinge cups, slide holes and drawer grooves." icon={<Crosshair size={26} />} />
      </div>
    );
  }

  const holeOps = ops.filter((o) => o.x >= 0);
  const count = (k: HoleKind) => holeOps.filter((o) => o.type === k).length;
  const needle = q.trim().toLowerCase();
  const drilledParts = needle
    ? parts.filter((p) => `${p.cabName} ${p.name}`.toLowerCase().includes(needle))
    : parts;
  const idxByKey = drilledParts.findIndex((p) => partKey(p) === selKey);
  const cur: Part | null =
    (idxByKey >= 0 ? drilledParts[idxByKey] : null) ?? drilledParts[Math.min(sel, drilledParts.length - 1)] ?? null;
  const curIdx = cur ? drilledParts.indexOf(cur) : -1;
  const selectIdx = (i: number) => {
    const p = drilledParts[Math.max(0, Math.min(i, drilledParts.length - 1))];
    if (p) {
      setSel(drilledParts.indexOf(p));
      setSelKey(partKey(p));
    }
  };
  /** filtered view of the current part (hidden kinds + grooves off) */
  const curShown: Part | null = cur
    ? { ...cur, holes: cur.holes.filter((h) => !hide.includes(h.kind)), grooves: showGrooves ? cur.grooves : [] }
    : null;

  const toggleHide = (k: HoleKind) => setHide((hs) => (hs.includes(k) ? hs.filter((x) => x !== k) : [...hs, k]));
  const kindsPresent = (cur?.holes.map((h) => h.kind) ?? []) as HoleKind[];
  /** L/R mirroring hint — slide-hole patterns are mirrored between the pair */
  const sideHint = (() => {
    if (!cur || !cur.holes.some((h) => h.kind === "slide")) return null;
    if (/left|\bL\b|panel L/i.test(cur.name)) return "LEFT panel — drill as shown · RIGHT is mirrored";
    if (/right|\bR\b|panel R/i.test(cur.name)) return "RIGHT panel — drill as shown · LEFT is mirrored";
    return "L/R pair — the opposite panel is mirrored";
  })();

  return (
    <div className="card p-5 anim-rise">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="card-h"><Crosshair size={17} className="text-amber-400" /> Drilling Operations</h2>
          <p className="hint mt-1">
            Shelf pins Ø{settings.holeDiameter}mm ({settings.shelfHolesPerSide}/side at {settings.shelfHoleCenter}mm offset) · drawer slide
            patterns on mirrored L/R sides · {settings.grooveWidth}mm drawer grooves · {settings.slotWidth}mm linear slots. Datum
            dimensions measure every hole from the panel edges — hover a hole for its exact position.
          </p>
        </div>
        <Btn size="sm" onClick={() => download("drilling.csv", drillingCsv(cabinets, settings), "text/csv")}>
          <FileSpreadsheet size={14} /> Drilling CSV ({holeOps.length} rows)
        </Btn>
      </div>

      <div className="flex gap-2.5 mt-4 flex-wrap">
        <Stat label="Total holes" value={String(holeOps.length)} tone="#f5b33c" />
        <Stat label="Shelf pins" value={String(count("shelf"))} tone="#f5b33c" />
        <Stat label="Slide holes" value={String(count("slide"))} tone="#38bdf8" />
        <Stat label="Grooves" value={String(ops.filter((o) => o.type === "groove").length)} tone="#f0abfc" />
      </div>

      <div
        className="grid gap-5 mt-6 xl:grid-cols-[2fr_3fr] outline-none"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            selectIdx(curIdx + 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectIdx(curIdx - 1);
          }
        }}
      >
        <div className="min-w-0">
          <input
            className="inp !py-1.5 text-[12px] mb-2"
            placeholder="Search parts… (cabinet or part name)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
          <table className="tbl w-full min-w-[520px]">
            <thead className="bg-ink-900/80">
              <tr>
                <th>Part</th><th>Material</th><th className="!text-right">Size</th>
                <th className="!text-right text-amber-300">Pins</th>
                <th className="!text-right text-sky-300">Slide</th>
                <th className="!text-right">Groove</th><th className="!text-right">Qty</th>
              </tr>
            </thead>
            <tbody
              className="bg-ink-850/60"
              onClick={(e) => {
                const tr = (e.target as HTMLElement).closest("tr[data-i]") as HTMLElement | null;
                if (tr) selectIdx(parseInt(tr.dataset.i!, 10));
              }}
            >
              {drilledParts.map((p, i) => (
                <tr key={p.cabId + p.name + i} data-i={i} className={`cursor-pointer ${i === curIdx ? "bg-amber-400/[0.07]" : ""}`}>
                  <td>
                    <span className="text-ink-300">{p.cabName} · </span>
                    {p.name}
                  </td>
                  <td className="text-ink-300">{MATERIAL_LABEL[p.material]} {p.thickness}</td>
                  <td className="!text-right font-mono">{p.w}×{p.h}</td>
                  <td className="!text-right font-mono text-amber-300">{p.holes.filter((h) => h.kind === "shelf").length || "—"}</td>
                  <td className="!text-right font-mono text-sky-300">{p.holes.filter((h) => h.kind === "slide").length || "—"}</td>
                  <td className="!text-right font-mono text-fuchsia-300">{p.grooves.length || "—"}</td>
                  <td className="!text-right font-mono text-amber-300">{p.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {drilledParts.length === 0 && (
            <p className="hint mt-2">No parts match “{q}”.</p>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#0a0f18] p-4 h-fit min-w-0">
          <div className="text-[11px] text-ink-300 font-mono mb-2">
            {cur ? `${cur.cabName} · ${cur.name} — ${cur.w}×${cur.h}` : "select a part"}
          </div>
          {sideHint && (
            <div className="mb-2 rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-amber-100">
              {sideHint}
            </div>
          )}
          {cur && (cur.holes.some((h) => h.kind === "slide") || /drawer/i.test(cur.name)) && (
            <div className="mb-2 rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2.5 py-1.5 text-[11px] leading-relaxed text-sky-100/90">
              <Crosshair size={10} className="mr-1 inline -mt-0.5" />
              <b>The drawer is laid out from bottom to top</b> — Y offsets are measured from the panel <b>bottom (0)</b> upward, X from the <b>front edge</b>. Slide-hole Ø{settings.slideHoleDiameter}mm · pattern by slide depth (mm from front):
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                {Object.entries(settings.slideHolePatterns ?? {}).map(([depth, pat]) => (
                  <span key={depth} className="font-mono text-[10.5px]">
                    <b className="text-sky-300">{depth}cm</b> → {pat.join(", ")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {cur && <PartDrillPreview part={curShown!} dimMode={dimMode} grid32={grid32} />}
          {cur && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="text-[10.5px] text-ink-400">Dims:</span>
              <Seg options={[{ v: "datum", l: "From datum" }, { v: "chain", l: "Chain" }]} value={dimMode} onChange={(v) => setDimMode(v as "chain" | "datum")} />
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-ink-300" title="Overlay a 32mm system grid (shelf-pin columns)">
                <input type="checkbox" className="chk !h-3 !w-3" checked={grid32} onChange={(e) => setGrid32(e.target.checked)} />
                32mm grid
              </label>
            </div>
          )}
          {cur && kindsPresent.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[10.5px] text-ink-400">Show:</span>
              {[...new Set(kindsPresent)].map((k) => (
                <button
                  key={k}
                  onClick={() => toggleHide(k)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10.5px] ${hide.includes(k) ? "border-white/10 text-ink-500 line-through" : "border-white/20 text-ink-200"}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: HOLE_COLOR[k] }} /> {k}
                </button>
              ))}
              {cur.grooves.length > 0 && (
                <button
                  onClick={() => setShowGrooves((s) => !s)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10.5px] ${!showGrooves ? "border-white/10 text-ink-500 line-through" : "border-white/20 text-ink-200"}`}
                >
                  <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> groove
                </button>
              )}
            </div>
          )}
          <div className="flex gap-3 mt-2 flex-wrap">
            {(Object.keys(HOLE_COLOR) as HoleKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-ink-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: HOLE_COLOR[k] }} /> {k}
              </span>
            ))}
            <Chip tone="slate">groove — line</Chip>
          </div>
        </div>
      </div>
    </div>
  );
}

const r2 = (n: number) => (Math.round(n * 10) / 10).toString();

/** small segmented control (same style as EditTab) */
function Seg({ options, value, onChange }: { options: { v: string; l: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-600/70 bg-ink-900/90 p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${value === o.v ? "bg-amber-400 text-ink-950 font-semibold" : "text-ink-300 hover:text-ink-100"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

const DIM_COLOR = "#5c7291";

/** uppercase letters for dim symbols — wraps to "A1" style past Z */
const symLetter = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");

/** horizontal dimension line with extension lines + arrowheads + centered symbol letter */
function HDim({ x1, x2, y, frame, sym }: { x1: number; x2: number; y: number; frame: number; sym: string }) {
  const a = Math.min(x1, x2);
  const b = Math.max(x1, x2);
  const mid = (a + b) / 2;
  const t = 3;
  return (
    <g stroke={DIM_COLOR} strokeWidth="0.9" fill="none">
      <line x1={a} y1={frame} x2={a} y2={y} />
      <line x1={b} y1={frame} x2={b} y2={y} />
      <line x1={a} y1={y - t} x2={a} y2={y + t} />
      <line x1={b} y1={y - t} x2={b} y2={y + t} />
      <line x1={a} y1={y} x2={b} y2={y} />
      <path d={`M ${a} ${y} L ${a + 6} ${y - 3} M ${a} ${y} L ${a + 6} ${y + 3}`} />
      <path d={`M ${b} ${y} L ${b - 6} ${y - 3} M ${b} ${y} L ${b - 6} ${y + 3}`} />
      <circle cx={mid} cy={y} r={5.5} fill="#0a0f18" stroke={DIM_COLOR} strokeWidth="0.9" />
      <text x={mid} y={y + 3} fill="#a9bddb" fontSize="8.5" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
        {sym}
      </text>
    </g>
  );
}

/** vertical dimension line with extension lines + arrowheads + centered symbol letter */
function VDim({ y1, y2, x, frame, sym }: { y1: number; y2: number; x: number; frame: number; sym: string }) {
  const a = Math.min(y1, y2);
  const b = Math.max(y1, y2);
  const mid = (a + b) / 2;
  const t = 3;
  return (
    <g stroke={DIM_COLOR} strokeWidth="0.9" fill="none">
      <line x1={frame} y1={a} x2={x} y2={a} />
      <line x1={frame} y1={b} x2={x} y2={b} />
      <line x1={x - t} y1={a} x2={x + t} y2={a} />
      <line x1={x - t} y1={b} x2={x + t} y2={b} />
      <line x1={x} y1={a} x2={x} y2={b} />
      <path d={`M ${x} ${a} L ${x - 3} ${a + 6} M ${x} ${a} L ${x + 3} ${a + 6}`} />
      <path d={`M ${x} ${b} L ${x - 3} ${b - 6} M ${x} ${b} L ${x + 3} ${b - 6}`} />
      <circle cx={x} cy={mid} r={5.5} fill="#0a0f18" stroke={DIM_COLOR} strokeWidth="0.9" />
      <text x={x} y={mid + 3} fill="#a9bddb" fontSize="8.5" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
        {sym}
      </text>
    </g>
  );
}

function PartDrillPreview({ part, dimMode, grid32 }: { part: Part; dimMode: "chain" | "datum"; grid32: boolean }) {
  const [rot, setRot] = useState(0); // viewing rotation: 0 / 90 / 180 / 270 degrees
  const [hover, setHover] = useState<{ X: number; Y: number; kind: string; dia: number } | null>(null);
  const vw = 360;
  const vh = 360;
  const leftBand = 60; // cleared space on the left for vertical dims + key
  const bottomBand = 56; // cleared space on the bottom for horizontal dims
  const top = 16;
  const right = 14;

  const ox = leftBand;
  const oy = top;
  // rotation is only for VIEWING — the part keeps its real w×h; we rotate the
  // coordinate frame in 90° steps (0/90/180/270) so any panel can be inspected
  // at any angle. CW formulas (x,y) real → (X,Y) rotated:
  //   90°  → (y, w-x)   180° → (w-x, h-y)   270° → (h-y, x)
  const effW = rot === 90 || rot === 270 ? part.h : part.w;
  const effH = rot === 90 || rot === 270 ? part.w : part.h;
  const mX = (x: number, y: number): number => {
    if (rot === 90) return y;
    if (rot === 180) return part.w - x;
    if (rot === 270) return part.h - y;
    return x;
  };
  const mY = (x: number, y: number): number => {
    if (rot === 90) return part.w - x;
    if (rot === 180) return part.h - y;
    if (rot === 270) return x;
    return y;
  };
  const sc = Math.min((vw - ox - right) / effW, (vh - oy - bottomBand) / effH);
  const w = effW * sc;
  const h = effH * sc;
  const sx = (x: number) => ox + x * sc;
  const sy = (y: number) => oy + h - y * sc;

  // holes & grooves mapped into the (possibly rotated) local frame
  const holesM = part.holes.map((hl) => ({ X: mX(hl.x, hl.y), Y: mY(hl.x, hl.y), kind: hl.kind, dia: hl.dia }));
  const groovesM = part.grooves.map((g) => ({
    X1: mX(g.x1, g.y1),
    Y1: mY(g.x1, g.y1),
    X2: mX(g.x2, g.y2),
    Y2: mY(g.x2, g.y2),
  }));

  // FRONT edge detection — slide holes are measured from the front edge, so the
  // edge whose coordinate has a hole < 60mm is the front (39mm is the standard
  // first slide hole). The label tells the operator which face is which.
  const slideM = holesM.filter((hl) => hl.kind === "slide");
  let frontEdge: "left" | "bottom" | null = null;
  if (slideM.length) {
    const xs = [...new Set(slideM.map((h) => h.X))];
    const ys = [...new Set(slideM.map((h) => h.Y))];
    if (xs.length > 1 && Math.min(...xs) < 60) frontEdge = "left";
    else if (ys.length > 1 && Math.min(...ys) < 60) frontEdge = "bottom";
  }

  // unique hole column (x) and row (y) positions — used to build dimension chains
  const cols = [...new Set(holesM.map((hl) => hl.X))].sort((a, b) => a - b);
  const rows = [...new Set(holesM.map((hl) => hl.Y))].sort((a, b) => a - b);

  // horizontal segments: chain = left edge → each column → right edge ·
  // datum = each column measured from the LEFT edge (absolute, how the CNC drills)
  const hSegs: { a: number; b: number }[] = [];
  const hx = [0, ...cols, effW];
  if (dimMode === "datum") {
    cols.forEach((c) => hSegs.push({ a: 0, b: c }));
    hSegs.push({ a: 0, b: effW }); // overall width
  } else {
    for (let i = 0; i + 1 < hx.length; i++) if (hx[i + 1] - hx[i] > 0.1) hSegs.push({ a: hx[i], b: hx[i + 1] });
  }
  // vertical segments: chain = bottom edge → each row → top edge · datum = from bottom
  const vSegs: { a: number; b: number }[] = [];
  const vy = [0, ...rows, effH];
  if (dimMode === "datum") {
    rows.forEach((r) => vSegs.push({ a: 0, b: r }));
    vSegs.push({ a: 0, b: effH }); // overall height
  } else {
    for (let i = 0; i + 1 < vy.length; i++) if (vy[i + 1] - vy[i] > 0.1) vSegs.push({ a: vy[i], b: vy[i + 1] });
  }

  // assign ONE symbol per unique dimension VALUE (a map key) — segments that
  // measure the same distance share the same letter (A, B, C…)
  const segs: { a: number; b: number; orient: "H" | "V" }[] = [
    ...hSegs.map((d) => ({ ...d, orient: "H" as const })),
    ...vSegs.map((d) => ({ ...d, orient: "V" as const })),
  ];
  const valToSym = new Map<number, string>();
  for (const s of segs) {
    const v = Math.round((s.b - s.a) * 10) / 10;
    if (!valToSym.has(v)) valToSym.set(v, symLetter(valToSym.size));
  }
  const symOf = (a: number, b: number) => valToSym.get(Math.round((b - a) * 10) / 10)!;
  const hDims = hSegs.map((d) => ({ ...d, sym: symOf(d.a, d.b) }));
  const vDims = vSegs.map((d) => ({ ...d, sym: symOf(d.a, d.b) }));
  const legend = [...valToSym.entries()].map(([val, sym]) => ({
    sym,
    val,
    hasH: segs.some((s) => s.orient === "H" && Math.round((s.b - s.a) * 10) / 10 === val),
    hasV: segs.some((s) => s.orient === "V" && Math.round((s.b - s.a) * 10) / 10 === val),
  }));

  const hStep = Math.min(13, (bottomBand - 18) / Math.max(1, hDims.length));
  const vStep = Math.min(13, (leftBand - 16) / Math.max(1, vDims.length));

  // --- zoom & pan state ------------------------------------------------------
  // Single atomic state: zoom/pan are updated together so coordinates always
  // derive from the SAME scale. (Previously tx/ty were set inside the scale
  // updater — that calls setState from within another setState updater, which
  // throws under StrictMode and blanked the whole app.)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  /** zoom by factor keeping the point (px,py) stationary — atomic & idempotent */
  const zoomAt = (factor: number, px: number, py: number) =>
    setView((v) => {
      const ns = Math.min(8, Math.max(1, v.scale * factor));
      const k = ns / v.scale;
      return { scale: ns, tx: px - k * (px - v.tx), ty: py - k * (py - v.ty) };
    });
  const reset = () => setView({ scale: 1, tx: 0, ty: 0 });

  const onWheel = (e: React.WheelEvent) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 0) {
      drag.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    // capture the delta OUTSIDE the state updater — reading a ref inside an
    // updater runs during the render phase and can throw if the ref flipped to
    // null in between (StrictMode also double-invokes updaters).
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
  };
  const onPointerUp = () => (drag.current = null);

  // --- dimension key box: draggable + snap-to-corner -------------------------
  type KeyCorner = "tl" | "tr" | "br" | "bl";
  const [keyCorner, setKeyCorner] = useState<KeyCorner>("tl");
  const [keyPos, setKeyPos] = useState<{ x: number; y: number } | null>(null);
  const keyRef = useRef<HTMLDivElement>(null);
  const keyDrag = useRef<{ dx: number; dy: number } | null>(null);

  const KEY_NEXT: Record<KeyCorner, KeyCorner> = { tl: "tr", tr: "br", br: "bl", bl: "tl" };
  const cycleKeyCorner = () => {
    setKeyPos(null);
    setKeyCorner((c) => KEY_NEXT[c]);
  };
  const onKeyPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // let corner button handle its own click
    if (e.button !== 0) return;
    const el = keyRef.current;
    const parent = wrapRef.current;
    if (!el || !parent) return;
    const er = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    keyDrag.current = { dx: e.clientX - er.left, dy: e.clientY - er.top };
    setKeyPos({ x: er.left - pr.left, y: er.top - pr.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onKeyPointerMove = (e: React.PointerEvent) => {
    if (!keyDrag.current || !wrapRef.current) return;
    const pr = wrapRef.current.getBoundingClientRect();
    setKeyPos({ x: e.clientX - pr.left - keyDrag.current.dx, y: e.clientY - pr.top - keyDrag.current.dy });
  };
  const onKeyPointerUp = () => (keyDrag.current = null);

  const keyStyle: React.CSSProperties = keyPos
    ? { left: keyPos.x, top: keyPos.y }
    : keyCorner === "tr"
      ? { right: 6, top: 6 }
      : keyCorner === "br"
        ? { right: 6, bottom: 6 }
        : keyCorner === "bl"
          ? { left: 6, bottom: 6 }
          : { left: 6, top: 6 };

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-[#0a0f18]" style={{ touchAction: "none" }}>
      {/* dimension symbol key — movable anywhere + snap-to-corner button */}
      {legend.length > 0 && (
        <div
          ref={keyRef}
          className="absolute z-20 select-none rounded border border-white/10 bg-black/65 px-2 py-1.5 font-mono text-[9.5px] leading-4 text-ink-300 shadow-lg"
          style={keyStyle}
          onPointerDown={onKeyPointerDown}
          onPointerMove={onKeyPointerMove}
          onPointerUp={onKeyPointerUp}
          onPointerLeave={onKeyPointerUp}
        >
          <div className="mb-1 flex cursor-grab items-center gap-1.5 text-[8px] uppercase tracking-wide text-ink-400 active:cursor-grabbing">
            <Move size={10} className="text-ink-500" />
            <span className="flex-1">Dimensions</span>
            <button
              className="rounded p-0.5 text-ink-400 hover:bg-white/10 hover:text-white"
              onClick={cycleKeyCorner}
              title="Move to opposite corner"
            >
              <CornerUpRight size={11} />
            </button>
          </div>
          {legend.map((l) => (
            <div key={l.sym}>
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#5c7291] text-[8px] text-[#a9bddb]">
                {l.sym}
              </span>{" "}
              <span className="text-[#a9bddb]">{r2(l.val)}</span>
              <span className="text-ink-500">mm</span>
              <span className="ml-1 text-[9px] text-cyan-400/80">{l.hasH ? "↔" : ""}</span>
              <span className="ml-1 text-[9px] text-fuchsia-300/80">{l.hasV ? "↕" : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* zoom/pan surface */}
      <div
        ref={wrapRef}
        className="w-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg
          viewBox={`0 0 ${vw} ${vh}`}
          className="mx-auto block w-full h-auto max-w-[720px]"
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`, transformOrigin: "0 0" }}
        >
          <rect x={ox} y={oy} width={w} height={h} fill="#101a2a" stroke="#3d5878" strokeWidth="1.4" />
          {grid32 && (
            <g>
              {Array.from({ length: Math.floor(effW / 32) }, (_, i) => (i + 1) * 32).map((gx) => (
                <line key={`gx${gx}`} x1={sx(gx)} y1={oy} x2={sx(gx)} y2={oy + h} stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="1.5 3" opacity="0.55" />
              ))}
              {Array.from({ length: Math.floor(effH / 32) }, (_, i) => (i + 1) * 32).map((gy) => (
                <line key={`gy${gy}`} x1={ox} y1={sy(gy)} x2={ox + w} y2={sy(gy)} stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="1.5 3" opacity="0.55" />
              ))}
            </g>
          )}
          {holesM.map((hl, i) => (
            <circle
              key={i}
              cx={sx(hl.X)}
              cy={sy(hl.Y)}
              r={Math.max(2.5, (hl.dia / 2) * sc)}
              fill="none"
              stroke={HOLE_COLOR[hl.kind]}
              strokeWidth="1.4"
              onMouseEnter={() => setHover({ X: hl.X, Y: hl.Y, kind: hl.kind, dia: hl.dia })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "crosshair" }}
            />
          ))}
          {groovesM.map((g, i) => (
            <line
              key={i}
              x1={sx(g.X1)}
              y1={sy(g.Y1)}
              x2={sx(g.X2)}
              y2={sy(g.Y2)}
              stroke="#f0abfc"
              strokeWidth="2.6"
            />
          ))}

          {/* FRONT edge marker — the edge slide holes are measured from */}
          {frontEdge === "left" && (
            <g>
              <line x1={ox - 5} y1={oy + h} x2={ox - 5} y2={oy} stroke="#f5b33c" strokeWidth="1.6" />
              <path d={`M ${ox - 5} ${oy} l -3.5 7 M ${ox - 5} ${oy} l 3.5 7`} stroke="#f5b33c" strokeWidth="1.6" fill="none" />
              <text x={ox - 9} y={oy + h / 2} fill="#f5b33c" fontSize="9" fontWeight="700" textAnchor="middle" transform={`rotate(-90 ${ox - 9} ${oy + h / 2})`}>
                FRONT
              </text>
            </g>
          )}
          {frontEdge === "bottom" && (
            <g>
              <line x1={ox} y1={oy + h + 5} x2={ox + w} y2={oy + h + 5} stroke="#f5b33c" strokeWidth="1.6" />
              <path d={`M ${ox + w} ${oy + h + 5} l -7 -3.5 M ${ox + w} ${oy + h + 5} l -7 3.5`} stroke="#f5b33c" strokeWidth="1.6" fill="none" />
              <text x={ox + w} y={oy + h + 17} fill="#f5b33c" fontSize="9" fontWeight="700" textAnchor="end">
                FRONT
              </text>
            </g>
          )}

          {/* horizontal dimensions (symbol letters) below the panel */}
          {hDims.map((d, i) => (
            <HDim key={`h${i}`} x1={sx(d.a)} x2={sx(d.b)} y={oy + h + 10 + i * hStep} frame={oy + h} sym={d.sym} />
          ))}
          {/* vertical dimensions (symbol letters) on the left of the panel */}
          {vDims.map((d, i) => (
            <VDim key={`v${i}`} y1={sy(d.a)} y2={sy(d.b)} x={ox - 10 - i * vStep} frame={ox} sym={d.sym} />
          ))}

          <text x={ox + w / 2} y={oy - 7} fill="#7d8ea6" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
            {effW} mm{rot > 0 ? ` · ${rot}°` : ""}
          </text>
          <text x={ox + w + 18} y={oy + h / 2} fill="#7d8ea6" fontSize="10" fontFamily="JetBrains Mono, monospace" transform={`rotate(90 ${ox + w + 18} ${oy + h / 2})`}>
            {effH} mm
          </text>
        </svg>
      </div>

      {/* zoom controls — bottom right */}
      <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1 rounded-lg border border-white/[0.07] bg-black/55 px-1.5 py-1">
        <button
          className={`rounded p-1 hover:bg-white/10 hover:text-white ${rot ? "text-amber-300" : "text-ink-300"}`}
          onClick={() => {
            setRot((r) => (r + 90) % 360);
            reset();
          }}
          title="Rotate the panel 90° (view only — the real part dimensions are unchanged)"
        >
          <RotateCw size={13} />
        </button>
        {rot > 0 && (
          <span className="min-w-[24px] text-center font-mono text-[10px] text-amber-300">{rot}°</span>
        )}
        <button
          className="rounded p-1 text-ink-300 hover:bg-white/10 hover:text-white"
          onClick={() => zoomAt(1 / 1.25, wrapRef.current ? wrapRef.current.clientWidth / 2 : 0, wrapRef.current ? wrapRef.current.clientHeight / 2 : 0)}
          title="Zoom out"
        >
          <Minus size={13} />
        </button>
        <button className="rounded p-1 text-ink-300 hover:bg-white/10 hover:text-white" onClick={reset} title="Reset zoom & pan">
          <RotateCcw size={13} />
        </button>
        <button
          className="rounded p-1 text-ink-300 hover:bg-white/10 hover:text-white"
          onClick={() => zoomAt(1.25, wrapRef.current ? wrapRef.current.clientWidth / 2 : 0, wrapRef.current ? wrapRef.current.clientHeight / 2 : 0)}
          title="Zoom in"
        >
          <Plus size={13} />
        </button>
        <span className="min-w-[38px] text-center font-mono text-[10px] text-ink-300">{Math.round(view.scale * 100)}%</span>
      </div>

      {/* per-hole readout */}
      <div className="mt-1.5 h-5 font-mono text-[10.5px] text-ink-200">
        {hover ? (
          <span className="text-amber-200">✛ X {r2(hover.X)} · Y {r2(hover.Y)} · Ø{hover.dia}mm · {hover.kind}</span>
        ) : (
          <span className="text-ink-500">hover a hole for its exact X / Y position</span>
        )}
      </div>
    </div>
  );
}
