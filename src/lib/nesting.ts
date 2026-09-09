import type { Part, PartMaterial, Settings } from "../types";

/* ================= types ================= */

export interface PlacedPart {
  part: Part;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export interface Offcut {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sheet {
  index: number;
  key: string;
  material: PartMaterial;
  /** plywood group: the user plywood material id this sheet is cut from (null for mdf/back) */
  matId: string | null;
  thickness: number;
  /** real sheet size for THIS sheet (plywood/back 2440×1220 · MDF per Settings.mdfSheet) */
  sheetW: number;
  sheetH: number;
  placed: PlacedPart[];
  offcuts: Offcut[];
  util: number;
  usedArea: number;
  strategy: string;
}

export interface UnplacedPart {
  name: string;
  cabName: string;
  w: number;
  h: number;
  material: PartMaterial;
  thickness: number;
  reason: string;
}

export interface NestGroup {
  key: string;
  material: PartMaterial;
  /** plywood group: the user plywood material id (null for mdf/back) */
  matId: string | null;
  thickness: number;
  sheets: Sheet[];
  partCount: number;
  totalArea: number;
  avgUtil: number;
  unplaced: number;
  unplacedParts: UnplacedPart[];
  strategy: string;
}

interface Item {
  part: Part;
  w: number;
  h: number;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rotate a hole coordinate if the part was rotated 90° CW: (x,y) -> (y, w - x) */
export function rotPoint(x: number, y: number, w: number): [number, number] {
  return [y, w - x];
}

/** outline of a placed part in sheet-local coordinates */
export function placedOutline(pp: PlacedPart): [number, number][] {
  const p = pp.part;
  const base: [number, number][] =
    p.shape === "poly" && p.outline.length > 2
      ? p.outline
      : [
          [0, 0],
          [p.w, 0],
          [p.w, p.h],
          [0, p.h],
        ];
  return pp.rotated ? base.map(([x, y]) => rotPoint(x, y, p.w)) : base;
}

/** real sheet size for a material: plywood & veneer back are ALWAYS 2440×1220;
 *  MDF follows the user's choice (3050×1220 or 2440×1220). With "auto" the MDF
 *  parts are SPLIT per part (see groupParts): tall parts that only fit the big
 *  board nest on 3050×1220, everything else on 2440×1220. */
export function sheetDimsFor(material: PartMaterial, S: Settings): { w: number; h: number } {
  if (material === "mdf" && S.mdfSheet === "3050x1220") return { w: 3050, h: 1220 };
  return { w: S.sheetW, h: S.sheetH };
}

/** sheet-size tag suffix for MDF-auto groups that nest on the 3050×1220 board */
export const SHEET_3050_TAG = "@3050";

/** resolve the real board size for a nest group key (honors the MDF-auto tag) */
export function dimsForGroup(key: string, S: Settings): { w: number; h: number } {
  const segs = key.split("@");
  if (segs[0] === "mdf" && segs[3] === "3050") return { w: 3050, h: 1220 };
  return sheetDimsFor(segs[0] as PartMaterial, S);
}

/* ================= scoring ================= */

type Score = [number, number, number]; // unplaced, sheets, wasteArea — lower is better

/** lower is better: fewest unplaced, then fewest sheets, then least waste */
function scoreOf(unplaced: number, sheets: Sheet[], sheetArea: number): Score {
  const used = sheets.reduce((a, s) => a + s.usedArea, 0);
  return [unplaced, sheets.length, sheets.length * sheetArea - used];
}

/**
 * SAFETY NET — a layout is only ever accepted if it is geometrically valid.
 * Any candidate whose parts overlap or fall outside the sheet is discarded,
 * so a buggy heuristic can never reach the user's sheet.
 */
export function layoutIsValid(sheets: Sheet[], SW: number, SH: number): boolean {
  const EPS = 0.01;
  for (const s of sheets) {
    const p = s.placed;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      if (a.x < -EPS || a.y < -EPS || a.x + a.w > SW + EPS || a.y + a.h > SH + EPS) return false;
      for (let j = i + 1; j < p.length; j++) {
        const b = p[j];
        // axis-aligned overlap test (touching edges are fine)
        if (a.x + a.w > b.x + EPS && b.x + b.w > a.x + EPS && a.y + a.h > b.y + EPS && b.y + b.h > a.y + EPS) return false;
      }
    }
  }
  return true;
}

const better = (a: Score, b: Score) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));

