import type { Banding, Cabinet, CabinetType, ColumnSpec, CoverPanel, DoorSpec, MdfFinish, PanelItem, Part, RowSpec, Settings } from "../types";
import {
  DOOR_GAP_BETWEEN_DOUBLE,
  DRAWER_HEIGHT_INCREMENT,
  FIRST_DRAWER_HOLE_HEIGHT,

  KITCHEN_FIRST_HOLE_Y,
  KITCHEN_LAST_DRAWER_OFFSET,
  KITCHEN_SLIDE_CM,
  KITCHEN_SLIDE_PATTERN,
  TYPE_META,
  defaultPlyId,
  doorHingeCount,
  findNearestDrawerDepth,
  getDrawerHolePattern,
  normalizeSlidePatterns,
  plyMaterialById,
  plyMaterialOf,
  shelfGap,
} from "./defaults";
export { doorHingeCount } from "./defaults";

export const hasKick = (c: Cabinet | CabinetType, S?: Settings): boolean => {
  if (typeof c === "string") return TYPE_META[c].kick;
  void S;
  // only show/emit a toe kick when the user explicitly enabled it — a cabinet
  // with no toe-kick selected must never show one in any view or output.
  return c.hasToeKick === true && TYPE_META[c.type].kick;
};
export const kickH = (c: Cabinet, S: Settings) => (hasKick(c) ? S.kickHeight : 0);
export const boxHeight = (c: Cabinet, S: Settings) => c.height - kickH(c, S);

/**
 * Carcass (interior) depth. The overall cabinet depth includes the front
 * (MDF door / drawer front) and the back panel, so both are deducted.
 */
export const carcassDepth = (c: Cabinet, S: Settings) =>
  Math.max(40, c.depth - (c.hasFronts !== false ? frontThk(c, S) : 0) - (c.hasBack !== false ? S.backThk : 0));

/** thickness of the front material actually used on this cabinet (glass/aluminum front ≈ 10mm) */
export function frontThk(c: Cabinet, S: Settings): number {
  for (const r of c.rows) for (const col of r.columns) if (col.door) {
    const d = col.door;
    if (d.material === "glass") return 10;
    return d.material === "mdf" ? d.mdfThk || S.mdfThk : S.bodyThk;
  }
  return S.mdfThk;
}
export const isCorner = (t: CabinetType) => t === "cornerBase" || t === "cornerWall";
export const isNotched = (t: CabinetType) => t === "L" || t === "C";

/* ---- stacked boxes (separate boxes bolted on top of each other) ---- */
/** true when the cabinet is built as 2+ separate stacked boxes */
export const stackOn = (c: Cabinet): boolean =>
  Array.isArray(c.stack) && c.stack.length >= 2 && c.stack.every((h) => h > 0);
/** box heights, bottom → top (empty when not stacked) */
export const stackedHeights = (c: Cabinet): number[] => (stackOn(c) ? (c.stack as number[]) : []);
/** sum of all box heights (== cabinet height when consistent) */
export const stackTotal = (c: Cabinet): number => stackedHeights(c).reduce((a, h) => a + h, 0);

export const bandStr = (b: Banding) =>
  [b.top && "T", b.bottom && "B", b.left && "L", b.right && "R"].filter(Boolean).join(",") || "—";

/** bend length (mm) — total length of ALL banded edges of a part, i.e. the
 *  edge-banding tape a single piece needs (cut list column "Bend", rule I) */
export const bandLengthMm = (p: Part) =>
  (p.band.top ? p.w : 0) + (p.band.bottom ? p.w : 0) + (p.band.left ? p.h : 0) + (p.band.right ? p.h : 0);

/** stable per-part key used for grain-lock overrides in the cut list */
export function partId(p: Part): string {
  return `${p.cabId}|${p.name}|${Math.round(p.w * 10)}x${Math.round(p.h * 10)}|${p.material}|${p.thickness}`;
}

/**
 * Rotation-invariant per-part key (length/width sorted, hole/groove counts
 * instead of coordinates): the SAME part keeps the same key whether or not the
 * user manually rotated it 90° in the cut list — so grain-lock and rotation
 * toggles never lose track of their row when the dimensions swap.
 */
export function canonicalPartId(p: Part): string {
  const a = Math.round(Math.min(p.w, p.h) * 10);
  const b = Math.round(Math.max(p.w, p.h) * 10);
  return `${p.cabId}|${p.name}|${a}x${b}|${p.material}|${p.thickness}|h${p.holes.length}g${p.grooves.length}`;
}

/* ================= side panel outline (L / C notches) ================= */

/** Side panel polygon. x = 0 (back) … depth (front), y = 0 (bottom) … BH (top). */
export function sidePanelOutline(cab: Cabinet, BH: number, depth?: number): [number, number][] {
  const D = depth ?? cab.depth;
  if (cab.type === "L") {
    const cw = Math.min(Math.max(0, cab.lCutW), D - 10);
    const ch = Math.min(Math.max(0, cab.lCutH), BH - 10);
    if (cw <= 0 || ch <= 0) return rectOutline(D, BH);
    return [
      [0, 0],
      [D, 0],
      [D, BH - ch],
      [D - cw, BH - ch],
      [D - cw, BH],
      [0, BH],
    ];
  }
  if (cab.type === "C") {
    const cw = Math.min(Math.max(0, cab.cCutW), D - 10);
    const th = Math.min(Math.max(0, cab.cCutTopH), BH - 10);
    const mh = Math.max(0, cab.cCutMidH);
    const m0 = Math.max(0, cab.cCutOffsetFromBottom);
    const m1 = Math.min(m0 + mh, BH - th - 10);
    if (cw <= 0) return rectOutline(D, BH);
    const pts: [number, number][] = [[0, 0], [D, 0]];
    if (mh > 0 && m1 > m0) pts.push([D, m0], [D - cw, m0], [D - cw, m1], [D, m1]);
    if (th > 0) pts.push([D, BH - th], [D - cw, BH - th], [D - cw, BH]);
    else pts.push([D, BH]);
    pts.push([0, BH]);
    return pts;
  }
  return rectOutline(D, BH);
}

export const rectOutline = (w: number, h: number): [number, number][] => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];

export const pentagonOutline = (w: number, h: number, K: number): [number, number][] => [
  [0, 0],
  [w, 0],
  [w, K],
  [K, h],
  [0, h],
];

/** mirror a polygon horizontally inside its bounding width */
const mirrorOutline = (pts: [number, number][], w: number): [number, number][] =>
  pts.map(([x, y]) => [w - x, y] as [number, number]).reverse();

/* ================= column widths ================= */

export interface ColLayout {
  col: ColumnSpec;
  x: number; // left edge inside carcass interior (0 = inner left face)
  w: number; // clear opening width
  first: boolean;
  last: boolean;
  divider?: Part | null; // vertical divider to the right of this column
}

/** lay columns out inside any clear opening width (used for the cabinet and for nested splits) */
export function columnLayoutIn(innerW: number, cols: ColumnSpec[], S: Settings): ColLayout[] {
  const T = S.bodyThk;
  const n = cols.length;
  if (n === 0) return [];
  const dividers = (n - 1) * T;
  const avail = Math.max(40, innerW - dividers);
  const fixed = cols.reduce((a, c) => a + (c.width > 0 ? c.width : 0), 0);
  const flexCount = cols.filter((c) => c.width <= 0).length;
  const flexW = flexCount > 0 ? Math.max(40, (avail - fixed) / flexCount) : 0;
  let x = 0;
  return cols.map((c, i) => {
    const w = c.width > 0 ? c.width : flexW;
    const item: ColLayout = { col: c, x, w, first: i === 0, last: i === n - 1 };
    x += w + T;
    return item;
  });
}

export function columnLayout(cab: Cabinet, row: RowSpec, S: Settings): ColLayout[] {
  return columnLayoutIn(cab.width - 2 * S.bodyThk, row.columns ?? [], S);
}

/** resolved cover thickness — 0 = auto (plywood → bodyThk · MDF → mdfThk) */
export function coverThk(cv: CoverPanel, S: Settings): number {
  const mat = cv.mat ?? "mdf";
  return Number.isFinite(cv.thk) && cv.thk > 0 ? cv.thk : mat === "mdf" ? S.mdfThk : S.bodyThk;
}

/** legacy covers may omit w/h — sensible defaults (L/R: depth×height, T/B: width×depth) */
const coverW0 = (cab: Cabinet, cv: CoverPanel): number =>
  Number.isFinite(cv.w) && cv.w > 0 ? cv.w : cv.side === "T" || cv.side === "B" ? cab.width : cab.depth;
const coverH0 = (cab: Cabinet, cv: CoverPanel): number =>
  Number.isFinite(cv.h) && cv.h > 0 ? cv.h : cv.side === "T" || cv.side === "B" ? cab.depth : cab.height;

/** thickness of the existing LEFT cover on a cabinet (0 when absent) */
export const coverLeftThk = (cab: Cabinet, S: Settings, covers: CoverPanel[] = cab.covers ?? []): number => {
  const l = covers.find((c) => c.side === "L");
  return l ? coverThk(l, S) : 0;
};
/** thickness of the existing RIGHT cover on a cabinet (0 when absent) */
export const coverRightThk = (cab: Cabinet, S: Settings, covers: CoverPanel[] = cab.covers ?? []): number => {
  const r = covers.find((c) => c.side === "R");
  return r ? coverThk(r, S) : 0;
};

/** span a Top/Bottom cover must cover: cabinet + left + right cover thicknesses */
export const coverSpanWidth = (cab: Cabinet, S: Settings, covers: CoverPanel[] = cab.covers ?? []): number =>
  Math.round((cab.width + coverLeftThk(cab, S, covers) + coverRightThk(cab, S, covers)) * 10) / 10;

/**
 * X centre (cabinet-local, cabinet spans 0..width) where a Top/Bottom cover is
 * mounted. It is the centre of the ASSEMBLY — cabinet + left/right covers (the
 * left cover occupies −tL..0, the right cover width..width+tR), so the cover
 * covers everything and increasing its width grows it equally on BOTH sides.
 * With no L/R covers (or equal thicknesses) this is exactly the cabinet centre.
 */
export const coverCenterX = (cab: Cabinet, S: Settings, covers: CoverPanel[] = cab.covers ?? []): number =>
  Math.round(((cab.width + coverRightThk(cab, S, covers) - coverLeftThk(cab, S, covers)) / 2) * 10) / 10;

/**
 * Effective REAL size of a cover panel (single source of truth shared by the
 * cut list, 3D, the 2D front view and the side view so everything agrees):
 *  · T/B covers always SPAN the cabinet width plus any left/right cover
 *    thicknesses (minimum width — the typed width only adds overhang). The
 *    panel is centered on the assembly (see coverCenterX), so raising the
 *    width grows it evenly on BOTH sides, and a top/bottom added after
 *    left/right covers still covers everything.
 *  · L/R covers keep their typed size.
 */
export function coverPanelDims(
  cab: Cabinet,
  S: Settings,
  cv: CoverPanel,
  covers: CoverPanel[] = cab.covers ?? [],
): { w: number; h: number; thk: number } {
  const thk = coverThk(cv, S);
  const w0 = coverW0(cab, cv);
  const w = cv.side === "T" || cv.side === "B"
    ? Math.max(Math.max(5, w0), coverSpanWidth(cab, S, covers))
    : Math.max(5, w0);
  return { w: Math.round(w * 10) / 10, h: Math.max(5, Math.round(coverH0(cab, cv) * 10) / 10), thk };
}

