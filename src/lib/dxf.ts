import type { Cabinet, PanelItem, PartMaterial, Settings } from "../types";
import { nestParts, placedOutline, rotPoint, type Sheet } from "./nesting";
import { allParts, type GrainOverrides } from "./model";
import { partMatName, plyMaterialsOf } from "./defaults";

const LAYERS: [string, number][] = [
  ["SHEET", 8],
  ["CUT", 7],
  ["BANDING", 1],
  ["CLAMP_HOLES", 6],
  ["SHELF_HOLES", 2],
  ["HINGE_HOLES", 3],
  ["SLIDE_HOLES", 4],
  ["DRAWER_GROOVE", 5],
  ["SLOT", 6],
  ["LABEL", 2],
];

/** sheets are tiled N columns × 5 rows when exporting (vertical strips of 5) */
export const DXF_GRID_ROWS = 5;

const holeLayer = (kind: string) =>
  kind === "shelf" ? "SHELF_HOLES" : kind === "hinge" ? "HINGE_HOLES" : "SLIDE_HOLES";

const esc = (s: string) => s.replace(/[^\x20-\x7E]/g, "?");

function header(): string {
  let s = "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n";
  s += "0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n";
  LAYERS.forEach(([name, color]) => {
    s += `0\nLAYER\n2\n${name}\n70\n0\n62\n${color}\n6\nCONTINUOUS\n`;
  });
  s += "0\nENDTAB\n0\nENDSEC\n";
  return s;
}

const line = (l: string, x1: number, y1: number, x2: number, y2: number) =>
  `0\nLINE\n8\n${l}\n10\n${r(x1)}\n20\n${r(y1)}\n30\n0\n11\n${r(x2)}\n21\n${r(y2)}\n31\n0\n`;
const circle = (l: string, x: number, y: number, rad: number) =>
  `0\nCIRCLE\n8\n${l}\n10\n${r(x)}\n20\n${r(y)}\n30\n0\n40\n${r(rad)}\n`;
const text = (l: string, x: number, y: number, h: number, t: string) =>
  `0\nTEXT\n8\n${l}\n10\n${r(x)}\n20\n${r(y)}\n30\n0\n40\n${r(h)}\n1\n${esc(t)}\n`;
const r = (n: number) => (Math.round(n * 1000) / 1000).toString();