/* ================= sort strategies ================= */

const SORTS: Record<string, (a: Item, b: Item) => number> = {
  height_desc: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  height_width: (a, b) => b.h - a.h || b.w - a.w,
  area_desc: (a, b) => b.w * b.h - a.w * a.h,
  width_desc: (a, b) => b.w - a.w || b.h - a.h,
  max_side: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
  perimeter: (a, b) => 2 * (b.w + b.h) - 2 * (a.w + a.h),
};

const SHELF_SORTS = ["height_desc", "height_width", "area_desc", "width_desc", "max_side", "perimeter"];
const MR_SORTS = ["area_desc", "height_desc", "width_desc", "perimeter"];
const MR_HEUR = ["BAF", "BSSF", "BLSF"] as const;
const GUILLOTINE_SPLITS = ["SAS", "SLAS"] as const;

/* ================= shelf packing (OptiNest style) ================= */

function shelfPack(
  itemsIn: Item[],
  SW: number,
  SH: number,
  sortKey: string,
  allowRot: boolean,
  clr: number,
  maxSheets: number,
  fullThreshold: number,
  minOff: number,
): { sheets: Sheet[]; unplaced: Item[] } {
  const items = [...itemsIn].sort(SORTS[sortKey]);
  const sheets: Sheet[] = [];
  let sheet = newShell(sheets.length);
  let cursorX = 0;
  let cursorY = 0;
  let shelfH = 0;
  let shelfRightMin = Infinity;
  let usedY = 0;
  const unplaced: Item[] = [];

  const newSheet = () => {
    finalizeShelfSheet(sheet, SW, SH, shelfRightMin, usedY, clr, fullThreshold, minOff);
    sheets.push(sheet);
    sheet = newShell(sheets.length);
    cursorX = 0;
    cursorY = 0;
    shelfH = 0;
    shelfRightMin = Infinity;
    usedY = 0;
  };
  const flushShelf = () => {
    if (cursorX > 0) {
      shelfRightMin = Math.min(shelfRightMin, cursorX - clr);
      cursorY += shelfH + clr;
      usedY = Math.max(usedY, cursorY);
      cursorX = 0;
      shelfH = 0;
    }
  };

  for (const it of items) {
    // a part whose grain is locked can never be rotated, regardless of the global flag
    const canRot = allowRot && !it.part.grain;
    const opts: { w: number; h: number; rot: boolean }[] = [];
    if (it.w <= SW && it.h <= SH) opts.push({ w: it.w, h: it.h, rot: false });
    if (canRot && it.h <= SW && it.w <= SH && it.w !== it.h) opts.push({ w: it.h, h: it.w, rot: true });
    opts.sort((a, b) => a.h - b.h);
    let placed = false;
    for (let guard = 0; guard < 400 && !placed; guard++) {
      for (const o of opts) {
        if (cursorX + o.w <= SW && (shelfH === 0 || o.h <= shelfH)) {
          sheet.placed.push({ part: it.part, x: cursorX, y: cursorY, w: o.w, h: o.h, rotated: o.rot });
          sheet.usedArea += it.w * it.h;
          cursorX += o.w + clr;
          shelfH = Math.max(shelfH, o.h);
          placed = true;
          break;
        }
      }
      if (placed) break;
      flushShelf();
      if (usedY > SH || (cursorX === 0 && shelfH === 0 && sheet.placed.length > 0)) {
        if (sheets.length + 1 >= maxSheets) {
          unplaced.push(it);
          placed = true;
          break;
        }
        newSheet();
      }
    }
    if (!placed) unplaced.push(it);
  }
  // second pass: fill gaps in existing shelves with small unplaced pieces
  for (let i = unplaced.length - 1; i >= 0; i--) {
    const it = unplaced[i];
    const canRot2 = allowRot && !it.part.grain;
    const opts: { w: number; h: number; rot: boolean }[] = [{ w: it.w, h: it.h, rot: false }];
    if (canRot2 && it.w !== it.h) opts.push({ w: it.h, h: it.w, rot: true });
    outer: for (const s of sheets) {
      // find shelf gaps: approximate by scanning right edge of each y-band
      const bands = new Map<number, { h: number; right: number }>();
      s.placed.forEach((p) => {
        const b = bands.get(p.y) ?? { h: 0, right: 0 };
        b.h = Math.max(b.h, p.h);
        b.right = Math.max(b.right, p.x + p.w);
        bands.set(p.y, b);
      });
      for (const [by, b] of bands) {
        for (const o of opts) {
          if (o.h <= b.h && b.right + clr + o.w <= SW) {
            s.placed.push({ part: it.part, x: b.right + clr, y: by, w: o.w, h: o.h, rotated: o.rot });
            s.usedArea += it.w * it.h;
            b.right += clr + o.w;
            unplaced.splice(i, 1);
            break outer;
          }
        }
      }
    }
  }
  finalizeShelfSheet(sheet, SW, SH, shelfRightMin, usedY, clr, fullThreshold, minOff);
  sheets.push(sheet);
  return { sheets, unplaced };
}