/** width of the front covering a column (overlays the carcass edges at the ends) */
export function columnFaceWidth(_cab: Cabinet, lay: ColLayout, S: Settings): number {
  const T = S.bodyThk;
  return lay.w + (lay.first ? T : T / 2) + (lay.last ? T : T / 2);
}

export function columnFaceX(lay: ColLayout, S: Settings): number {
  const T = S.bodyThk;
  return T + lay.x - (lay.first ? T : T / 2);
}

/* ================= drawer math ================= */

export function drawerBoxDims(faceW: number, drawer: { frontHeight: number; hidden: boolean; slideDepthCm: number }, S: Settings) {
  const slideMm = drawer.slideDepthCm * 10;
  const boxW = Math.max(100, faceW - S.bodyThk - S.drawerBoxBackDeduct - (drawer.hidden ? S.drawerBoxHiddenExtra : 0));
  const boxD = slideMm - S.drawerBoxDepthFix;
  const sideH = Math.max(60, drawer.frontHeight - 50);
  const fbH = Math.max(40, sideH - 25);
  return { slideMm, boxW, boxD, sideH, fbH };
}

export function drawerHoleHeights(drawers: { frontHeight: number }[], S: Settings): number[] {
  const yStart = S.drawerHoleYStart ?? FIRST_DRAWER_HOLE_HEIGHT;
  const yStep = S.drawerHoleYStep ?? DRAWER_HEIGHT_INCREMENT;
  let cum = 0;
  return drawers.map((d, i) => {
    const y = i === 0 ? yStart : yStep + cum;
    cum += d.frontHeight;
    return y;
  });
}

function kitchenHoleHeights(drawers: { frontHeight: number }[]): number[] {
  const n = drawers.length;
  let cum = 0;
  return drawers.map((d, i) => {
    const y = i === 0 ? KITCHEN_FIRST_HOLE_Y : i === n - 1 ? cum + KITCHEN_LAST_DRAWER_OFFSET : KITCHEN_FIRST_HOLE_Y + cum;
    cum += d.frontHeight;
    return y;
  });
}

/** auto slide-hole Y (from the row/bank bottom) for the drawer at index i, honoring kitchen mode */
export function autoDrawerHoleY(drawers: { frontHeight: number }[], isKitchen: boolean, i: number, S: Settings): number {
  const ys = isKitchen ? kitchenHoleHeights(drawers) : drawerHoleHeights(drawers, S);
  return ys[Math.min(i, Math.max(0, ys.length - 1))];
}

/** effective Y for a drawer: manual override wins, otherwise the auto rule */
export function effectiveDrawerHoleY(dr: { yOffset?: number; frontHeight: number }, drawers: { frontHeight: number }[], isKitchen: boolean, i: number, S: Settings): number {
  return typeof dr.yOffset === "number" && Number.isFinite(dr.yOffset) ? dr.yOffset : autoDrawerHoleY(drawers, isKitchen, i, S);
}
/**
 * Where a column's drawer bank starts inside its section, and how tall it is.
 * Shared by the part generator, the 2D view and the 3D scene so previews always
 * match the cut list. Alignment: "bottom" (default), "top", or "custom" Y offset
 * (mm from the section bottom, clamped so the bank stays inside the section).
 */
export function drawerBank(col: ColumnSpec, rowH: number, S: Settings): { y: number; h: number } {
  const h = col.drawers.reduce((a, d) => a + d.frontHeight, 0);
  if (h <= 0) return { y: 0, h: 0 };
  void S;
  const align = col.drawerAlign ?? "bottom";
  const maxY = Math.max(0, rowH - h);
  const y =
    align === "top"
      ? maxY
      : align === "custom"
        ? Math.min(Math.max(0, col.drawerOffsetY ?? 0), maxY)
        : 0;
  return { y, h };
}

/* ================= door math ================= */

export function doorDims(faceW: number, rowH: number, door: DoorSpec, S: Settings): { w: number; h: number; count: number; wAuto: number; hAuto: number } {
  // rule F — manual height/width override wins over auto
  const hAuto = door.style === "inset" ? rowH - 2 * (S.bodyThk + S.doorGap) : rowH - 2 * S.doorGap;
  const h = door.hOverride && door.hOverride > 0 ? Math.max(50, door.hOverride) : hAuto;
  const insetTotal = faceW - 2 * (S.bodyThk + S.doorGap);
  const overlayTotal = faceW - 2 * S.doorGap;
  const totalAuto = door.style === "inset" ? insetTotal : overlayTotal;
  const leafWAutoSingle = totalAuto;
  const leafWAutoDouble = (totalAuto - DOOR_GAP_BETWEEN_DOUBLE) / 2;
  const leafWAutoSliding = leafWAutoDouble + 20;

  const applyWOverride = (autoW: number) => (door.wOverride && door.wOverride > 0 ? Math.max(50, door.wOverride) : autoW);

  if (door.style === "inset") {
    if (door.type === "double" || door.type === "sliding") {
      const autoW = door.type === "sliding" ? leafWAutoSliding : leafWAutoDouble;
      return { w: applyWOverride(autoW), h, count: 2, wAuto: autoW, hAuto };
    }
    return { w: applyWOverride(leafWAutoSingle), h, count: 1, wAuto: leafWAutoSingle, hAuto };
  }
  if (door.type === "double") return { w: applyWOverride(leafWAutoDouble), h, count: 2, wAuto: leafWAutoDouble, hAuto };
  if (door.type === "sliding") return { w: applyWOverride(leafWAutoSliding), h, count: 2, wAuto: leafWAutoSliding, hAuto };
  return { w: applyWOverride(leafWAutoSingle), h, count: 1, wAuto: leafWAutoSingle, hAuto };
}

/** helper for full-door auto dims with optional cab overrides */
export function fullDoorAutoDims(cab: Cabinet, S: Settings): { wAuto: number; hAuto: number } {
  const kick = kickH(cab, S);
  const BH = cab.height - kick;
  const wAuto = cab.width - 2 * S.doorGap;
  const hAuto = BH - 2 * S.doorGap;
  return { wAuto, hAuto };
}





/** MDF thickness always comes from the system defaults — no manual override.
 *  Glass / aluminum doors are PURCHASED hardware — they never produce a cut part. */
export function doorMaterial(door: DoorSpec, S: Settings): { mat: Part["material"]; thk: number } {
  if (door.material === "glass") return { mat: "mdf", thk: 10 };
  return door.material === "mdf" ? { mat: "mdf", thk: S.mdfThk } : { mat: "plywood", thk: S.bodyThk };
}

/** effective hinge count for one door leaf — the user override (1–6) wins,
 *  otherwise auto: 2 hinges, 3 when the leaf is 900mm or taller. Sliding = 0. */
export function effectiveHingeCount(door: Pick<DoorSpec, "type" | "hingeCount">, leafH: number): number {
  return door.type === "sliding" ? 0 : Math.max(1, Math.min(6, door.hingeCount ?? doorHingeCount(leafH)));
}

/* ---- MDF finish → edge-banding & grain rules ----
 * Rule (user): MDF does NOT get edge banding all the time. Plywood is always
 * banded; MDF is banded ONLY when it is "oak" finish. "white" MDF is never banded. */

/** true when this MDF finish gets edge banding ("oak"), false for "white" */
export const mdfBanded = (S: Settings, finish?: MdfFinish): boolean => (finish ?? S.mdfFinish) === "oak";
/** banding flags for an MDF part: 4 edges when oak, none when white */
export const mdfBand = (S: Settings, finish?: MdfFinish): Banding => (mdfBanded(S, finish) ? { top: true, bottom: true, left: true, right: true } : {});
/** nesting grain lock: true when the panel has a visible wood grain that must not rotate */
export const mdfGrainLocked = (S: Settings, finish?: MdfFinish): boolean => mdfBanded(S, finish);

export const columnHasDrawers = (c: ColumnSpec) => c.drawers.length > 0;

/* ================= part generation ================= */

type MkFn = (p: Partial<Part> & Pick<Part, "name" | "w" | "h" | "material" | "thickness">) => Part;

export function generateCabinetParts(cab: Cabinet, S: Settings): Part[] {
  const T = S.bodyThk;
  const parts: Part[] = [];
  const cabinetPly = plyMaterialOf(S, cab);
  const mk: MkFn = (p) => {
    const part: Part = {
      cabId: cab.id,
      // cut list shows the cabinet size appended to the name (e.g. Base-01_600x720)
      cabName: `${cab.name}_${Math.round(cab.width)}x${Math.round(cab.height)}`,
      qty: 1,
      band: {},
      holes: [],
      grooves: [],
      shape: "rect",
      outline: [],
      grain: p.material === "plywood",
      note: "",
      ...p,
      // every plywood part carries the cabinet's plywood material id (same
      // thickness — the material only differs in name/color) so the cut list,
      // nesting and DXF can group them per material. An explicit p.matId wins
      // (the toe kick uses it to always come from the DEFAULT plywood).
      matId: p.matId !== undefined ? p.matId : p.material === "plywood" ? cabinetPly.id : undefined,
      w: Math.max(5, Math.round(p.w * 10) / 10),
      h: Math.max(5, Math.round(p.h * 10) / 10),
    };
    parts.push(part);
    return part;
  };

  if (isCorner(cab.type)) buildCorner(cab, S, mk, T);
  else if (stackOn(cab)) buildStackedBody(cab, S, mk, T);
  else buildBody(cab, S, mk, T);

  // ---- cover panels (L / R / T / B): full height × full depth by default ----
  // T/B covers SPAN the cabinet + any left/right cover thicknesses (auto
  // minimum width, centered — see coverPanelDims) and carry noRotate so they
  // keep the span as their length in the cut list / nesting, exactly like the
  // top/bottom/shelf span panels do. L/R covers keep the auto-rotation
  // (upright grain along the height).
  (cab.covers ?? []).forEach((cv) => {
    const mat = cv.mat ?? "mdf";
    const dims = coverPanelDims(cab, S, cv);
    const thk = dims.thk;
    const w = dims.w;
    const h = dims.h;
    const label = cv.side === "L" ? "Left" : cv.side === "R" ? "Right" : cv.side === "T" ? "Top" : "Bottom";
    const tB = cv.side === "T" || cv.side === "B";
    // material: plywood covers can choose ANY plywood from the library (matId);
    // mdf covers pick a finish — white (no banding) or oak (banded + grain).
    const finish = mat === "mdf" ? (cv.finish ?? S.mdfFinish) : "white";
    const matId = mat === "plywood" ? (cv.matId ?? plyMaterialOf(S, cab).id) : undefined;
    const matName = mat === "mdf" ? (finish === "oak" ? `MDF oak ${thk}mm` : `MDF white ${thk}mm`) : `plywood ${thk}mm`;
    const spanNote = tB
      ? ` · spans cabinet ${Math.round(cab.width)} + L/R covers → ${Math.round(w)} (centered)`
      : "";
    mk({
      name: `Cover panel ${label}`,
      w,
      h,
      material: mat,
      thickness: thk,
      matId,
      band: mat === "plywood" ? { top: true, bottom: true, left: true, right: true } : mdfBand(S, finish),
      grain: mat === "plywood" || finish === "oak",
      noRotate: tB,
      note: `cover ${label.toLowerCase()} · ${matName}${spanNote} · ${mat === "plywood" || finish === "oak" ? "banding: LWLW" : "white MDF · no banding"}`,
    });
  });

  if (cab.qty > 1) parts.forEach((p) => (p.qty *= cab.qty));
  return parts;
}