export function buildDxfForSheet(sheet: Sheet, labels: boolean, opts?: { bandMarkers?: boolean }): string {
  let e = "";
  const ox = 0;
  sheet.placed.forEach((pp) => {
    const { x, y, part } = pp;
    const pts = placedOutline(pp);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      e += line("CUT", ox + x + a[0], y + a[1], ox + x + b[0], y + b[1]);
    }
    // holes — hinge holes are intentionally excluded from DXF (they are hardware
    // reference only, drilled manually or with a hinge-boring machine, not the CNC).
    part.holes.forEach((hl) => {
      if (hl.kind === "hinge") return;
      const [hx, hy] = pp.rotated ? rotPoint(hl.x, hl.y, part.w) : [hl.x, hl.y];
      e += circle(holeLayer(hl.kind), ox + x + hx, y + hy, hl.dia / 2);
    });
    // grooves — drawn as a closed RECTANGLE pocket (not a single line).
    // Slide grooves → DRAWER_GROOVE layer · full-height slots → SLOT layer.
    part.grooves.forEach((gr) => {
      const layer = gr.kind === "slot" ? "SLOT" : "DRAWER_GROOVE";
      // rectangle pocket: (x1,y1)-(x2,y2) is the groove bounding box
      const corners: [number, number][] = [
        [gr.x1, gr.y1],
        [gr.x2, gr.y1],
        [gr.x2, gr.y2],
        [gr.x1, gr.y2],
      ].map((c) => (pp.rotated ? rotPoint(c[0], c[1], part.w) : [c[0], c[1]])) as [number, number][];
      for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        e += line(layer, ox + x + a[0], y + a[1], ox + x + b[0], y + b[1]);
      }
    });
    // edge-banding markers — EXACTLY 3 solid triangle arrowheads (NO tail) per
    // banded edge, centered on the edge midpoint with a short fixed spacing and
    // a small inset from the cut edge. Shorter edges fall back to 1 centered
    // arrow. Band labels already match the part's dims (rotatePartOnce remaps
    // them); a packer rotation (pp.rotated) shifts them again: Top→Right,
    // Right→Bottom, Bottom→Left, Left→Top.
    if ((opts?.bandMarkers ?? true) && part.shape === "rect") {
      const b = part.band;
      const phys = pp.rotated
        ? { top: b.left, right: b.top, bottom: b.right, left: b.bottom }
        : { top: b.top, right: b.right, bottom: b.bottom, left: b.left };
      const W = pp.w;
      const H = pp.h;
      const ins = 8; // arrow TIP inset from the banded (cut) edge
      const len = 25; // arrowhead length — big, no tail
      const half = 7; // half base width (14mm wide head)
      const step = 60; // short spacing between the 3 arrow centers
      // one solid closed triangle with its tip at (px,py), pointing (dx,dy)
      const tri = (px: number, py: number, dx: number, dy: number) => {
        const bx = px - dx * len;
        const by = py - dy * len;
        const ox = -dy * half;
        const oy = dx * half;
        e += `0\nLWPOLYLINE\n8\nBANDING\n90\n3\n70\n1\n` +
          `10\n${r(px)}\n20\n${r(py)}\n` +
          `10\n${r(bx + ox)}\n20\n${r(by + oy)}\n` +
          `10\n${r(bx - ox)}\n20\n${r(by - oy)}\n`;
      };
      const arrows = (edge: "top" | "bottom" | "left" | "right") => {
        const horizontal = edge === "top" || edge === "bottom";
        const span = horizontal ? W : H;
        // 3 arrows centered on the midpoint (1 when the edge is too short)
        const n = span >= 2 * step + 40 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const p = span / 2 + (i - (n - 1) / 2) * step;
          if (edge === "top") tri(ox + x + p, y + H - ins, 0, 1);
          else if (edge === "bottom") tri(ox + x + p, y + ins, 0, -1);
          else if (edge === "left") tri(ox + x + ins, y + p, -1, 0);
          else tri(ox + x + W - ins, y + p, 1, 0);
        }
      };
      if (phys.top) arrows("top");
      if (phys.bottom) arrows("bottom");
      if (phys.left) arrows("left");
      if (phys.right) arrows("right");
    }
    if (labels) {
      // small, multi-row text that always fits INSIDE the placed panel
      const pw = pp.w;
      const ph = pp.h;
      const lines = [
        part.cabName,
        part.name,
        `${part.w} x ${part.h}${pp.rotated ? " R90" : ""}`,
      ].filter(Boolean);
      const pad = Math.min(6, pw * 0.04, ph * 0.04);
      const avail = Math.max(4, pw - 2 * pad);
      const longest = lines.reduce((a, s) => Math.max(a, s.length), 1);
      // DXF TEXT advance ≈ 0.62 × height per char — cap much smaller than before
      let size = Math.min(avail / (0.62 * longest), (ph - 2 * pad) / (lines.length * 1.5), 14);
      size = Math.max(1.6, size);
      const tx = ox + x + pad;
      const top = y + ph / 2 + ((lines.length - 1) * size * 1.4) / 2;
      lines.forEach((ln, i) => {
        e += text("LABEL", tx, top - i * size * 1.4 - size / 2, size, ln);
      });
    }
  });
  return e;
}

export interface DxfSheetRef {
  key: string;
  sheet: Sheet;
}