/* ================= MaxRects packing ================= */

function maxRectsPack(
  itemsIn: Item[],
  SW: number,
  SH: number,
  sortKey: string,
  heur: (typeof MR_HEUR)[number],
  allowRot: boolean,
  clr: number,
  maxSheets: number,
  minOff: number,
): { sheets: Sheet[]; unplaced: Item[]; freeFinal: FreeRect[][] } {
  const items = [...itemsIn].sort(SORTS[sortKey]);
  const unplaced: Item[] = [];
  /** every sheet stays OPEN so later small parts can fill earlier gaps — saves material */
  const open: { sheet: Sheet; free: FreeRect[] }[] = [{ sheet: newShell(0), free: [{ x: 0, y: 0, w: SW, h: SH }] }];

  for (const it of items) {
    const pw = it.w + clr;
    const ph = it.h + clr;
    const canRot = allowRot && !it.part.grain;
    const opts = canRot && it.w !== it.h ? [false, true] : [false];
    let best: { si: number; rect: FreeRect; w: number; h: number; rot: boolean; score: number } | null = null;

    for (let si = 0; si < open.length; si++) {
      for (const fr of open[si].free) {
        for (const rot of opts) {
          const w = rot ? ph : pw;
          const h = rot ? pw : ph;
          if (w > fr.w + 1e-6 || h > fr.h + 1e-6) continue;
          let score: number;
          if (heur === "BAF") score = fr.w * fr.h - w * h;
          else if (heur === "BSSF") score = Math.min(fr.w - w, fr.h - h);
          else score = Math.max(fr.w - w, fr.h - h);
          // prefer filling earlier (already opened) sheets
          score += si * 0.0001;
          if (!best || score < best.score) best = { si, rect: fr, w, h, rot, score };
        }
      }
    }

    if (!best) {
      if (open.length >= maxSheets) {
        unplaced.push(it);
        continue;
      }
      const fits = pw <= SW && ph <= SH;
      const fitsRot = canRot && ph <= SW && pw <= SH;
      if (!fits && !fitsRot) {
        unplaced.push(it);
        continue;
      }
      const rot = !fits && fitsRot;
      const shell = { sheet: newShell(open.length), free: [{ x: 0, y: 0, w: SW, h: SH }] };
      open.push(shell);
      const w = rot ? ph : pw;
      const h = rot ? pw : ph;
      place(it, w, h, rot, shell.free[0], shell.sheet);
      splitFree(shell.free, w, h, shell.free[0]);
      continue;
    }
    const tgt = open[best.si];
    place(it, best.w, best.h, best.rot, best.rect, tgt.sheet);
    splitFree(tgt.free, best.w, best.h, best.rect);
  }

  const sheets = open.map((o) => o.sheet);
  const freeFinal = open.map((o) => o.free.filter((f) => f.w >= minOff && f.h >= minOff));
  return { sheets, unplaced, freeFinal };

  function place(it: Item, w: number, h: number, rot: boolean, fr: FreeRect, s: Sheet) {
    s.placed.push({ part: it.part, x: fr.x, y: fr.y, w: w - clr, h: h - clr, rotated: rot });
    s.usedArea += it.w * it.h;
  }
  function splitFree(freeRects: FreeRect[], w: number, h: number, at?: FreeRect) {
    const rx = at ? at.x : 0;
    const ry = at ? at.y : 0;
    const next: FreeRect[] = [];
    for (const fr of freeRects) {
      if (fr.x >= rx + w || fr.x + fr.w <= rx || fr.y >= ry + h || fr.y + fr.h <= ry) {
        next.push(fr);
        continue;
      }
      // right
      if (fr.x + fr.w > rx + w) next.push({ x: rx + w, y: fr.y, w: fr.x + fr.w - (rx + w), h: fr.h });
      // top
      if (fr.y + fr.h > ry + h) next.push({ x: fr.x, y: ry + h, w: fr.w, h: fr.y + fr.h - (ry + h) });
      // left
      if (fr.x < rx) next.push({ x: fr.x, y: fr.y, w: rx - fr.x, h: fr.h });
      // bottom
      if (fr.y < ry) next.push({ x: fr.x, y: fr.y, w: fr.w, h: ry - fr.y });
    }
    // prune contained / too small
    const pruned: FreeRect[] = [];
    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      if (a.w < 30 || a.h < 30) continue;
      let contained = false;
      for (let j = 0; j < next.length; j++) {
        if (i === j) continue;
        const b = next[j];
        if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
          contained = true;
          break;
        }
      }
      if (!contained) pruned.push(a);
    }
    freeRects.length = 0;
    freeRects.push(...pruned);
  }
}