/**
 * Column indices (per row) that carry a full-height door. A full-height door spans
 * the whole carcass, so any OTHER door in the same column index (on another row)
 * must be suppressed — otherwise we'd get one door per box instead of one long door.
 */
function fullDoorColumns(cab: Cabinet): Set<number> {
  const cols = new Set<number>();
  cab.rows.forEach((r) => {
    r.columns.forEach((c, ci) => {
      if (c.door && c.door.full) cols.add(ci);
    });
  });
  return cols;
}

function buildBody(cab: Cabinet, S: Settings, mk: MkFn, T: number) {
  const kick = kickH(cab, S);
  const BH = cab.height - kick;
  // the cabinet's own plywood — backs and full-depth sides inherit it (Phase #3:
  // "back follows material") so 3D colour and nesting grouping match the carcass
  const cabinetPly = plyMaterialOf(S, cab);
  const W = cab.width;
  const D = carcassDepth(cab, S); // depth minus front + back thickness
  const insideW = W - 2 * T;
  const notch = isNotched(cab.type);
  const outline = sidePanelOutline(cab, BH, D);

  // ---- side panels: always separate LEFT + RIGHT (mirrored) ----
  const sideL = mk({
    name: "Side panel L",
    w: D,
    h: BH,
    material: "plywood",
    thickness: T,
    band: { right: true },
    note: notch ? `${cab.type} notched · banding: front` : "banding: front",
  });
  const sideR = mk({
    name: "Side panel R",
    w: D,
    h: BH,
    material: "plywood",
    thickness: T,
    band: { left: true },
    note: notch ? `${cab.type} notched · mirrored · banding: front` : "mirrored · banding: front",
  });
  if (notch) {
    sideL.shape = "poly";
    sideL.outline = outline;
    sideR.shape = "poly";
    sideR.outline = mirrorOutline(outline, D);
  }

  // ---- linear slot (glass panel / track): full carcass height, `slotFromFront`
  // mm back from the FRONT edge. Feature coordinate origin:
  //   LEFT panel  — x = 0 at the BACK edge  (so x = D − slotFromFront is front)
  //   RIGHT panel — x = 0 at the FRONT edge (mirrored — x = slotFromFront is front)
  // The RIGHT slot is therefore stored MIRRORED (same mirroring drillRight uses
  // for shelf/slide holes) so both panels read "slotFromFront from the front".
  const slot = cab.slot ?? "none";
  const slotFromFront = cab.slotFromFront != null && cab.slotFromFront > 0 ? cab.slotFromFront : S.slotFromFront;
  if (slot !== "none" && !notch) {
    const sw = Math.max(6, S.slotWidth);
    const cx = D - Math.max(sw, slotFromFront); // slot center x on the panel
    const x1 = cx - sw / 2;
    const x2 = cx + sw / 2;
    if (x1 > 8 && x2 < D - 8) {
      const targets = slot === "left" ? [sideL] : slot === "right" ? [sideR] : [sideL, sideR];
      targets.forEach((sp) => {
        const isR = sp === sideR;
        sp.grooves.push({ x1: isR ? D - x2 : x1, y1: 0, x2: isR ? D - x1 : x2, y2: sp.h, width: sw, kind: "slot" });
        sp.note = `${sp.note} · slot ${sw}mm @ ${Math.round(slotFromFront)}mm from front${isR ? " (mirrored)" : ""}`;
      });
    }
  }

  // ---- carcass ----
  // tops / bottoms keep grain along the span (no auto-rotation — rotating them
  // would lock their grain 90° off and waste sheets in nesting)
  mk({ name: "Top", w: insideW, h: D, material: "plywood", thickness: T, band: { top: true }, note: "banding: front", noRotate: true });
  mk({ name: "Bottom", w: insideW, h: D, material: "plywood", thickness: T, band: { top: true }, note: "banding: front", noRotate: true });
  // toe kick — plywood, NO edge banding; can be excluded from nesting / cut list.
  // Front board = inner width × kick height. The 2 side boards run FULL depth
  // (from the back to the recess line = carcass depth − kickDepth) × kick height.
  // The kick ALWAYS comes from the project default plywood (e.g. the white board).
  if (kick > 0 && S.kickInNesting !== false) {
    mk({ name: "Toe kick front", w: insideW, h: S.kickHeight, material: "plywood", thickness: T, matId: defaultPlyId(S) });
    mk({
      name: "Toe kick side",
      w: Math.max(20, D - S.kickDepth),
      h: S.kickHeight,
      qty: 2,
      material: "plywood",
      thickness: T,
      matId: defaultPlyId(S),
      note: "full-depth side",
    });
  }

  // ---- back panel ----
  // Always ONE continuous back panel for the whole cabinet unit (no subdivisions).
  // Back follows cabinet plywood material (matId) so 3D color + nesting grouping matches carcass (Phase #3)
  if (cab.hasBack !== false)
    mk({
      name: "Back",
      // oriented LONG side along the grain (Length): tall backs span the sheet
      // length, wide backs stay wide — either way the locked grain runs along
      // the length and the part fits the 2440×1220 board whenever possible
      w: Math.max(W - 2, BH - 2),
      h: Math.min(W - 2, BH - 2),
      material: "back",
      thickness: S.backThk,
      matId: cabinetPly.id,
      // oak rule: a back cut from a grain-visible plywood locks its grain like
      // every other grain part (white/solid boards stay free to rotate)
      grain: cabinetPly.solid !== true,
      noRotate: true,
      note: `full cabinet back · follows ${cabinetPly.name} · ${S.backThk}mm${cabinetPly.solid !== true ? " · grain locked" : ""}`,
    });

  // ---- rows & columns ----
  const fullDoorCols = fullDoorColumns(cab);
  let y0 = 0;
  cab.rows.forEach((row, ri) => {
    const lays = columnLayout(cab, row, S);

    // row section = horizontal divider, same size as top/bottom, one below every row above the first
    if (ri > 0)
      mk({
        name: `Row section R${ri}/R${ri + 1}`,
        w: insideW,
        h: D,
        material: "plywood",
        thickness: T,
        band: { top: true },
        note: "row divider · banding: front",
        noRotate: true,
      });

    // vertical dividers between columns (side-panel depth, height − deduction)
    lays.forEach((lay, ci) => {
      if (lay.last) return;
      const dv = mk({
        name: `Vertical divider R${ri + 1}C${ci + 1}`,
        w: D,
        h: Math.max(20, row.h - S.dividerDeduct),
        material: "plywood",
        thickness: T,
        band: { right: true },
        note: `side depth × row − ${S.dividerDeduct}mm · banding: front`,
      });
      lay.divider = dv;
    });

    lays.forEach((lay, ci) => {
      const faceW = lays.length === 1 ? W : columnFaceWidth(cab, lay, S);
      const tag = lays.length > 1 ? ` R${ri + 1}C${ci + 1}` : ` R${ri + 1}`;
      buildColumn(cab, S, mk, lay, faceW, row.h, y0, tag, {
        L: sideL,
        R: sideR,
        first: lay.first,
        last: lay.last,
        dividerL: ci > 0 ? lays[ci - 1].divider ?? null : null,
        dividerR: lay.divider ?? null,
        rowY: y0,
        fullH: BH,
        suppressDoor: fullDoorCols.has(ci),
      });
    });

    y0 += row.h;
  });
}

/**
 * Stacked boxes: the cabinet is built as SEPARATE boxes bolted on top of each
 * other. Each box has its own 2 side panels + top + bottom (+ back); the toe
 * kick sits under box 1 only. Rows are assigned to boxes via `row.box`.
 * A full-height door spans the entire stack (one long door part).
 */
function buildStackedBody(cab: Cabinet, S: Settings, mk: MkFn, T: number) {
  const kick = kickH(cab, S);
  const cabinetPly = plyMaterialOf(S, cab); // per-cabinet plywood — backs follow it (Phase #3)
  const W = cab.width;
  const D = carcassDepth(cab, S);
  const insideW = W - 2 * T;
  const heights = stackedHeights(cab);
  const fullH = heights.reduce((a, h) => a + h, 0) - kick; // total carcass height (door span)
  const slot = cab.slot ?? "none";
  const fullDoorCols = fullDoorColumns(cab);
  // Cabinet-level door chosen "from above" (Boxes control): covers the WHOLE
  // cabinet across all boxes — suppresses every per-section door.
  const cabDoor = cab.fullDoor && cab.fullDoor !== "off";

  heights.forEach((bh, bi) => {
    const bKick = bi === 0 ? kick : 0;
    const bH = Math.max(40, bh - bKick); // this box's carcass height
    const bTag = ` B${bi + 1}`;

    const sideL = mk({
      name: `Side panel L${bTag}`,
      w: D,
      h: bH,
      material: "plywood",
      thickness: T,
      band: { right: true },
      note: `box ${bi + 1} · banding: front`,
    });
    const sideR = mk({
      name: `Side panel R${bTag}`,
      w: D,
      h: bH,
      material: "plywood",
      thickness: T,
      band: { left: true },
      note: `box ${bi + 1} · mirrored · banding: front`,
    });

    // linear slot on every box's side panels — RIGHT panel coordinates are
    // MIRRORED (x=0 = front edge) so BOTH panels read "slotFromFront from front".
    const slotFromFront2 = cab.slotFromFront != null && cab.slotFromFront > 0 ? cab.slotFromFront : S.slotFromFront;
    if (slot !== "none") {
      const sw = Math.max(6, S.slotWidth);
      const cx = D - Math.max(sw, slotFromFront2);
      const x1 = cx - sw / 2;
      const x2 = cx + sw / 2;
      if (x1 > 8 && x2 < D - 8) {
        const targets = slot === "left" ? [sideL] : slot === "right" ? [sideR] : [sideL, sideR];
        targets.forEach((sp) => {
          const isR = sp === sideR;
          sp.grooves.push({ x1: isR ? D - x2 : x1, y1: 0, x2: isR ? D - x1 : x2, y2: sp.h, width: sw, kind: "slot" });
          sp.note = `${sp.note} · slot ${sw}mm @ ${Math.round(slotFromFront2)}mm from front${isR ? " (mirrored)" : ""}`;
        });
      }
    }

    mk({ name: `Top${bTag}`, w: insideW, h: D, material: "plywood", thickness: T, band: { top: true }, note: `box ${bi + 1} · banding: front`, noRotate: true });
    mk({ name: `Bottom${bTag}`, w: insideW, h: D, material: "plywood", thickness: T, band: { top: true }, note: `box ${bi + 1} · banding: front`, noRotate: true });

    // toe kick only under the bottom box — always the DEFAULT plywood
    if (bi === 0 && bKick > 0 && S.kickInNesting !== false) {
      mk({ name: "Toe kick front", w: insideW, h: S.kickHeight, material: "plywood", thickness: T, matId: defaultPlyId(S) });
      mk({
        name: "Toe kick side",
        w: Math.max(20, D - S.kickDepth),
        h: S.kickHeight,
        qty: 2,
        material: "plywood",
        thickness: T,
        matId: defaultPlyId(S),
        note: "full-depth side",
      });
    }

    if (cab.hasBack !== false)
      mk({
        name: `Back${bTag}`,
        w: Math.max(W - 2, bH - 2),
        h: Math.min(W - 2, bH - 2),
        material: "back",
        thickness: S.backThk,
        matId: cabinetPly.id,
        grain: cabinetPly.solid !== true,
        noRotate: true,
        note: `box ${bi + 1} back · follows ${cabinetPly.name}${cabinetPly.solid !== true ? " · grain locked" : ""}`,
      });

    // rows belonging to this box
    const rows = cab.rows.map((r, i) => ({ r, i })).filter(({ r }) => (r.box ?? 0) === bi);
    let y0 = 0;
    rows.forEach(({ r, i }, idx) => {
      const lays = columnLayout(cab, r, S);
      if (idx > 0)
        mk({
          name: `Row section R${i + 1}/R${i + 2}`,
          w: insideW,
          h: D,
          material: "plywood",
          thickness: T,
          band: { top: true },
          note: `box ${bi + 1} row divider · banding: front`,
          noRotate: true,
        });
      lays.forEach((lay, ci) => {
        if (lay.last) return;
        const dv = mk({
          name: `Vertical divider R${i + 1}C${ci + 1}${bTag}`,
          w: D,
          h: Math.max(20, r.h - S.dividerDeduct),
          material: "plywood",
          thickness: T,
          band: { right: true },
          note: `side depth × row − ${S.dividerDeduct}mm · banding: front`,
        });
        lay.divider = dv;
      });
      lays.forEach((lay, ci) => {
        const faceW = lays.length === 1 ? W : columnFaceWidth(cab, lay, S);
        const tag = `${bTag} R${i + 1}${lays.length > 1 ? `C${ci + 1}` : ""}`;
        buildColumn(cab, S, mk, lay, faceW, r.h, y0, tag, {
          L: sideL,
          R: sideR,
          first: lay.first,
          last: lay.last,
          dividerL: ci > 0 ? lays[ci - 1].divider ?? null : null,
          dividerR: lay.divider ?? null,
          rowY: y0,
          fullH,
          suppressDoor: fullDoorCols.has(ci),
          suppressAllDoors: cabDoor ? true : undefined,
        });
      });
      y0 += r.h;
    });
  });

  // cabinet-level door covering the ENTIRE stack (one long door / door pair)
  if (cabDoor) genCabinetFullDoor(S, mk, cab);
}