/** Build a DXF from an explicit list of nested sheets (used for "export selected boards"). */
export function buildDxfFromSheets(sel: DxfSheetRef[], S: Settings, labels: boolean, extra = ""): string {
  let out = header();
  out += "0\nSECTION\n2\nENTITIES\n";
  const mx = S.nestFrom.includes("right");
  const my = S.nestFrom.includes("top");

  /* Sheets are tiled N columns × 5 rows. Column 0 holds sheets 0–4 stacked
   * vertically, column 1 holds 5–9, etc. — compact and CAM-friendly. */
  const GAP_X = 500;
  const GAP_Y = 400;
  let slot = 0;

  sel.forEach(({ sheet }) => {
    // per-sheet size: plywood/back 2440×1220 · MDF possibly 3050×1220
    const SW = sheet.sheetW || S.sheetW;
    const SH = sheet.sheetH || S.sheetH;
    const UW = SW - 2 * S.sheetMargin;
    const UH = SH - 2 * S.sheetMargin;
    const grow = slot % DXF_GRID_ROWS;
    const gcol = Math.floor(slot / DXF_GRID_ROWS);
    const xOffset = gcol * (SW + GAP_X);
    const yOffset = -grow * (SH + GAP_Y);
    slot++;

    const shifted = {
      ...sheet,
      placed: sheet.placed.map((pp) => ({
        ...pp,
        x: S.sheetMargin + (mx ? UW - pp.x - pp.w : pp.x),
        y: S.sheetMargin + (my ? UH - pp.y - pp.h : pp.y),
      })),
    };

    // sheet board outline ONLY (e.g. 2440 × 1220) — no inner helper rectangle
    let frame = "";
    frame += line("SHEET", 0, 0, SW, 0);
    frame += line("SHEET", SW, 0, SW, SH);
    frame += line("SHEET", SW, SH, 0, SH);
    frame += line("SHEET", 0, SH, 0, 0);
    if (labels) {
      // human material name (plywood library name / "Veneer back - <ply name>")
      // instead of the internal group key — the operator must be able to tell
      // at a glance which board this sheet is cut from.
      const title = partMatName(S, { material: sheet.material, matId: sheet.matId }).replace("·", "-");
      frame += text(
        "LABEL",
        0,
        SH + 40,
        46,
        `Sheet ${sheet.index + 1} - ${title} ${sheet.thickness}mm - ${SW}x${SH} - util ${(sheet.util * 100).toFixed(1)}% - ${sheet.placed.length} parts`,
      );
    }

    // CNC clamping holes in free areas (toggleable via Settings.clampHoles)
    const clamp = S.clampHoles === false ? "" : buildClampHoles(shifted, S);
    out += offsetEntities(frame, xOffset, yOffset);
    const body = buildDxfForSheet(shifted, labels, { bandMarkers: S.bandMarkers !== false });
    out += offsetEntities(body, xOffset, yOffset);
    out += offsetEntities(clamp, xOffset, yOffset);
  });
  out += extra; // e.g. glass-door reference notes (rule H)
  out += "0\nENDSEC\n0\nEOF\n";
  return out;
}

/** plywood / veneer-back group match: the group's matId equals the requested
 *  one — OR the group is the DEFAULT ("def") group and the requested file is
 *  the PROJECT default plywood (rule J — default-matId parts, e.g. raw panels,
 *  must not be dropped from the default file). The default file is the one
 *  whose matId is the project's defaultPlyId (NOT a fixed library id), so a
 *  project that defaults to a custom plywood never gets an empty
 *  "cabinets_plywood" / "cabinets_back" file. */
export const plyGroupMatch = (g: { matId: string | null }, matId: string | null | undefined, defId: string) =>
  g.matId === (matId ?? null) || (g.matId === null && matId === defId);

export function buildDxf(cabs: Cabinet[], S: Settings, material: PartMaterial | null, labels: boolean, ov: GrainOverrides = {}, matId?: string | null, panels: PanelItem[] = []): string {
  const groups = nestParts(allParts(cabs, S, ov, panels), S).filter(
    (g) =>
      (!material || g.material === material) &&
      // veneer back follows the cabinet plywood — split per material just like plywood
      ((material !== "plywood" && material !== "back") || plyGroupMatch(g, matId, S.defaultPlyId)),
  );
  const sel: DxfSheetRef[] = [];
  groups.forEach((g) => g.sheets.forEach((sheet) => sel.push({ key: g.key, sheet })));
  // Glass doors are purchased hardware — they belong in the BOM only, never
  // in the CNC DXF (no REF text, no cup geometry).
  return buildDxfFromSheets(sel, S, labels, "");
}