/* ================= guillotine packing (OptiNest style) =================
 * Free rectangles are kept DISJOINT by construction: placing a part splits its
 * host rectangle into exactly two non-overlapping remainders. This is both the
 * cutting model real panel saws use and structurally incapable of producing
 * overlaps, unlike MaxRects which needs careful pruning.
 *
 * Two split rules are tried:
 *   SAS  – split along the shorter axis  (keeps a wide strip above)
 *   SLAS – split along the longer axis   (keeps a tall strip beside)
 * plus a "merge free rects" pass that recombines neighbouring offcuts so long
 * thin leftovers become usable again — the main waste saver.
 */
type GuillotineSplit = "SAS" | "SLAS";

function guillotinePack(
  itemsIn: Item[],
  SW: number,
  SH: number,
  sortKey: string,
  split: GuillotineSplit,
  allowRot: boolean,
  clr: number,
  maxSheets: number,
  minOff: number,
): { sheets: Sheet[]; unplaced: Item[]; freeFinal: FreeRect[][] } {
  const items = [...itemsIn].sort(SORTS[sortKey]);
  const unplaced: Item[] = [];
  const open: { sheet: Sheet; free: FreeRect[] }[] = [{ sheet: newShell(0), free: [{ x: 0, y: 0, w: SW, h: SH }] }];

  /** recombine adjacent free rectangles that share a full edge */
  const mergeFree = (free: FreeRect[]) => {
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i];
        const b = free[j];
        // side by side, same height
        if (Math.abs(a.y - b.y) < 0.01 && Math.abs(a.h - b.h) < 0.01) {
          if (Math.abs(a.x + a.w - b.x) < 0.01) { a.w += b.w; free.splice(j, 1); i = -1; break; }
          if (Math.abs(b.x + b.w - a.x) < 0.01) { a.x = b.x; a.w += b.w; free.splice(j, 1); i = -1; break; }
        }
        // stacked, same width
        if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.w - b.w) < 0.01) {
          if (Math.abs(a.y + a.h - b.y) < 0.01) { a.h += b.h; free.splice(j, 1); i = -1; break; }
          if (Math.abs(b.y + b.h - a.y) < 0.01) { a.y = b.y; a.h += b.h; free.splice(j, 1); i = -1; break; }
        }
      }
    }
  };

  for (const it of items) {
    const pw = it.w + clr;
    const ph = it.h + clr;
    const canRot = allowRot && !it.part.grain && it.w !== it.h;

    // best short-side fit across every open sheet (fills earlier sheets first)
    let best: { si: number; fi: number; w: number; h: number; rot: boolean; score: number } | null = null;
    for (let si = 0; si < open.length; si++) {
      const free = open[si].free;
      for (let fi = 0; fi < free.length; fi++) {
        const fr = free[fi];
        const opts: [number, number, boolean][] = [[pw, ph, false]];
        if (canRot) opts.push([ph, pw, true]);
        for (const [w, h, rot] of opts) {
          if (w > fr.w + 1e-6 || h > fr.h + 1e-6) continue;
          // best short side leftover, tie-break on area, then earlier sheet
          const score = Math.min(fr.w - w, fr.h - h) * 1000 + (fr.w * fr.h - w * h) * 0.001 + si;
          if (!best || score < best.score) best = { si, fi, w, h, rot, score };
        }
      }
    }

    if (!best) {
      const fits = pw <= SW && ph <= SH;
      const fitsRot = canRot && ph <= SW && pw <= SH;
      if ((!fits && !fitsRot) || open.length >= maxSheets) {
        unplaced.push(it);
        continue;
      }
      open.push({ sheet: newShell(open.length), free: [{ x: 0, y: 0, w: SW, h: SH }] });
      best = { si: open.length - 1, fi: 0, w: fits ? pw : ph, h: fits ? ph : pw, rot: !fits, score: 0 };
    }

    const tgt = open[best.si];
    const fr = tgt.free[best.fi];
    tgt.sheet.placed.push({ part: it.part, x: fr.x, y: fr.y, w: best.w - clr, h: best.h - clr, rotated: best.rot });
    tgt.sheet.usedArea += it.w * it.h;

    // --- guillotine split into two DISJOINT remainders ---
    const restW = fr.w - best.w; // strip to the right of the part
    const restH = fr.h - best.h; // strip above the part
    const horizontal = split === "SAS" ? restW <= restH : restW > restH;
    const next: FreeRect[] = [];
    if (horizontal) {
      // right piece spans only the part's height; top piece spans full width
      if (restW > 0) next.push({ x: fr.x + best.w, y: fr.y, w: restW, h: best.h });
      if (restH > 0) next.push({ x: fr.x, y: fr.y + best.h, w: fr.w, h: restH });
    } else {
      // right piece spans full height; top piece spans only the part's width
      if (restW > 0) next.push({ x: fr.x + best.w, y: fr.y, w: restW, h: fr.h });
      if (restH > 0) next.push({ x: fr.x, y: fr.y + best.h, w: best.w, h: restH });
    }
    tgt.free.splice(best.fi, 1, ...next);
    // drop slivers that can never hold a part, then recombine neighbours
    for (let i = tgt.free.length - 1; i >= 0; i--) {
      if (tgt.free[i].w < 20 || tgt.free[i].h < 20) tgt.free.splice(i, 1);
    }
    mergeFree(tgt.free);
  }

  return {
    sheets: open.map((o) => o.sheet),
    unplaced,
    freeFinal: open.map((o) => o.free.filter((f) => f.w >= minOff && f.h >= minOff)),
  };
}