function buildColumn(
  cab: Cabinet,
  S: Settings,
  mk: MkFn,
  lay: ColLayout,
  faceW: number,
  rowH: number,
  y0: number,
  tag: string,
  sides: { L: Part; R: Part; first: boolean; last: boolean; dividerL?: Part | null; dividerR?: Part | null; rowY?: number; fullH?: number; suppressDoor?: boolean; suppressAllDoors?: boolean },
) {
  const T = S.bodyThk;
  const col = lay.col;
  const D = carcassDepth(cab, S);
  const hasDr = columnHasDrawers(col);
  const rowY = sides.rowY ?? 0;

  /* ---- column → row split: this column is divided into stacked sub-rows ----
   * Each sub-row can itself hold columns (row → column), giving unlimited
   * row/column nesting in either order.
   */
  const nested = col.rows ?? [];
  if (nested.length > 0) {
    const total = nested.reduce((a, r) => a + r.h, 0) || 1;
    let sy = y0;
    nested.forEach((sub, si) => {
      const subH = (sub.h / total) * rowH; // normalise to the column opening
      // horizontal shelf-divider between stacked sub-rows
      if (si > 0)
        mk({
          name: `Sub row divider${tag}.${si}`,
          w: lay.w,
          h: D,
          material: "plywood",
          thickness: T,
          band: { top: true },
          note: "column → row divider · banding: front",
          grain: true,
          noRotate: true,
        });

      // lay out the columns inside this sub-row across the parent column's width
      const subLays = columnLayoutIn(lay.w, sub.columns, S);
      subLays.forEach((sl, sci) => {
        if (!sl.last)
          mk({
            name: `Sub col divider${tag}.${si + 1}C${sci + 1}`,
            w: D,
            h: Math.max(20, subH - S.dividerDeduct),
            material: "plywood",
            thickness: T,
            band: { right: true },
            note: "row → column divider · banding: front",
            grain: true,
          });
        const subFaceW = subLays.length === 1 ? lay.w : sl.w + T;
        buildColumn(cab, S, mk, sl, subFaceW, subH, sy, `${tag}.${si + 1}${subLays.length > 1 ? `C${sci + 1}` : ""}`, {
          L: sides.L,
          R: sides.R,
          first: sides.first && sl.first,
          last: sides.last && sl.last,
          dividerL: sides.dividerL,
          dividerR: sides.dividerR,
          rowY: sy,
        });
      });
      sy += subH;
    });
    return; // the nested rows fully describe this column
  }
  /** drill both faces bounding this column: outer side panels and/or inner dividers.
   * Hinge holes are NEVER drilled in plywood — the Ø35 cup is bored in the door only. */
  const drillLeft = (x: number, y: number, dia: number, kind: "shelf" | "slide") => {
    if (sides.first) sides.L.holes.push({ x, y, dia, depth: 12, kind });
    else if (sides.dividerL) sides.dividerL.holes.push({ x, y: clamp(y - rowY, 8, sides.dividerL.h - 8), dia, depth: 12, kind });
  };
  const drillRight = (x: number, y: number, dia: number, kind: "shelf" | "slide") => {
    if (sides.last) sides.R.holes.push({ x: D - x, y, dia, depth: 12, kind });
    else if (sides.dividerR) sides.dividerR.holes.push({ x: D - x, y: clamp(y - rowY, 8, sides.dividerR.h - 8), dia, depth: 12, kind });
  };

  /* ---- drawer bank placement (bottom / top / custom) — shelves fill the zone
   * that is left over: ABOVE the bank for bottom & custom, BELOW it for top. ---- */
  const bank = hasDr ? drawerBank(col, rowH, S) : { y: 0, h: 0 };
  const aboveBank = col.drawerAlign !== "top";
  const shelfZoneY = y0 + (aboveBank ? bank.y + bank.h : 0); // shelves start above / below the bank
  const shelfZoneH = Math.max(0, aboveBank ? rowH - bank.y - bank.h : bank.y);

  /* ---- shelves (allowed together with drawers — placed on top) ---- */
  if (col.shelves > 0 && shelfZoneH > 20) {
    const manual = col.shelfMode === "manual" && (col.shelfPositions?.length ?? 0) > 0;
    const positions: number[] = manual
      ? (col.shelfPositions ?? []).slice(0, col.shelves).map((y) => clamp(y, 4, shelfZoneH - 4))
      : Array.from({ length: col.shelves }, (_, k) => shelfZoneH * (k + 1) / (col.shelves + 1));
    const gap = manual ? 0 : shelfGap(shelfZoneH, col.shelves, S);
    mk({
      name: `Shelf${tag}`,
      w: lay.w - S.shelfIncrease,
      h: D - S.shelfFrontSetback,
      qty: col.shelves,
      material: "plywood",
      thickness: T,
      band: { top: true },
      note: manual
        ? `manual Y: ${positions.map((y) => Math.round(y)).join(", ")}mm${hasDr ? (aboveBank ? " · above drawers" : " · below drawers") : ""} · banding: front`
        : `gap ~${Math.round(gap)}mm${hasDr ? (aboveBank ? " · above drawers" : " · below drawers") : ""} · banding: front`,
      grain: true,
      noRotate: true,
    });
    const n = Math.max(1, Math.round(S.shelfHolesPerSide));
    for (let k = 0; k < col.shelves; k++) {
      const sy = shelfZoneY + positions[k];
      for (let j = 0; j < n; j++) {
        const yy = clamp(sy + (j - (n - 1) / 2) * S.shelfHoleSpacing, S.bodyThk + 4, sides.L.h - S.bodyThk - 4);
        [S.shelfHoleCenter, D - S.shelfHoleCenter].forEach((x) => {
          drillLeft(x, yy, S.holeDiameter, "shelf");
          drillRight(x, yy, S.holeDiameter, "shelf");
        });
      }
    }
  }

  /* ---- splitter above the drawer bank ----
   * Emitted when shelves sit above the drawers, or when the user explicitly asks
   * for a splitter (hidden-drawer workflow: splitter + empty space or shelves).
   */
  if (hasDr && shelfZoneH > 20 && (col.shelves > 0 || col.splitter))
    mk({
      name: `Drawer splitter${tag}`,
      w: lay.w,
      h: D,
      material: "plywood",
      thickness: T,
      band: { top: true },
      note: `${aboveBank ? "separates the drawers from the space above" : "separates the drawers from the space below"} · banding: front`,
      grain: true,
      noRotate: true,
    });

  /* ---- shelves that live above an explicit splitter ---- */
  if (hasDr && col.splitter && (col.splitterShelves ?? 0) > 0 && shelfZoneH > 20) {
    const n = Math.max(1, Math.round(col.splitterShelves ?? 0));
    const manual = col.shelfMode === "manual" && (col.shelfPositions?.length ?? 0) > 0;
    const positions: number[] = manual
      ? (col.shelfPositions ?? []).slice(0, n).map((y) => clamp(y, 4, shelfZoneH - 4))
      : Array.from({ length: n }, (_, k) => shelfZoneH * (k + 1) / (n + 1));
    mk({
      name: `Shelf above splitter${tag}`,
      w: lay.w - S.shelfIncrease,
      h: D - S.shelfFrontSetback,
      qty: n,
      material: "plywood",
      thickness: T,
      band: { top: true },
      note: manual
        ? `above drawer splitter · manual Y: ${positions.map((y) => Math.round(y)).join(", ")}mm · banding: front`
        : `above the drawer splitter · gap ~${Math.round(shelfGap(shelfZoneH, n, S))}mm · banding: front`,
      grain: true,
      noRotate: true,
    });
    const per = Math.max(1, Math.round(S.shelfHolesPerSide));
    for (let k = 0; k < n; k++) {
      const sy = shelfZoneY + positions[k];
      for (let j = 0; j < per; j++) {
        const yy = clamp(sy + (j - (per - 1) / 2) * S.shelfHoleSpacing, S.bodyThk + 4, sides.L.h - S.bodyThk - 4);
        [S.shelfHoleCenter, D - S.shelfHoleCenter].forEach((x) => {
          drillLeft(x, yy, S.holeDiameter, "shelf");
          drillRight(x, yy, S.holeDiameter, "shelf");
        });
      }
    }
  }

  /* ---- drawers ---- */
  if (hasDr) {
    col.drawers.forEach((dr0, i) => {
      // kitchen mode has no hidden drawers
      const dr = cab.isKitchen ? { ...dr0, hidden: false } : dr0;
      const pattern =
        cab.isKitchen
          ? (normalizeSlidePatterns(S.slideHolePatterns)["kitchen"] ?? KITCHEN_SLIDE_PATTERN)
          : normalizeSlidePatterns(S.slideHolePatterns)[String(Math.round(dr.slideDepthCm))] ?? getDrawerHolePattern(dr.slideDepthCm);
      // manual per-drawer Y override wins; otherwise the automatic stack rule.
      // Y is measured from the BANK bottom (which itself may be lifted by the
      // column's drawerAlign), so the holes follow the bank wherever it sits.
      const y = clamp(y0 + bank.y + effectiveDrawerHoleY(dr, col.drawers, cab.isKitchen, i, S), 12, sides.L.h - 12);
      pattern.forEach((p) => {
        const xL = D - p; // measured from the front edge
        drillLeft(xL, y, S.slideHoleDiameter, "slide");
        drillRight(xL, y, S.slideHoleDiameter, "slide");
      });
      if (cab.isKitchen) genKitchenDrawer(S, mk, dr, faceW, tag, i);
      else genStandardDrawer(S, mk, dr, faceW, tag, i, cab.width, lay.w, cab);
    });
  }

  /* ---- sub-sections: everything a column can hold EXCEPT a door ---- */
  const subs = col.sub ?? [];
  if (subs.length > 0) {
    const subH = rowH / subs.length;
    subs.forEach((sub, si) => {
      const stag = `${tag}.${si + 1}`;
      if (sub.drawers.length > 0) {
        sub.drawers.forEach((dr, di) => {
          const d2 = cab.isKitchen ? { ...dr, hidden: false } : dr;
          if (cab.isKitchen) genKitchenDrawer(S, mk, d2, lay.w, stag, di);
          else genStandardDrawer(S, mk, d2, lay.w, stag, di, undefined, undefined, cab);
        });
      } else if (sub.fixed) {
        mk({
          name: `Fixed panel${stag}`,
          w: lay.w - 2 * S.doorGap,
          h: subH - S.doorGap,
          material: "mdf",
          thickness: S.mdfThk,
          band: mdfBand(S),
          grain: false,
          note: mdfBanded(S) ? "sub-section MDF oak · banding: LWLW" : "sub-section MDF white · no banding",
        });
      } else if (sub.shelves > 0) {
        mk({
          name: `Shelf${stag}`,
          w: lay.w - S.shelfIncrease,
          h: D - S.shelfFrontSetback,
          qty: sub.shelves,
          material: "plywood",
          thickness: T,
          band: { top: true },
          grain: true,
          noRotate: true,
          note: "sub-section shelf · banding: front",
        });
      }
      // sub-section divider (except after the last one)
      if (si < subs.length - 1)
        mk({
          name: `Sub divider${stag}`,
          w: lay.w,
          h: D,
          material: "plywood",
          thickness: T,
          band: { top: true },
          note: "sub-section divider · banding: front",
          noRotate: true,
        });
    });
  }

  /* ---- door ----
   * A column with hidden (inner) drawers still gets its own MDF door: the hidden fronts
   * are inlaid inside the carcass and the MDF door closes over the whole opening.
   * Sub-sections never carry their own door.
   */
  const allHidden = hasDr && col.drawers.every((d) => d.hidden);
  // Suppress this door if another row/box has a full-height door in the same
  // column index — the full door spans the whole carcass, so per-row doors in
  // that column would otherwise duplicate it (one door per box).
  const suppressed = sides.suppressAllDoors === true || (!!sides.suppressDoor && col.door && !col.door.full);
  if (col.door && !col.fixed && (!hasDr || allHidden) && !suppressed)
    genDoor(S, mk, col.door, faceW, col.door.full && sides.fullH ? sides.fullH : rowH, tag);

  // NOTE: hinge hardware produces NO holes in the plywood side panels — the
  // universal 35mm hinge cup is bored in the DOOR part itself (see genDoor).

  /* ---- fixed panel ---- */
  if (col.fixed)
    mk({
      name: `Fixed panel${tag}`,
      w: faceW - 2 * S.doorGap,
      h: rowH - S.doorGap,
      material: "mdf",
      thickness: S.mdfThk,
      band: mdfBand(S),
      grain: false,
      note: mdfBanded(S) ? "MDF oak · banding: LWLW" : "MDF white · no banding",
    });

  /* ---- decorative MDF back panel (niche back) ----
   * A real MDF part mounted INSIDE the carcass just in front of the veneer back —
   * e.g. a feature/slat panel behind an open vanity niche with a drawer in front.
   * Drawer slide depths are measured from the FRONT edge, so drawers in front of
   * it keep working unchanged.
   */
  if (col.mdfBack) {
    const thk = Math.max(6, col.mdfBackThk || S.mdfThk);
    mk({
      name: `MDF back panel${tag}`,
      w: faceW,
      h: rowH,
      material: "mdf",
      thickness: thk,
      band: {},
      grain: false,
      note: `niche back · ${thk}mm · mounted in front of the back panel (no banding)`,
    });
  }

  /* ---- hanging rail ---- */
  const rail = col.rail ?? "off";

  /* ---- rail bracket pilot holes (rule A) ----
   * One Ø4 (bitDiameter) pilot per rail end — 2 per rail — at the rail CENTER
   * height, drilled into the same faces that carry the shelf pins (outer side
   * panels or the column dividers). They are real drill ops: shown in the
   * Drilling tab and exported to the DXF SHELF_HOLES layer. A "double" rail
   * (suits + dresses) gets one pair per rail. */
  if (rail !== "off") {
    const rh0 = col.railHeight ?? (rail === "suits" ? S.railSuitsH : rail === "dresses" ? S.railDressesH : S.railDouble1);
    const railHeights = rail === "double" ? [rh0, S.railDouble2] : [rh0];
    const railCenterX = D / 2;
    railHeights.forEach((ry) => {
      const yy = clamp(y0 + ry, 8, sides.L.h - 8);
      drillLeft(railCenterX, yy, S.bitDiameter, "shelf");
      drillRight(railCenterX, yy, S.bitDiameter, "shelf");
    });
  }

  /* ---- shelves above the hanging rail (real shelf parts + pin holes) ----
   * AUTO mode (default): the FIRST shelf goes right above the rail — at the
   * railShelfGap offset (60mm default) — and extra shelves fill the remaining
   * space only when it is big enough to keep railShelfMinGap (250mm default)
   * between the rest. MANUAL mode: exact Y positions from the section bottom
   * via shelfPositions (one per shelf). */
  if (rail !== "off" && col.railShelf) {
    const ys = railShelfYs(col, S, rowH);
    if (ys.length > 0) {
      const mode = col.railShelfMode ?? "auto";
      mk({
        name: `Shelf above rail${tag}`,
        w: lay.w - S.shelfIncrease,
        h: D - S.shelfFrontSetback,
        qty: ys.length,
        material: "plywood",
        thickness: T,
        band: { top: true },
        note:
          mode === "manual"
            ? `above ${rail} rail · manual Y: ${ys.map((y) => Math.round(y)).join(", ")}mm · banding: front`
            : `above ${rail} rail · auto ${ys.length} shelf${ys.length > 1 ? "s" : ""} (first @ rail +${Math.round(Math.max(10, Math.min(150, S.railShelfGap || 60)))}mm, rest ≥ ${Math.max(50, S.railShelfMinGap || 250)}mm) · banding: front`,
        grain: true,
        noRotate: true,
      });
      const n = Math.max(1, Math.round(S.shelfHolesPerSide));
      for (const y of ys) {
        for (let j = 0; j < n; j++) {
          const yy = clamp(y0 + y + (j - (n - 1) / 2) * S.shelfHoleSpacing, S.bodyThk + 4, y0 + rowH - S.bodyThk - 4);
          [S.shelfHoleCenter, D - S.shelfHoleCenter].forEach((x) => {
            drillLeft(x, yy, S.holeDiameter, "shelf");
            drillRight(x, yy, S.holeDiameter, "shelf");
          });
        }
      }
    }
  }
}