/**
 * Generate CNC clamping holes (10mm Ø) in non-occupied areas of the sheet.
 * 5–15 holes, ≥300mm apart, placed in the largest free gaps.
 */
function buildClampHoles(sheet: Sheet, S: Settings): string {
  const SW = sheet.sheetW || S.sheetW;
  const SH = sheet.sheetH || S.sheetH;
  const placed = sheet.placed;

  /** does a circle at (cx,cy,r) overlap any placed part? */
  const isFree = (cx: number, cy: number, r: number): boolean =>
    placed.every((p) => {
      const nx = Math.max(p.x, Math.min(cx, p.x + p.w));
      const ny = Math.max(p.y, Math.min(cy, p.y + p.h));
      return Math.hypot(cx - nx, cy - ny) > r + 5;
    });

  // candidate positions on a grid — prefer edges and corners (vacuum table clamps)
  const R = 5; // 10mm hole radius
  const cands: { x: number; y: number }[] = [];
  const edges = [20, SW / 6, SW / 3, SW / 2, (2 * SW) / 3, (5 * SW) / 6, SW - 20];
  const rows = [20, SH / 4, SH / 2, (3 * SH) / 4, SH - 20];
  for (const x of edges) for (const y of rows) cands.push({ x, y });

  const holes: { x: number; y: number }[] = [];
  for (const c of cands) {
    if (holes.length >= 15) break;
    if (!isFree(c.x, c.y, R)) continue;
    // ≥300mm from every accepted hole
    if (holes.some((h) => Math.hypot(h.x - c.x, h.y - c.y) < 300)) continue;
    holes.push(c);
  }

  let e = "";
  for (const h of holes) e += circle("CLAMP_HOLES", h.x, h.y, R);
  return e;
}

/** apply a uniform XY offset to all DXF coordinates in a fragment */
function offsetEntities(fragment: string, dx: number, dy: number): string {
  const lines = fragment.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i];
    if ((code === "10" || code === "11") && i + 1 < lines.length) {
      out.push(code, String(parseFloat(lines[i + 1]) + dx));
      i++;
    } else if ((code === "20" || code === "21") && i + 1 < lines.length) {
      out.push(code, String(parseFloat(lines[i + 1]) + dy));
      i++;
    } else {
      out.push(code);
    }
  }
  return out.join("\n");
}

export interface DxfFileDef {
  filename: string;
  material: PartMaterial;
  /** plywood material id — for plywood defs only (undefined = default plywood) */
  matId?: string | null;
  title: string;
}

/** filesystem-friendly slug for material-based filenames */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "plywood";

/**
 * One DXF file PER PLYWOOD MATERIAL for both the carcass (plywood) and the
 * veneer back — the back follows the cabinet plywood, so it must be cut from
 * the matching back board. The PROJECT default plywood keeps the classic
 * filenames ("cabinets_plywood" / "cabinets_back") so old workflows don't
 * break; every other material gets `cabinets_plywood_<slug>` / `cabinets_back_<slug>`.
 */
export function dxfFileDefs(S: Settings): DxfFileDef[] {
  const defs: DxfFileDef[] = [];
  const defId = S.defaultPlyId;
  plyMaterialsOf(S).forEach((m) => {
    const isDef = m.id === defId;
    defs.push({
      filename: isDef ? "cabinets_plywood" : `cabinets_plywood_${slug(m.name)}`,
      material: "plywood" as PartMaterial,
      matId: m.id,
      title: m.name,
    });
    defs.push({
      filename: isDef ? "cabinets_back" : `cabinets_back_${slug(m.name)}`,
      material: "back" as PartMaterial,
      matId: m.id,
      title: `Veneer back — ${m.name}`,
    });
  });
  defs.push({ filename: "cabinets_mdf", material: "mdf", title: "MDF" });
  return defs;
}