/* ================= shared helpers ================= */

function newShell(index: number) {
  return { index, key: "", material: "plywood" as PartMaterial, matId: null, thickness: 0, sheetW: 0, sheetH: 0, placed: [] as PlacedPart[], offcuts: [] as Offcut[], util: 0, usedArea: 0, strategy: "" };
}

function finalizeShelfSheet(sheet: Sheet, SW: number, SH: number, rightMin: number, usedY: number, clr: number, fullThreshold: number, minOff: number) {
  sheet.util = sheet.usedArea / (SW * SH);
  if (sheet.util >= fullThreshold) return; // nearly full — offcut irrelevant
  const rightX = isFinite(rightMin) ? rightMin : 0;
  if (SW - rightX >= minOff && usedY >= minOff) sheet.offcuts.push({ x: rightX, y: 0, w: SW - rightX, h: Math.max(0, usedY - clr) });
  if (SH - usedY >= minOff) sheet.offcuts.push({ x: 0, y: usedY, w: SW, h: SH - usedY });
}

/* ================= group runner (sync, best-of strategies) ================= */

interface RunResult {
  sheets: Sheet[];
  unplaced: number;
  unplacedItems?: Item[];
  score: Score;
  strategy: string;
}

const toUnplaced = (items: Item[] = [], S: Settings): UnplacedPart[] =>
  items.map((it) => {
    const maxSide = Math.max(it.w, it.h);
    const sheetMax = Math.max(S.sheetW, S.sheetH) - 2 * S.sheetMargin;
    const reason =
      maxSide > sheetMax
        ? `too large for the sheet (${Math.round(maxSide)}mm > ${Math.round(sheetMax)}mm)`
        : it.part.grain
          ? "no space left with grain locked (rotation not allowed)"
          : "sheet limit reached — increase max sheets";
    return {
      name: it.part.name,
      cabName: it.part.cabName,
      w: it.part.w,
      h: it.part.h,
      material: it.part.material,
      thickness: it.part.thickness,
      reason,
    };
  });