/**
 * Y positions (mm from the SECTION BOTTOM) of the shelves above a hanging rail
 * (rule D). Shared by the part generator, the 2D front view and the 3D scene
 * so previews always match the cut list.
 *  · manual — exact `shelfPositions` (clamped into the space above the rail)
 *  · auto   — the FIRST shelf goes right above the rail at the railShelfGap
 *    offset (60mm default) WITH its pin holes, then extra shelves are added
 *    only when the REMAINING space is big enough to keep railShelfMinGap
 *    (250mm default) between them. The leftovers spread evenly, so every gap
 *    except the fixed 60mm one still respects the minimum.
 */
export function railShelfYs(col: ColumnSpec, S: Settings, rowH: number): number[] {
  const rail = col.rail ?? "off";
  if (rail === "off" || !col.railShelf) return [];
  const rh = col.railHeight ?? (rail === "suits" ? S.railSuitsH : rail === "dresses" ? S.railDressesH : S.railDouble1);
  const space = Math.max(0, rowH - rh);
  const lo = rh + 10;
  const hi = Math.max(lo, rowH - 10);
  if ((col.railShelfMode ?? "auto") === "manual" && (col.shelfPositions?.length ?? 0) > 0) {
    const count = Math.max(1, Math.round(col.railShelfCount ?? (col.shelfPositions?.length ?? 1)));
    return (col.shelfPositions ?? []).slice(0, count).map((y) => clamp(y, lo, hi));
  }
  // 60mm-first rule: pin the first shelf just above the rail, then fill the
  // rest only if the space is big enough for the minimum gap
  const firstGap = Math.max(10, Math.min(150, S.railShelfGap || 60));
  if (space < firstGap + 40) return [];
  const firstY = Math.min(rh + firstGap, hi);
  const rest = Math.max(0, rowH - firstY);
  const minGap = Math.max(50, S.railShelfMinGap || 250);
  // gaps needed between firstY and the section top: k shelves → k+1 gaps
  let extras = Math.max(0, Math.floor(rest / minGap) - 1);
  if (extras === 0 && rest >= minGap * 1.5) extras = 1;
  const n = 1 + extras;
  if (n === 1) return [firstY];
  // extras spread evenly over the remaining height (first shelf stays pinned)
  return Array.from({ length: n }, (_, k) => (k === 0 ? firstY : firstY + (rest * k) / n));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/* ---- standard drawer ---- */
/* hidden-drawer front rules are configurable (57 new rule / 90 legacy, inlay 50mm) */

function genStandardDrawer(
  S: Settings,
  mk: MkFn,
  dr: { frontHeight: number; hidden: boolean; slideDepthCm: number; frontMdf?: boolean },
  faceW: number,
  tag: string,
  i: number,
  cabOuterW?: number,
  sectionW?: number,
  cab?: Cabinet,
) {
  const { boxD, sideH, fbH, slideMm } = drawerBoxDims(faceW, dr, S);
  const dt = S.drawerThk;
  const label = dr.hidden ? "Hidden drawer" : "Drawer";
  const secW = sectionW ?? faceW;
  const outerW = cabOuterW ?? faceW;

  // ---- front (MDF) ----
  // No MDF front is generated for ANY drawer unless the user enables "Front MDF".
  if (dr.frontMdf) {
    if (dr.hidden) {
      // inlaid inside the carcass: width = section width − hiddenFrontDeduct
      mk({
        name: `${label} front${tag} #${i + 1}`,
        w: Math.max(60, secW - S.hiddenFrontDeduct),
        h: dr.frontHeight - S.doorGap,
        material: "mdf",
        thickness: S.mdfThk,
        band: mdfBand(S),
        grain: false,
        note: `inlaid ${S.hiddenFrontInset}mm inside · section width − ${S.hiddenFrontDeduct} · ${mdfBanded(S) ? "MDF oak · banding: LWLW" : "MDF white · no banding"}`,
      });
    } else {
      // visible front sits ON the overlay plane (flush with doors)
      mk({
        name: `${label} front${tag} #${i + 1}`,
        w: faceW - 2 * S.doorGap,
        h: dr.frontHeight - S.doorGap,
        material: "mdf",
        thickness: S.mdfThk,
        band: mdfBand(S),
        grain: false,
        note: `overlay front · ${slideMm}mm slide · ${mdfBanded(S) ? "MDF oak · banding: LWLW" : "MDF white · no banding"}`,
      });
    }
  }

  // box sides (left + right plywood sliders) — 5.7mm groove, always 20mm SHORTER
  // than the slider so it stops short of both ends (10mm inset each side).
  const grooveLen = Math.max(20, boxD - S.grooveShorter);
  const gInset = (boxD - grooveLen) / 2;
  const side = mk({
    name: `${label} side${tag} #${i + 1}`,
    w: boxD,
    h: sideH,
    qty: 2,
    material: "plywood",
    thickness: dt,
    band: { top: true },
    note: `groove ${S.grooveWidth}mm × ${Math.round(grooveLen)}mm (slider ${Math.round(boxD)}mm − ${S.grooveShorter}) @ ${S.grooveFromBottom}mm from bottom`,
  });
  // rectangle pocket: grooveLen × 5.7mm, centred along the slider
  const gy = S.grooveFromBottom;
  side.grooves.push({ x1: gInset, y1: gy, x2: gInset + grooveLen, y2: gy + S.grooveWidth, width: S.grooveWidth });

  // plywood box front/back = cabinet OUTER width − 33 − 49 (− 50 more when hidden)
  const fbW = Math.max(60, outerW - S.drawerBoxFrontDeduct - S.drawerBoxBackDeduct - (dr.hidden ? S.drawerBoxHiddenExtra : 0));
  const back = mk({
    name: `${label} box back${tag} #${i + 1}`,
    w: fbW,
    h: fbH,
    material: "plywood",
    thickness: dt,
    note: `outer width − ${S.drawerBoxFrontDeduct} − ${S.drawerBoxBackDeduct}${dr.hidden ? ` − ${S.drawerBoxHiddenExtra} (hidden)` : ""}`,
  });
  // 6mm corner connector holes
  back.holes.push({ x: 7, y: 7, dia: 6, depth: dt, kind: "shelf" });
  back.holes.push({ x: fbW - 7, y: 7, dia: 6, depth: dt, kind: "shelf" });
  mk({
    name: `${label} box front${tag} #${i + 1}`,
    w: fbW,
    h: fbH,
    material: "plywood",
    thickness: dt,
    note: `outer width − 33 − 49${dr.hidden ? " − 50 (hidden)" : ""}`,
  });
  // drawer bottom = veneer that FOLLOWS the cabinet's plywood material (an oak
  // cabinet gets oak drawer bottoms, a white cabinet white ones) — exactly
  // like the cabinet back panel, so nesting groups and 3D color match.
  const cabinetPly = cab ? plyMaterialOf(S, cab) : plyMaterialById(S, null);
  const botW = fbW + 18;
  mk({
    name: `${label} bottom${tag} #${i + 1}`,
    w: botW,
    h: boxD,
    material: "back",
    thickness: S.backThk,
    matId: cabinetPly.id,
    grain: cabinetPly.solid !== true,
    note: `veneer drawer bottom · follows ${cabinetPly.name}${cabinetPly.solid !== true ? " · grain locked" : ""}`,
  });
}

/* ---- kitchen drawer ---- */
function genKitchenDrawer(
  S: Settings,
  mk: MkFn,
  dr: { frontHeight: number; hidden: boolean; frontMdf?: boolean },
  faceW: number,
  tag: string,
  i: number,
) {
  const label = dr.hidden ? "Hidden kitchen drawer" : "Kitchen drawer";
  // MDF front only when the user explicitly enables it
  if (dr.frontMdf)
    mk({
      name: `${label} front${tag} #${i + 1}`,
      w: faceW - 2 * S.doorGap,
      h: dr.frontHeight - S.doorGap,
      material: "mdf",
      thickness: S.mdfThk,
      band: mdfBand(S),
      grain: false,
      note: `${dr.hidden ? `inlaid ${S.hiddenFrontInset}mm inside` : "overlay front"} · kitchen · ${mdfBanded(S) ? "MDF oak · banding: LWLW" : "MDF white · no banding"}`,
    });
  mk({
    name: `${label} bottom${tag} #${i + 1}`,
    w: Math.max(120, faceW - 108 - (dr.hidden ? 50 : 0)),
    h: 495,
    material: "plywood",
    thickness: S.bodyThk,
    grain: false,
    note: `forced ${KITCHEN_SLIDE_CM * 10}mm slide`,
  });
  mk({
    name: `${label} back${tag} #${i + 1}`,
    w: Math.max(120, faceW - 120 - (dr.hidden ? 50 : 0)),
    h: dr.frontHeight <= 200 ? 68 : 183,
    material: "plywood",
    thickness: S.bodyThk,
  });
}

/* ---- cabinet-level full door for STACKED (boxed) cabinets ----
 * Chosen from the "Boxes" control — one door (or a door pair when the cabinet
 * is wide) covering the WHOLE cabinet across all boxes. Hinge count comes from
 * `fullDoorHinges` (auto by height when unset). Glass → hardware/render only.
 */
function genCabinetFullDoor(S: Settings, mk: MkFn, cab: Cabinet) {
  const fd = cab.fullDoor;
  if (!fd || fd === "off") return;
  const kick = kickH(cab, S);
  const BH = cab.height - kick;
  const raw = fd as string;
  const isGlass = raw.startsWith("glass");
  const suffix = raw.includes("-") ? raw.split("-")[1] : "";
  const type: DoorSpec["type"] = suffix === "double" ? "double" : suffix === "left" || suffix === "right" ? "single" : (cab.width > 620 ? "double" : "single");
  const swing: DoorSpec["swing"] = suffix === "right" ? "right" : "left";
  const door: DoorSpec = {
    type,
    style: "overlay",
    swing,
    material: isGlass ? "glass" : "mdf",
    finish: S.mdfFinish,
    mdfThk: S.mdfThk,
    hingeBrand: "Universal 35mm",
    hasHandle: true,
    handlePos: "center",
    full: true,
    hingeCount: cab.fullDoorHinges,
    hOverride: cab.fullDoorHOverride != null && cab.fullDoorHOverride > 0 ? cab.fullDoorHOverride : undefined,
    wOverride: cab.fullDoorWOverride != null && cab.fullDoorWOverride > 0 ? cab.fullDoorWOverride : undefined,
  };
  genDoor(S, mk, door, cab.width, BH, " CABINET");
}

/* ---- doors (no drilling — hinges/handles are hardware only) ----
 * Glass / aluminum doors produce NO cut part (purchased hardware), but keep the
 * hinge/handle info and still render in the 2D + 3D views.
 * A door flagged `full` spans the WHOLE carcass height (all rows / boxes). */

/**
 * Hinge-cup Y positions (mm from the door BOTTOM) for a leaf `dh` mm tall
 * (rule E): first cup 140mm up, last cup 140mm down, extras evenly in
 * between. Very short leaves (<300mm) fall back to 25% of the height so the
 * cups stay inside the door.
 */
export function hingeCupYs(dh: number, nHinges: number): number[] {
  const ys: number[] = [];
  const cupIn = dh >= 300 ? 140 : Math.max(20, Math.round(dh * 0.25));
  for (let k = 0; k < nHinges; k++) ys.push(nHinges === 1 ? dh / 2 : cupIn + (k * (dh - 2 * cupIn)) / (nHinges - 1));
  return ys;
}

/**
 * Reference parts for GLASS doors (rule H): glass doors buy in aluminum +
 * glass (no cut part), but the operator still needs the hinge-cup positions.
 * One reference part per leaf, flagged `reference: true` — rendered DASHED
 * ("not drilled") in the Drilling tab and as a text note in the DXF, and
 * excluded from drilling CSVs.
 */
export function glassDoorRefs(cabs: Cabinet[], S: Settings): Part[] {
  const out: Part[] = [];
  cabs.forEach((cab) => {
    const kick = kickH(cab, S);
    const stacked = stackOn(cab);
    const heights = stacked ? stackedHeights(cab) : [cab.height];
    const fullH = heights.reduce((a, h) => a + h, 0) - kick; // full-door span (all boxes)
    // cabinet-level FULL glass door (glass / glass-left / glass-right /
    // glass-double from the Boxes control) — same variant parsing as
    // genCabinetFullDoor, so the DXF GLASS DOOR REF matches the BOM count.
    // Only STACKED cabinets have a cabinet-level door (buildStackedBody).
    const fd = cab.fullDoor;
    if (stacked && fd && fd.startsWith("glass") && fd !== "off") {
      const suffix = fd.includes("-") ? fd.split("-")[1] : "";
      const type: DoorSpec["type"] = suffix === "double" ? "double" : suffix === "left" || suffix === "right" ? "single" : cab.width > 620 ? "double" : "single";
      const swing: DoorSpec["swing"] = suffix === "right" ? "right" : "left";
      const dims = doorDims(
        cab.width,
        fullH,
        { type, style: "overlay", swing, material: "glass", mdfThk: S.mdfThk, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", full: true, hingeCount: cab.fullDoorHinges } as DoorSpec,
        S,
      );
      const nHinges = Math.min(6, Math.max(1, cab.fullDoorHinges ?? doorHingeCount(dims.h)));
      const cupYs = hingeCupYs(dims.h, nHinges);
      const wR = Math.max(5, Math.round(dims.w * 10) / 10);
      for (let j = 0; j < dims.count; j++) {
        const hingedLeft = dims.count === 1 ? swing === "left" : j === 0;
        out.push({
          cabId: cab.id,
          cabName: `${cab.name}_${Math.round(cab.width)}x${Math.round(cab.height)}`,
          name: `Glass full door${dims.count === 2 ? (j === 0 ? " L" : " R") : ""} (reference)`,
          w: wR,
          h: Math.max(5, Math.round(dims.h * 10) / 10),
          qty: 1,
          material: "glass",
          thickness: 0,
          band: {},
          holes: cupYs.map((y) => ({ x: hingedLeft ? S.hingeCupEdge : wR - S.hingeCupEdge, y, dia: S.hingeCupDiameter, depth: S.hingeCupDepth, kind: "hinge" as const })),
          grooves: [],
          shape: "rect",
          outline: [],
          grain: false,
          note: `REFERENCE — full-cabinet glass door, NOT drilled here · ${nHinges} × Ø${S.hingeCupDiameter} cups · drill the glass at these positions`,
          reference: true,
        });
      }
      // a cabinet-level full door suppresses every per-section door — do not
      // emit per-column references for the same opening
      return;
    }
    heights.forEach((_bh, bi) => {
      const rowsForBox = stacked ? cab.rows.filter((r) => (r.box ?? 0) === bi) : cab.rows;
      rowsForBox.forEach((r) => {
        const lays = columnLayout(cab, r, S);
        lays.forEach((lay, ci) => {
          const col = lay.col;
          const door = col.door;
          // SAME suppression as the part generator (buildColumn): a column
          // with visible drawers (or a fixed panel) has NO door, so no glass
          // reference and no hinge cups either — otherwise the BOM would list
          // hinges for a door that does not exist
          const hasDr = columnHasDrawers(col);
          const allHidden = hasDr && col.drawers.every((d) => d.hidden);
          if (door && door.material === "glass" && (col.rows ?? []).length === 0 && door.type !== "sliding"
            && !col.fixed && (!hasDr || allHidden)) {
            const faceW = lays.length === 1 ? cab.width : columnFaceWidth(cab, lay, S);
            const leafH = door.full ? fullH : r.h;
            const tag = lays.length > 1 ? ` · ${cab.name} C${ci + 1}` : "";
            const { w: dw, h: dh, count } = doorDims(faceW, leafH, door, S);
            const nHinges = effectiveHingeCount(door, dh);
            const cupYs = hingeCupYs(dh, nHinges);
            const wR = Math.max(5, Math.round(dw * 10) / 10);
            for (let j = 0; j < count; j++) {
              const hingedLeft = count === 1 ? door.swing === "left" : j === 0;
              out.push({
                cabId: cab.id,
                cabName: `${cab.name}_${Math.round(cab.width)}x${Math.round(cab.height)}`,
                name: `Glass door${tag}${count === 2 ? (j === 0 ? " L" : " R") : ""} (reference)`,
                w: wR,
                h: Math.max(5, Math.round(dh * 10) / 10),
                qty: 1,
                material: "glass",
                thickness: 0,
                band: {},
                holes: cupYs.map((y) => ({ x: hingedLeft ? S.hingeCupEdge : wR - S.hingeCupEdge, y, dia: S.hingeCupDiameter, depth: S.hingeCupDepth, kind: "hinge" as const })),
                grooves: [],
                shape: "rect",
                outline: [],
                grain: false,
                note: `REFERENCE — glass door, NOT drilled here · ${nHinges} × Ø${S.hingeCupDiameter} cups · drill the glass at these positions`,
                reference: true,
              });
            }
          }
        });
      });
    });
  });
  return out;
}

function genDoor(S: Settings, mk: MkFn, door: DoorSpec, faceW: number, rowH: number, tag: string) {
  if (door.material === "glass") return; // aluminum + glass — purchased, nothing to cut
  const { w: dw, h: dh, count } = doorDims(faceW, rowH, door, S);
  const { mat, thk } = doorMaterial(door, S);
  const matNote = door.material === "mdf" ? `MDF ${thk}mm` : `Plywood ${thk}mm`;
  const fullNote = door.full ? " · FULL HEIGHT (spans all boxes)" : "";
  const finish = door.material === "mdf" ? (door.finish ?? S.mdfFinish) : "white";
  // banding rule: plywood always banded · MDF banded only when oak
  const band: Banding = door.material === "mdf" ? mdfBand(S, finish) : { top: true, bottom: true, left: true, right: true };
  const finishNote = door.material === "mdf" ? (finish === "oak" ? " · MDF oak · banding: LWLW" : " · MDF white · no banding") : " · banding: LWLW";
  // universal 35mm hinge — cups are bored in the DOOR (never the side panels)
  const nHinges = effectiveHingeCount(door, dh);
  // hinge Y positions from the door bottom (rule E) — see hingeCupYs()
  const cupYs = hingeCupYs(dh, nHinges);
  // cup X: on the hinged edge of each leaf (L leaf → left edge, R leaf → right edge)
  const cupX = (j: number) => {
    const hingedLeft = count === 1 ? door.swing === "left" : j === 0;
    return hingedLeft ? S.hingeCupEdge : dw - S.hingeCupEdge;
  };
  // door grain locks along its height (vertical), so the nester never rotates it
  const grain = mat === "plywood" || (mat === "mdf" && finish === "oak");

  for (let j = 0; j < count; j++) {
    const nm =
      door.type === "sliding"
        ? `Sliding door${tag} #${j + 1}`
        : `Door${tag}${count === 2 ? (j === 0 ? " L" : " R") : ""}`;
    const holes = cupYs.map((y) => ({ x: cupX(j), y, dia: S.hingeCupDiameter, depth: S.hingeCupDepth, kind: "hinge" as const }));
    mk({
      name: nm,
      w: dw,
      h: dh,
      material: mat,
      thickness: thk,
      band,
      grain,
      holes,
      note: `${door.style} · ${matNote}${nHinges ? ` · ${nHinges}× Universal 35mm hinge Ø${S.hingeCupDiameter} cup` : " · sliding track"}${finishNote}${fullNote}`,
    });
  }
}

/* ---- corner ---- */
function buildCorner(cab: Cabinet, S: Settings, mk: MkFn, T: number) {
  const kick = kickH(cab, S);
  const BH = cab.height - kick;
  const W = cab.width;
  const D = cab.depth;
  const K = Math.min(220, Math.round(Math.min(W, D) * 0.32));
  const Ld = Math.round(Math.hypot(W - K, D - K));

  mk({ name: "Back panel R (wall)", w: W, h: BH, material: "plywood", thickness: T, band: { top: true } });
  mk({ name: "Back panel L (wall)", w: D, h: BH, material: "plywood", thickness: T, band: { top: true } });
  const bot = mk({ name: "Bottom (pentagon)", w: W, h: D, material: "plywood", thickness: T, grain: false, note: "5-sided" });
  bot.shape = "poly";
  bot.outline = pentagonOutline(W, D, K);
  if (cab.type === "cornerWall") {
    const top = mk({ name: "Top (pentagon)", w: W, h: D, material: "plywood", thickness: T, grain: false, note: "5-sided" });
    top.shape = "poly";
    top.outline = pentagonOutline(W, D, K);
  }
  if (kick) {
    mk({
      name: "Toe kick front",
      w: Ld - 20,
      h: S.kickHeight,
      material: "plywood",
      thickness: T,
      matId: defaultPlyId(S),
      note: "no banding — matches standard kick",
    });
    mk({
      name: "Toe kick side",
      w: Math.max(20, D - S.kickDepth),
      h: S.kickHeight,
      qty: 2,
      material: "plywood",
      thickness: T,
      matId: defaultPlyId(S),
      note: "full-depth side",
    });
  }

  cab.rows.forEach((row, ri) => {
    const col = row.columns[0];
    if (!col) return;
    if (col.shelves > 0 && !columnHasDrawers(col)) {
      const sh = mk({
        name: `Corner shelf R${ri + 1}`,
        w: W - 2 * T - 4,
        h: D - 2 * T - 4,
        qty: col.shelves,
        material: "plywood",
        thickness: T,
        grain: false,
        note: "5-sided",
      });
      sh.shape = "poly";
      sh.outline = pentagonOutline(sh.w, sh.h, K);
    }
    if (col.door) genDoor(S, mk, col.door, Ld, row.h, ` R${ri + 1}`);
    if (columnHasDrawers(col)) col.drawers.forEach((dr, i) => genStandardDrawer(S, mk, dr, Ld, ` R${ri + 1}`, i, undefined, undefined, cab));
  });
}

/* ================= merging ================= */

function partKey(p: Part): string {
  const hs = p.holes.map((h) => `${r2(h.x)},${r2(h.y)},${r2(h.dia)},${h.kind}`).join(";");
  const gs = p.grooves.map((g) => `${r2(g.x1)},${r2(g.y1)},${r2(g.x2)},${r2(g.y2)}`).join(";");
  const ol = p.outline.map(([x, y]) => `${r2(x)},${r2(y)}`).join(";");
  // matId splits plywood into per-material groups (default plywood = "")
  return [p.name, p.cabName, r2(p.w), r2(p.h), p.material, p.matId ?? "", p.thickness, p.shape, ol, bandStr(p.band), p.note, hs, gs].join("|");
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function mergePieces(parts: Part[]): Part[] {
  const map = new Map<string, Part>();
  parts.forEach((p) => {
    const k = partKey(p);
    const ex = map.get(k);
    if (ex) ex.qty += p.qty;
    else map.set(k, { ...p });
  });
  return [...map.values()];
}

/**
 * 90° clockwise rotation of ONE part: length and width are swapped, and holes,
 * grooves, outlines and band edges are transformed through the SAME map
 * ((x,y) → (y,w−x)) so every feature stays glued to its physical edge:
 * a point on the old TOP edge (y=h) lands on x′=h=new width, i.e. the new
 * RIGHT edge — so Top→Right, Right→Bottom, Bottom→Left, Left→Top.
 * (The inverse map put every banding marker on the OPPOSITE edge — visible on
 * drawer cabinets where the slide holes expose the true front edge, and it
 * made the linear slot look rear-mounted.)
 */
function rotate90(p: Part, noteSuffix: string): Part {
  const w = p.w;
  const rot = ([x, y]: [number, number]): [number, number] => [y, w - x];
  return {
    ...p,
    w: p.h,
    h: p.w,
    band: { top: p.band.left, right: p.band.top, bottom: p.band.right, left: p.band.bottom },
    holes: p.holes.map((h) => {
      const [x, y] = rot([h.x, h.y]);
      return { ...h, x, y };
    }),
    grooves: p.grooves.map((g) => {
      const [x1, y1] = rot([g.x1, g.y1]);
      const [x2, y2] = rot([g.x2, g.y2]);
      return { ...g, x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
    }),
    outline: p.outline.length > 2 ? p.outline.map(rot) : p.outline,
    note: p.note ? `${p.note} · ${noteSuffix}` : noteSuffix,
  };
}

/**
 * Every piece is rotated ONCE automatically for the cut list: length and width are
 * swapped (with holes, grooves and outlines transformed to match). This happens
 * regardless of the grain-lock state; grain lock is then applied on top and governs
 * whether the nesting optimizer may rotate the piece any further.
 * Span panels (tops / bottoms / shelves / sections / splitters) and backs carry
 * `noRotate` — they are generated grain-along-Length already, so rotating them
 * would turn their locked grain 90° off (and waste sheets in nesting).
 */
export function rotatePartOnce(p: Part): Part {
  if (p.noRotate) return p;
  return rotate90(p, "rotated 90°");
}

/**
 * The user's MANUAL 90° rotation from the cut list (any piece, on top of the
 * automatic rotation). Applied BEFORE grain lock and merging, so nesting, DXF,
 * drilling and the reports all see the rotated piece — exactly what the
 * cut list shows. Unlike the automatic pass it honors no `noRotate` flag:
 * an explicit user rotation always wins.
 */
export function rotatePartManual(p: Part): Part {
  return rotate90(p, "manual 90°");
}

/** grain overrides: partId -> locked(true = no rotation) */
export type GrainOverrides = Record<string, boolean>;

/** manual 90° rotation overrides from the cut list: canonicalPartId -> rotated */
export type RotationOverrides = Record<string, boolean>;

/** apply the system grain-lock plus any manual per-piece overrides */
export function applyGrain(parts: Part[], S: Settings, ov: GrainOverrides = {}): Part[] {
  return parts.map((p) => {
    // new keys are rotation-invariant (canonical); the oriented partId is still
    // honored so overrides saved by older versions keep working
    const id = partId(p);
    const cid = canonicalPartId(p);
    const locked = id in ov ? ov[id] : cid in ov ? ov[cid] : S.grainLock ? true : p.grain;
    return { ...p, grain: locked };
  });
}

/** apply the cut-list manual 90° rotation overrides (keyed by canonical id) */
export function applyManualRotation(parts: Part[], rot: RotationOverrides = {}): Part[] {
  if (!rot || Object.keys(rot).length === 0) return parts;
  return parts.map((p) => (rot[canonicalPartId(p)] ? rotatePartManual(p) : p));
}

/**
 * Raw project panels (PanelItem — "Add panel" feature): real cut parts that sit
 * OUTSIDE any cabinet (an oak MDF panel, a plyboard panel, any user rectangle).
 * They flow through the cut list, nesting, DXF and BOM exactly like cabinet
 * parts, but have no rows / columns / drawers / doors — just one piece.
 *
 * Rules:
 *  · thickness 0 = auto → plywood: bodyThk (16.5) · MDF: mdfThk (19) · back: backThk (5)
 *  · MDF banding follows the finish (oak = banded, white = none); plywood is banded
 *  · grain lock: plywood always; MDF only when oak (or an explicit PanelItem.grain)
 */
export function generatePanelParts(panels: PanelItem[], S: Settings): Part[] {
  const out: Part[] = [];
  for (const pn of panels ?? []) {
    if (!pn || !(pn.w > 0) || !(pn.h > 0)) continue;
    const mat = pn.material ?? "plywood";
    const autoThk = mat === "mdf" ? S.mdfThk : mat === "back" ? S.backThk : S.bodyThk;
    const thk = pn.thk > 0 ? Math.round(pn.thk * 10) / 10 : autoThk;
    const finish: MdfFinish = mat === "mdf" ? (pn.finish ?? S.mdfFinish) : "white";
    const grain = pn.grain ?? (mat === "plywood" || finish === "oak");
    out.push({
      cabId: `panel:${pn.id}`,
      cabName: "Panel",
      name: (pn.name || "Panel").trim() || "Panel",
      w: Math.max(5, Math.round(pn.w * 10) / 10),
      h: Math.max(5, Math.round(pn.h * 10) / 10),
      qty: 1,
      material: mat,
      thickness: thk,
      // panels may pick ANY plywood material (matId); undefined = project default →
      // nesting groups it as "def" (the default-plywood group)
      matId: mat === "plywood" ? (pn.matId ?? undefined) : undefined,
      band: mat === "plywood" ? { top: true, bottom: true, left: true, right: true } : mat === "mdf" ? mdfBand(S, finish) : {},
      holes: [],
      grooves: [],
      shape: "rect",
      outline: [],
      grain,
      note:
        mat === "mdf"
          ? `raw panel · MDF ${thk}mm · ${finish === "oak" ? "oak · banding: LWLW" : "white · no banding"}`
          : mat === "back"
            ? `raw panel · veneer ${thk}mm`
            : `raw panel · plywood ${thk}mm · banding: LWLW`,
    });
  }
  return out;
}

export function allParts(
  cabs: Cabinet[],
  S: Settings,
  ov: GrainOverrides = {},
  panels: PanelItem[] = [],
  rot: RotationOverrides = {},
): Part[] {
  // panels are top-level project parts (oak MDF panel, plyboard panel, etc.) that sit
  // outside any cabinet — they flow through cut list / nesting / DXF / BOM like cabinet parts.
  const panelParts = generatePanelParts(panels, S).map(rotatePartOnce);
  const rotated = cabs.flatMap((c) => generateCabinetParts(c, S)).map(rotatePartOnce);
  // manual cut-list 90° rotation goes BEFORE grain lock and merging, so every
  // downstream consumer (cut list merge, nesting, DXF, drilling, reports)
  // sees the rotated piece exactly as the user chose it
  return applyGrain(applyManualRotation([...panelParts, ...rotated], rot), S, ov);
}
export function allPartsMerged(
  cabs: Cabinet[],
  S: Settings,
  ov: GrainOverrides = {},
  panels: PanelItem[] = [],
  rot: RotationOverrides = {},
): Part[] {
  return mergePieces(allParts(cabs, S, ov, panels, rot));
}

/* ================= drilling ================= */

export interface DrillOp {
  cabName: string;
  part: string;
  material: string;
  instance: number;
  x: number;
  y: number;
  dia: number;
  depth: number;
  type: string;
}

export function drillOps(
  cabs: Cabinet[],
  S: Settings,
  ov: GrainOverrides = {},
  panels: PanelItem[] = [],
  rot: RotationOverrides = {},
): DrillOp[] {
  const ops: DrillOp[] = [];
  allParts(cabs, S, ov, panels, rot).forEach((p) => {
    for (let i = 0; i < p.qty; i++) {
      p.holes.forEach((h) =>
        ops.push({ cabName: p.cabName, part: p.name, material: p.material, instance: i + 1, x: h.x, y: h.y, dia: h.dia, depth: h.depth, type: h.kind }),
      );
      p.grooves.forEach((g) =>
        ops.push({ cabName: p.cabName, part: p.name, material: p.material, instance: i + 1, x: -1, y: g.y1, dia: g.width, depth: 8, type: g.kind === "slot" ? "slot" : "groove" }),
      );
    }
  });
  return ops;
}

export function totalBandingM(
  cabs: Cabinet[],
  S: Settings,
  ov: GrainOverrides = {},
  panels: PanelItem[] = [],
  rot: RotationOverrides = {},
): number {
  let band = 0;
  allParts(cabs, S, ov, panels, rot).forEach((p) => {
    band += ((p.band.top ? p.w : 0) + (p.band.bottom ? p.w : 0) + (p.band.left ? p.h : 0) + (p.band.right ? p.h : 0)) * p.qty;
  });
  return band / 1000;
}

export interface BandingByMaterialRow {
  /** material name — e.g. "Plywood White", "Oak Plywood", "MDF Oak" (white MDF never appears) */
  material: string;
  mm: number;
  meters: number;
  isPlywood: boolean;
  matId: string | null;
}

/**
 * Edge banding meters broken down PER MATERIAL, named after the material:
 * plywood rows use the plywood material's user name; MDF rows are split by
 * finish — "MDF Oak" (banded) only, since white MDF is never banded.
 */
export function bandingByMaterial(
  cabs: Cabinet[],
  S: Settings,
  ov: GrainOverrides = {},
  panels: PanelItem[] = [],
  rot: RotationOverrides = {},
): BandingByMaterialRow[] {
  const agg = new Map<string, { mm: number; matId: string | null; isPlywood: boolean }>();
  allParts(cabs, S, ov, panels, rot).forEach((p) => {
    const mm = ((p.band.top ? p.w : 0) + (p.band.bottom ? p.w : 0) + (p.band.left ? p.h : 0) + (p.band.right ? p.h : 0)) * p.qty;
    if (mm <= 0) return;
    let key: string;
    let isPlywood = false;
    let matId: string | null = null;
    if (p.material === "plywood") {
      const pm = plyMaterialById(S, p.matId ?? null);
      key = pm.name;
      isPlywood = true;
      matId = pm.id;
    } else if (p.material === "mdf") {
      const banded = p.band.top || p.band.bottom || p.band.left || p.band.right;
      if (!banded) return; // white MDF — never banded
      key = "MDF Oak";
    } else {
      return; // veneer back is never banded
    }
    const cur = agg.get(key) ?? { mm: 0, matId, isPlywood };
    cur.mm += mm;
    agg.set(key, cur);
  });
  return [...agg.entries()]
    .map(([material, v]) => ({ material, mm: v.mm, meters: v.mm / 1000, isPlywood: v.isPlywood, matId: v.matId }))
    .sort((a, b) => b.mm - a.mm);
}

/* ================= validation ================= */

export function validateCabinet(c: Cabinet, S: Settings): { level: "err" | "warn"; msg: string }[] {
  const out: { level: "err" | "warn"; msg: string }[] = [];
  const BH = boxHeight(c, S);
  const sum = c.rows.reduce((a, r) => a + r.h, 0);
  if (stackOn(c)) {
    // stacked boxes: each box's rows must sum to its own carcass height
    const heights = stackedHeights(c);
    if (Math.abs(stackTotal(c) - c.height) > 0.5)
      out.push({ level: "err", msg: `Boxes Σ ${Math.round(stackTotal(c))}mm ≠ cabinet height ${Math.round(c.height)}mm` });
    heights.forEach((bh, bi) => {
      const bsum = c.rows.filter((r) => (r.box ?? 0) === bi).reduce((a, r) => a + r.h, 0);
      const target = bi === 0 ? bh - kickH(c, S) : bh;
      if (Math.abs(bsum - target) > 0.5)
        out.push({
          level: "err",
          msg: `Box ${bi + 1}: rows Σ ${Math.round(bsum)}mm ≠ box ${Math.round(target)}mm = ${Math.round(Math.abs(target - bsum))}mm ${bsum < target ? "missing" : "over"}`,
        });
    });
    if (c.rows.some((r) => (r.box ?? 0) >= heights.length))
      out.push({ level: "err", msg: "A row is assigned to a box that no longer exists" });
  } else if (Math.abs(sum - BH) > 0.5) {
    const diff = Math.round(Math.abs(BH - sum));
    const dir = sum < BH ? "missing" : "over";
    out.push({ level: "err", msg: `Row heights Σ ${Math.round(sum)}mm ≠ box height ${Math.round(BH)}mm = ${diff}mm ${dir}` });
  }
  if (c.width <= 0 || c.height <= 0 || c.depth <= 0) out.push({ level: "err", msg: "Dimensions must be greater than zero" });
  if (c.rows.length === 0) out.push({ level: "warn", msg: "No rows defined — empty carcass" });
  if (isNotched(c.type)) {
    if (c.type === "L" && (c.lCutW <= 0 || c.lCutH <= 0)) out.push({ level: "warn", msg: "L notch is zero — panel will be a plain rectangle" });
    if (c.type === "C" && c.cCutOffsetFromBottom + c.cCutMidH > BH - c.cCutTopH)
      out.push({ level: "warn", msg: "C mid notch overlaps the top notch — it will be clipped" });
  }
  if ((c.slot ?? "none") !== "none" && (isCorner(c.type) || isNotched(c.type)))
    out.push({ level: "warn", msg: "Linear slot is skipped on corner / notched side panels" });
  c.rows.forEach((r, i) => {
    const lays = columnLayout(c, r, S);
    const used = lays.reduce((a, l) => a + l.w, 0) + Math.max(0, lays.length - 1) * S.bodyThk;
    if (lays.length > 1 && used > c.width - 2 * S.bodyThk + 1)
      out.push({ level: "err", msg: `Row ${i + 1}: columns Σ ${Math.round(used)}mm exceed inner width ${Math.round(c.width - 2 * S.bodyThk)}mm` });
    lays.forEach((lay, ci) => {
      const col = lay.col;
      const label = lays.length > 1 ? `Row ${i + 1} col ${ci + 1}` : `Row ${i + 1}`;
      const faceW = lays.length === 1 ? c.width : columnFaceWidth(c, lay, S);
      if (columnHasDrawers(col)) {
        const fh = col.drawers.reduce((a, d) => a + d.frontHeight, 0);
        if (Math.abs(fh - r.h) > 20) out.push({ level: "warn", msg: `${label}: drawer fronts Σ${Math.round(fh)}mm vs row ${Math.round(r.h)}mm` });
        col.drawers.forEach((d) => {
          if (!c.isKitchen && d.slideDepthCm * 10 > c.depth) out.push({ level: "warn", msg: `${label}: ${d.slideDepthCm * 10}mm slide deeper than cabinet (${c.depth}mm)` });
        });
        if (findNearestDrawerDepth(c.depth) < 25) out.push({ level: "warn", msg: `${label}: too shallow for any slide` });
      } else if (col.door && !col.fixed) {
        const { w: dw, h: dh } = doorDims(faceW, r.h, col.door, S);
        if (dw < 130) out.push({ level: "warn", msg: `${label}: door leaf ${Math.round(dw)}mm wide (too narrow)` });
        if (dw > 620) out.push({ level: "warn", msg: `${label}: door leaf ${Math.round(dw)}mm wide (consider double)` });
        if (dh >= 900 && doorHingeCount(dh) < 3) out.push({ level: "warn", msg: `${label}: tall door needs 3 hinges` });
      }
      if (!columnHasDrawers(col) && col.shelves > 0) {
        const gap = shelfGap(r.h, col.shelves, S);
        if (gap < S.shelfGapMin - 25 || gap > S.shelfGapMax + 25)
          out.push({ level: "warn", msg: `${label}: shelf gap ${Math.round(gap)}mm outside ${S.shelfGapMin}–${S.shelfGapMax}mm` });
      }
    });
  });
  return out;
}