function nestGroupSync(items: Item[], key: string, S: Settings): NestGroup {
  const m = S.sheetMargin;
  const SW = S.sheetW - 2 * m;
  const SH = S.sheetH - 2 * m;
  const clr = S.partClearance || S.bitDiameter * 1.05;
  const allowRot = !S.grainLock;
  const sheetArea = SW * SH;

  const candidates: RunResult[] = [];
  const push = (res: { sheets: Sheet[]; unplaced: Item[] }, strategy: string) => {
    // never accept a geometrically invalid layout
    if (!layoutIsValid(res.sheets, SW, SH)) return;
    const sc = scoreOf(res.unplaced.length, res.sheets, sheetArea);
    candidates.push({ sheets: res.sheets, unplaced: res.unplaced.length, unplacedItems: res.unplaced, score: sc, strategy });
  };

  // phase 1: shelf packing — 6 sorts × rotation on/off
  const rotOpts = allowRot ? [true, false] : [false];
  for (const rot of rotOpts) {
    for (const sort of SHELF_SORTS) {
      const res = shelfPack(items, SW, SH, sort, rot, clr, S.maxSheets, S.sheetFullThreshold, S.minOffcut);
      push(res, `shelf/${sort}${rot ? "+rot" : ""}`);
    }
  }
  // phase 2: MaxRects — sorts × heuristics
  for (const rot of rotOpts) {
    for (const sort of MR_SORTS) {
      for (const heur of MR_HEUR) {
        const res = maxRectsPack(items, SW, SH, sort, heur, rot, clr, S.maxSheets, S.minOffcut);
        res.sheets.forEach((s, i) => (s.offcuts = (res.freeFinal[i] ?? []).slice(0, 3)));
        push({ sheets: res.sheets, unplaced: res.unplaced }, `maxrects/${sort}/${heur}${rot ? "+rot" : ""}`);
      }
    }
  }
  // phase 3: guillotine (OptiNest-style saw patterns, with offcut merging)
  for (const rot of rotOpts) {
    for (const sort of MR_SORTS) {
      for (const sp of GUILLOTINE_SPLITS) {
        const res = guillotinePack(items, SW, SH, sort, sp, rot, clr, S.maxSheets, S.minOffcut);
        res.sheets.forEach((s, i) => (s.offcuts = (res.freeFinal[i] ?? []).slice(0, 3)));
        push({ sheets: res.sheets, unplaced: res.unplaced }, `guillotine/${sort}/${sp}${rot ? "+rot" : ""}`);
      }
    }
  }
  let best = candidates[0];
  candidates.forEach((c) => {
    if (better(c.score, best.score)) best = c;
  });

  const [mat, thk, mid] = key.split("@");
  best.sheets.forEach((s, idx) => {
    s.key = key;
    s.material = mat as PartMaterial;
    s.matId = mid && mid !== "def" ? mid : null;
    s.thickness = parseFloat(thk);
    s.index = idx;
    s.strategy = best.strategy;
    s.util = s.usedArea / sheetArea;
  });
  const totalArea = items.reduce((a, i) => a + i.w * i.h, 0);
  return {
    key,
    material: mat as PartMaterial,
    matId: mid && mid !== "def" ? mid : null,
    thickness: parseFloat(thk),
    sheets: best.sheets,
    partCount: items.length,
    totalArea,
    avgUtil: best.sheets.length ? best.sheets.reduce((a, s) => a + s.util, 0) / best.sheets.length : 0,
    unplaced: best.unplaced,
    unplacedParts: toUnplaced(best.unplacedItems, S),
    strategy: best.strategy,
  };
}

function groupParts(parts: Part[], S?: Settings): Map<string, Part[]> {
  const groups = new Map<string, Part[]>();
  // MDF "auto" usable areas (a part that fits NEITHER board stays in the 2440
  // group so it is reported unplaced with a reason instead of vanishing)
  const m = S?.sheetMargin ?? 10;
  const uw24 = 2440 - 2 * m, uh = 1220 - 2 * m, uw30 = 3050 - 2 * m;
  const fits = (w: number, h: number, UW: number, UH: number, locked: boolean) =>
    (w <= UW + 1e-6 && h <= UH + 1e-6) || (!locked && h <= UW + 1e-6 && w <= UH + 1e-6);
  parts.forEach((p) => {
    // third segment = plywood material id so different plywoods never share a sheet
    let key = `${p.material}@${p.thickness}@${p.matId ?? "def"}`;
    // MDF auto: tall parts that only fit the big board get their own 3050 group
    if (S && p.material === "mdf" && S.mdfSheet === "auto") {
      const locked = !!p.grain;
      if (!fits(p.w, p.h, uw24, uh, locked) && fits(p.w, p.h, uw30, uh, locked)) key += SHEET_3050_TAG;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  });
  return groups;
}

function expand(parts: Part[]): Item[] {
  const items: Item[] = [];
  parts.forEach((p) => {
    for (let i = 0; i < p.qty; i++) items.push({ part: p, w: p.w, h: p.h });
  });
  return items;
}

/* ---- public sync API (used by DXF / cut list) ---- */

/** map one group's placements back from the transposed (nestDirection Y) frame */
function untransposeGroup(g: NestGroup) {
  g.sheets.forEach((s) => {
    s.placed = s.placed.map((p) => ({ ...p, x: p.y, y: p.x, w: p.h, h: p.w, rotated: !p.rotated }));
    s.offcuts = s.offcuts.map((o) => ({ ...o, x: o.y, y: o.x, w: o.h, h: o.w }));
  });
}

export function nestParts(parts: Part[], S: Settings): NestGroup[] {
  const out: NestGroup[] = [];
  groupParts(parts, S).forEach((plist, key) => {
    // per-material sheet size: plywood/back locked 2440×1220 · MDF per Settings
    // (auto splits tall parts onto 3050×1220 via dimsForGroup)
    const dims = dimsForGroup(key, S);
    let items = expand(plist);
    const S2: Settings = { ...S, sheetW: dims.w, sheetH: dims.h };
    if (S.nestDirection === "Y") {
      // transpose: nest into (SH x SW) then map back
      items = items.map((i) => ({ ...i, w: i.h, h: i.w }));
      S2.sheetW = dims.h;
      S2.sheetH = dims.w;
    }
    const g = nestGroupSync(items, key, S2);
    g.sheets.forEach((s) => {
      s.sheetW = dims.w;
      s.sheetH = dims.h;
    });
    if (S.nestDirection === "Y") untransposeGroup(g);
    out.push(g);
  });
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/* ---- async API with live progress/snapshots and stop support ---- */

export interface NestRunProgress {
  running: boolean;
  phase: string;
  done: number;
  total: number;
  groups: NestGroup[];
}

export async function runNesting(
  parts: Part[],
  S: Settings,
  onProgress: (p: NestRunProgress) => void,
  shouldStop: () => boolean,
): Promise<NestGroup[]> {
  const groups: NestGroup[] = [];
  const entries = [...groupParts(parts, S).entries()];
  const total = entries.length;
  let done = 0;
  for (const [key, plist] of entries) {
    if (shouldStop()) break;
    onProgress({ running: true, phase: `Optimizing ${key} …`, done, total, groups: [...groups] });
    const started = Date.now();
    await yield0();
    // iterative strategy evaluation with budget: run strategies one tick at a time.
    // (same transpose contract as the sync path so the UI preview, BOM counts
    // and DXF output always agree, whatever nestDirection is set)
    let items = expand(plist);
    const dims = dimsForGroup(key, S);
    const S2: Settings = { ...S, sheetW: dims.w, sheetH: dims.h };
    if (S.nestDirection === "Y") {
      items = items.map((i) => ({ ...i, w: i.h, h: i.w }));
      S2.sheetW = dims.h;
      S2.sheetH = dims.w;
    }
    const g = await nestGroupBudget(items, key, S2, shouldStop, () => {
      if (shouldStop()) return;
      if (Date.now() - started > S.timeBudget * 1000) return;
    });
    g.sheets.forEach((s) => {
      s.sheetW = dims.w;
      s.sheetH = dims.h;
    });
    if (S.nestDirection === "Y") untransposeGroup(g);
    groups.push(g);
    done++;
    onProgress({ running: true, phase: `Finished ${key} — ${g.sheets.length} sheet(s), ${(g.avgUtil * 100).toFixed(1)}% util (${g.strategy})`, done, total, groups: [...groups] });
    await yield0();
  }
  onProgress({ running: false, phase: "Done", done, total, groups: [...groups] });
  return groups;
}

/** strategy-by-strategy evaluation honoring the time budget and live best */
async function nestGroupBudget(
  itemsIn: Item[],
  key: string,
  S: Settings,
  shouldStop: () => boolean,
  onStrategy: () => void,
): Promise<NestGroup> {
  void onStrategy;
  const started = Date.now();
  const budgetMs = Math.max(300, S.timeBudget * 1000);
  const m = S.sheetMargin;
  const SW = S.sheetW - 2 * m;
  const SH = S.sheetH - 2 * m;
  const clr = S.partClearance || S.bitDiameter * 1.05;
  const allowRot = !S.grainLock;
  const sheetArea = SW * SH;

  const plan: (() => RunResult)[] = [];
  const rotOpts = allowRot ? [true, false] : [false];
  for (const rot of rotOpts) {
    for (const sort of SHELF_SORTS)
      plan.push(() => {
        const r = shelfPack(itemsIn, SW, SH, sort, rot, clr, S.maxSheets, S.sheetFullThreshold, S.minOffcut);
        return { sheets: r.sheets, unplaced: r.unplaced.length, unplacedItems: r.unplaced, score: scoreOf(r.unplaced.length, r.sheets, sheetArea), strategy: `shelf/${sort}${rot ? "+rot" : ""}` };
      });
    for (const sort of MR_SORTS)
      for (const heur of MR_HEUR)
        plan.push(() => {
          const r = maxRectsPack(itemsIn, SW, SH, sort, heur, rot, clr, S.maxSheets, S.minOffcut);
          r.sheets.forEach((s, i) => (s.offcuts = (r.freeFinal[i] ?? []).slice(0, 3)));
          return { sheets: r.sheets, unplaced: r.unplaced.length, unplacedItems: r.unplaced, score: scoreOf(r.unplaced.length, r.sheets, sheetArea), strategy: `maxrects/${sort}/${heur}${rot ? "+rot" : ""}` };
        });
    for (const sort of MR_SORTS)
      for (const sp of GUILLOTINE_SPLITS)
        plan.push(() => {
          const r = guillotinePack(itemsIn, SW, SH, sort, sp, rot, clr, S.maxSheets, S.minOffcut);
          r.sheets.forEach((s, i) => (s.offcuts = (r.freeFinal[i] ?? []).slice(0, 3)));
          return { sheets: r.sheets, unplaced: r.unplaced.length, unplacedItems: r.unplaced, score: scoreOf(r.unplaced.length, r.sheets, sheetArea), strategy: `guillotine/${sort}/${sp}${rot ? "+rot" : ""}` };
        });
  }

  let best: RunResult | null = null;
  for (const step of plan) {
    if (shouldStop() && best) break;
    if (best && Date.now() - started > budgetMs) break;
    const res = step();
    // discard any layout that is not geometrically valid
    if (!layoutIsValid(res.sheets, SW, SH)) {
      await yield0();
      continue;
    }
    if (!best || better(res.score, best.score)) best = res;
    await yield0();
  }
  if (!best) best = plan[0]();

  const [mat, thk, mid] = key.split("@");
  best.sheets.forEach((s, idx) => {
    s.key = key;
    s.material = mat as PartMaterial;
    s.matId = mid && mid !== "def" ? mid : null;
    s.thickness = parseFloat(thk);
    s.index = idx;
    s.strategy = best!.strategy;
    s.util = s.usedArea / sheetArea;
  });
  return {
    key,
    material: mat as PartMaterial,
    matId: mid && mid !== "def" ? mid : null,
    thickness: parseFloat(thk),
    sheets: best.sheets,
    partCount: itemsIn.length,
    totalArea: itemsIn.reduce((a, i) => a + i.w * i.h, 0),
    avgUtil: best.sheets.length ? best.sheets.reduce((a, s) => a + s.util, 0) / best.sheets.length : 0,
    unplaced: best.unplaced,
    unplacedParts: toUnplaced(best.unplacedItems, S),
    strategy: best.strategy,
  };
}

const yield0 = () => new Promise<void>((r) => setTimeout(r, 0));

/* ---- category colors ---- */
export function partColor(p: Part): string {
  if (p.name.startsWith("Door") || p.name.startsWith("Drawer front") || p.name.startsWith("Kitchen drawer front") || p.name.startsWith("Fixed") || p.name.startsWith("Sliding") || p.name.startsWith("Glass")) return "#7dd3fc";
  if (p.name.includes("drawer") || p.name.includes("Drawer")) return "#f0abfc";
  if (p.name.startsWith("Back")) return "#94a3b8";
  if (p.name.toLowerCase().includes("shelf")) return "#6ee7b7";
  if (p.name.toLowerCase().includes("kick")) return "#fbbf24";
  return "#f5b33c";
}
