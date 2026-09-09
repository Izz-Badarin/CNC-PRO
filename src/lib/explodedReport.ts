import type { Cabinet, Customer, PanelItem, Part, ProjectInfo, Settings } from "../types";
import {
  allPartsMerged,
  bandLengthMm,
  bandStr,
  type GrainOverrides,
  type RotationOverrides,
  bandingByMaterial,
  columnFaceWidth,
  columnFaceX,
  columnLayout,
  coverPanelDims,
  coverCenterX,
  doorDims,
  drawerBank,
  drawerBoxDims,
  effectiveHingeCount,
  hingeCupYs,
  kickH as modelKickH,
  stackOn as modelStackOn,
  stackedHeights as modelStackedHeights,
  railShelfYs,
  columnHasDrawers,
} from "./model";
import { nestParts } from "./nesting";
import { frontElevationSvg } from "./export";
import { applyWaste, partMatName, wastePctOf } from "./defaults";
import type { CabShots } from "./cabShots";

const escH = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
// single source of truth for human material names (plywood name /
// "Veneer back · <ply name>" / MDF / Glass)
const matLabel = (S: Settings, p: { material: string; matId?: string }) => partMatName(S, p);

export interface ExplodedReportOpts {
  screenshotDataUrl?: string | null;
  perCabinetScreenshots?: Record<string, string>; // cabId -> dataUrl (3D iso)
  explodedScreenshots?: Record<string, string>; // cabId -> dataUrl (exploded 3D)
  /** cabId -> automatic ISO/front/left photos (captured headlessly, no user screenshots) */
  autoShots?: Record<string, CabShots>;
}

/**
 * 2D exploded parts layout for a single cabinet — drawn DIRECTLY from the real
 * cut-part list (same generator as cut list / nesting / DXF, cut-list manual
 * rotations included): every rectangle is an actual part with its true name,
 * W×H×thk, qty, holes, slots, edge banding and grain-lock flag; polygon parts
 * (notched sides, kick-cut top/bottom, drawer boxes) keep their real cut
 * outline. Parts are packed left→right, top→down in their natural build order
 * (carcass → shelves → doors → drawers → covers).
 *
 * Precision rules (this is what keeps every hole inside its panel):
 *  · the parts are drawn EXACTLY as allPartsMerged returns them — no second
 *    rotation pass (rotating twice would mirror every banding edge and hole)
 *  · holes and slot grooves are drawn at their true part coordinates
 *  · each part carries its # index, matching the panel size table below
 */
function explodedCabinetSvg(cab: Cabinet, S: Settings, grain: GrainOverrides, rot: RotationOverrides = {}): string {
  const parts = allPartsMerged([cab], S, grain, [], rot);
  const totalQty = parts.reduce((a, p) => a + p.qty, 0);
  const totalArea = parts.reduce((a, p) => a + (p.w * p.h * p.qty) / 1e6, 0);

  const VW = 960;
  const leftPad = 46, rightPad = 30, topPad = 58, cellPad = 16, bottomLegend = 40;
  const rowW = VW - leftPad - rightPad;

  // material styling
  const style = (p: { material: string; reference?: boolean }): { fill: string; stroke: string; dash?: string } => {
    if (p.material === "glass" || p.reference) return { fill: "rgba(140,190,230,0.28)", stroke: "#4a6a94", dash: "5 4" };
    if (p.material === "back") return { fill: "#ecdfc0", stroke: "#8a7a5a", dash: "6 4" };
    if (p.material === "mdf") return { fill: "#efe9dd", stroke: "#8a7a5a" };
    return { fill: "#e6d8ba", stroke: "#7a6a4a" }; // plywood
  };

  // greedy shelf-pack at a given scale — returns total height, or -1 if a
  // single part is wider than the row
  const packAt = (sc: number): number => {
    let x = leftPad, y = topPad, rowH = 0;
    for (const p of parts) {
      const cw = p.w * sc + cellPad;
      const ch = p.h * sc + cellPad + 14; // + label space
      if (x + cw > VW - rightPad) {
        if (x === leftPad && cw > rowW) return -1; // single part too wide
        x = leftPad;
        y += rowH + 10;
        rowH = 0;
      }
      rowH = Math.max(rowH, ch);
      x += cw;
    }
    return y + rowH;
  };

  let sc = 1.0;
  while (sc > 0.02) {
    const h = packAt(sc);
    if (h > 0 && h <= 1300) break;
    sc -= 0.05;
  }
  const H = Math.min(1340, Math.max(360, packAt(sc) + bottomLegend + 20));

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${H}" viewBox="0 0 ${VW} ${H}" font-family="Arial, Helvetica, sans-serif">`;
  out += `<rect width="${VW}" height="${H}" fill="#ffffff"/>`;
  out += `<text x="${VW / 2}" y="26" font-size="15" font-weight="700" text-anchor="middle" fill="#111">${escH(cab.name)} – Exploded Parts Layout – ${cab.width}×${cab.height}×${cab.depth}</text>`;
  const manualCount = parts.filter((p) => p.note.includes("manual 90°")).reduce((a, p) => a + p.qty, 0);
  out += `<text x="${VW / 2}" y="42" font-size="10" text-anchor="middle" fill="#666">${parts.length} part types · ${totalQty} pieces · ${totalArea.toFixed(2)} m² – drawn at 1:${f2(1 / sc)} from the real cut list (same rotation as DXF)${manualCount ? ` · ${manualCount} manually rotated 90°` : ""}</text>`;

  let x = leftPad, y = topPad, rowH = 0;
  parts.forEach((p, pi) => {
    const cw = p.w * sc + cellPad;
    const ch = p.h * sc + cellPad + 14;
    if (x + cw > VW - rightPad) {
      x = leftPad;
      y += rowH + 10;
      rowH = 0;
    }
    rowH = Math.max(rowH, ch);
    // draw FIRST at the cell's left edge, then advance — drawing after the
    // advance shifted every part right by its own width (overflowed the page)
    const st = style(p);
    const rx = x;
    const ry = y + 14;
    x += cw;
    // real cut outline for polygon parts, plain rect otherwise
    if (p.shape === "poly" && p.outline.length > 2) {
      const xs = p.outline.map((pt) => pt[0]);
      const ys = p.outline.map((pt) => pt[1]);
      const minx = Math.min(...xs), maxx = Math.max(...xs);
      const miny = Math.min(...ys), maxy = Math.max(...ys);
      const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny);
      const fit = Math.min((p.w * sc) / bw, (p.h * sc) / bh);
      const pts = p.outline
        .map((pt) => `${f2(rx + 2 + (pt[0] - minx) * fit)} ${f2(ry + 2 + (pt[1] - miny) * fit)}`)
        .join(" ");
      out += `<polygon points="${pts}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="1.1"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`;
    } else {
      out += `<rect x="${f2(rx + 2)}" y="${f2(ry + 2)}" width="${f2(Math.max(1, p.w * sc - 4))}" height="${f2(Math.max(1, p.h * sc - 4))}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="1.1"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`;
    }
    // banding ticks
    if (p.band.left) out += `<rect x="${f2(rx)}" y="${f2(ry)}" width="3" height="${f2(p.h * sc)}" fill="#d0654a"/>`;
    if (p.band.right) out += `<rect x="${f2(rx + p.w * sc - 3)}" y="${f2(ry)}" width="3" height="${f2(p.h * sc)}" fill="#d0654a"/>`;
    if (p.band.top) out += `<rect x="${f2(rx)}" y="${f2(ry)}" width="${f2(p.w * sc)}" height="3" fill="#d0654a"/>`;
    if (p.band.bottom) out += `<rect x="${f2(rx)}" y="${f2(ry + p.h * sc - 3)}" width="${f2(p.w * sc)}" height="3" fill="#d0654a"/>`;
    // holes + slot grooves at their TRUE part coordinates (SVG y grows down,
    // part y grows up — hence the flip). Anything outside the outline would
    // be a generator bug, made visible here instead of hidden.
    for (const g of p.grooves) {
      const gx = rx + 2 + g.x1 * sc;
      const gw = Math.max(1.5, (g.x2 - g.x1) * sc);
      const gy = ry + 2 + (p.h - g.y2) * sc;
      const gh = Math.max(1.5, (g.y2 - g.y1) * sc);
      out += `<rect x="${f2(gx)}" y="${f2(gy)}" width="${f2(gw)}" height="${f2(gh)}" fill="${g.kind === "slot" ? "none" : "rgba(168,85,247,0.35)"}" stroke="#a855f7" stroke-width="0.8"${g.kind === "slot" ? ` stroke-dasharray="3 2"` : ""}/>`;
    }
    if (p.holes.length > 0 && p.holes.length <= 400) {
      for (const h of p.holes) {
        const hx = rx + 2 + h.x * sc;
        const hy = ry + 2 + (p.h - h.y) * sc;
        const hr = Math.max(0.9, Math.min(4, (h.dia / 2) * sc));
        const hc = h.kind === "slide" ? "#38bdf8" : h.kind === "hinge" ? "#f87171" : "#f5b33c";
        out += `<circle cx="${f2(hx)}" cy="${f2(hy)}" r="${f2(hr)}" fill="${hc}" stroke="#111" stroke-width="0.3"/>`;
      }
    }
    // labels (index + name / size line)
    const cxr = rx + (p.w * sc) / 2;
    const name = p.name.length > 26 ? p.name.slice(0, 25) + "…" : p.name;
    const inside = p.h * sc > 46;
    out += `<text x="${f2(cxr)}" y="${f2(inside ? ry + 13 : ry + 10)}" font-size="8.5" font-weight="700" fill="#222" text-anchor="middle">${pi + 1}. ${escH(name)}${p.qty > 1 ? ` ×${p.qty}` : ""}</text>`;
    const dimLine = `${p.w}×${p.h}×${p.thickness}${p.holes.length ? ` · ${p.holes.length}⌀` : ""}${p.grain ? " · G" : ""}${p.reference ? " · REF" : ""}`;
    out += `<text x="${f2(cxr)}" y="${f2(inside ? ry + 24 : ry + (p.h * sc > 20 ? p.h * sc - 5 : 11))}" font-size="7.5" fill="#555" text-anchor="middle">${escH(dimLine)}</text>`;
  });

  // legend
  const ly = H - 18;
  const legend: [string, { fill: string; stroke: string; dash?: string }][] = [
    ["Plywood", style({ material: "plywood" })],
    ["MDF", style({ material: "mdf" })],
    ["Veneer back (dashed)", style({ material: "back" })],
    ["Glass / reference (dashed)", style({ material: "glass", reference: true })],
  ];
  let lx = leftPad;
  legend.forEach(([t, s]) => {
    out += `<rect x="${f2(lx)}" y="${f2(ly - 8)}" width="12" height="10" fill="${s.fill}" stroke="${s.stroke}" stroke-width="0.9"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
    out += `<text x="${f2(lx + 16)}" y="${f2(ly)}" font-size="8" fill="#555">${t}</text>`;
    lx += 16 + t.length * 4.6 + 18;
  });
  out += `<text x="${f2(VW - rightPad)}" y="${f2(ly)}" font-size="8" fill="#555" text-anchor="end">orange tick = edge banding · amber/cyan/red dots = shelf/slide/hinge holes · G = grain locked</text>`;

  out += `</svg>`;
  return out;
}

/* ================= interactive exploded diagram (dynamic in the HTML) =================
 * A 2.5D (dimetric) cabinet drawing rendered as SVG + a tiny inline script.
 * Every part is a box with an ASSEMBLED position (from the same layout math
 * as the part generator) and an EXPLODE offset vector. The report ships the
 * diagram pre-rendered at t = 1 (exploded — safe for print / no-JS), and the
 * inline script re-projects the same data for any slider value t ∈ [0,1]:
 *   0 = fully assembled · 1 = fully exploded.
 * The projection is a classic 30° dimetric:
 *   sx = (x − z)·cos30   sy = (x + z)·sin30 − y      (y up, z toward viewer)
 * and the painter's order sorts by (x+z, y) — boxes never interpenetrate, so
 * that ordering is exact. No external assets — a few hundred bytes of JS.
 */

interface XpPart {
  /** short name for the label */
  n: string;
  /** label line, e.g. "2580 × 571 × 16.5" (L×W×T, longest first) */
  l: string;
  /** assembled box: origin (x,y,z) mm + size (w,h,d) mm — y up, z = front */
  x: number; y: number; z: number; w: number; h: number; d: number;
  /** explode offset vector (mm) — final pos = box + t·off */
  ox: number; oy: number; oz: number;
  /** [top, front, right] face fills */
  c: [string, string, string];
  /** hinge cups for door leaves (mm cup offset from the leaf's left edge, ys from leaf bottom) */
  hc?: { n: number; ys: number[]; cx: number; dia: number };
}

const XP_PAL: Record<string, [string, string, string]> = {
  ply: ["#ecd8ab", "#dfc493", "#c1a06c"],
  mdf: ["#f4f1ea", "#e9e4d7", "#cfc8b7"],
  oak: ["#cfa471", "#c0925c", "#9d7445"],
  back: ["#dcc79e", "#d0b88c", "#b29a72"],
  kick: ["#d9ba8b", "#cdaa76", "#ae8d58"],
  drawer: ["#e5d0a4", "#d8bf8c", "#ba9e66"],
  glass: ["rgba(196,224,242,0.60)", "rgba(176,210,232,0.55)", "rgba(146,186,214,0.50)"],
};

const XP_C30 = 0.8660254; // cos(30°) — MUST match the inline JS
const XP_S30 = 0.5; // sin(30°)

/** project a cabinet-space point (mm) to canvas px */
const xpProj = (px: number, py: number, pz: number, o: { x: number; y: number }, s: number): [number, number] => [
  o.x + (px - pz) * XP_C30 * s,
  o.y + ((px + pz) * XP_S30 - py) * s,
];

function xpDimsLabel(w: number, h: number, d: number): string {
  const a = [w, h, d].sort((x, y) => y - x).map((v) => (Math.round(v * 10) / 10).toString());
  return `${a[0]} × ${a[1]} × ${a[2]}`;
}

/**
 * Build the placed boxes for ONE cabinet — the same layout math as the part
 * generator (rows → columns → drawer bank → shelf zone → doors), so every box
 * sits exactly where its cut part would sit in the real cabinet.
 */
function buildExplodeParts(cab: Cabinet, S: Settings): XpPart[] {
  const T = S.bodyThk;
  const BT = S.backThk;
  const W = cab.width, H = cab.height, D = cab.depth;
  const kick = modelKickH(cab, S);
  const BH = H - kick;
  const carcD = D - BT; // carcass front lands exactly at z = D
  const parts: XpPart[] = [];
  const add = (p: Omit<XpPart, "l" | "n">, name: string) =>
    parts.push({ ...p, n: name, l: xpDimsLabel(p.w, p.h, p.d) });

  if (cab.type === "L" || cab.type === "C" || cab.type === "cornerBase" || cab.type === "cornerWall") {
    // corner units — approximate body so the interactive view still shows the
    // cabinet (sides as the two walls, top, bottom, back); details in cut list
    const d = D;
    add({ x: 0, y: kick, z: BT, w: T, h: BH, d: d, ox: -0.45 * W, oy: 0, oz: 0, c: XP_PAL.ply }, "Side panel L (notched)");
    add({ x: W - T, y: kick, z: BT, w: T, h: BH, d: d, ox: 0.45 * W, oy: 0, oz: 0, c: XP_PAL.ply }, "Side panel R (notched)");
    add({ x: T, y: H - T, z: BT, w: W - 2 * T, h: T, d: d, ox: 0, oy: 0.35 * BH, oz: 0, c: XP_PAL.ply }, "Top (pentagon)");
    add({ x: T, y: kick, z: BT, w: W - 2 * T, h: T, d: d, ox: 0, oy: -0.2 * H, oz: 0, c: XP_PAL.ply }, "Bottom (pentagon)");
    if (cab.hasBack !== false) add({ x: 1, y: kick, z: 0, w: W - 2, h: BH, d: BT, ox: 0, oy: 0, oz: -0.5 * D, c: XP_PAL.back }, "Back");
    if (kick > 0) add({ x: T, y: 0, z: D - S.kickDepth, w: W - 2 * T, h: kick, d: S.kickDepth, ox: 0, oy: -0.12 * H, oz: 0.5 * D, c: XP_PAL.kick }, "Toe kick front");
    return parts;
  }

  const stacked = modelStackOn(cab);
  const rows = cab.rows;
  const rowY0: number[] = [];
  {
    let y = kick;
    rows.forEach((r) => {
      rowY0.push(y);
      y += r.h;
    });
  }

  // ---- kick ----
  if (kick > 0) {
    add({ x: T, y: 0, z: D - S.kickDepth, w: W - 2 * T, h: kick, d: S.kickDepth, ox: 0, oy: -0.14 * H, oz: 0.5 * D, c: XP_PAL.kick }, "Toe kick front");
    add({ x: 0, y: 0, z: D - S.kickDepth, w: T, h: kick, d: S.kickDepth, ox: -0.3 * W, oy: -0.14 * H, oz: 0.5 * D, c: XP_PAL.kick }, "Toe kick side L");
    add({ x: W - T, y: 0, z: D - S.kickDepth, w: T, h: kick, d: S.kickDepth, ox: 0.3 * W, oy: -0.14 * H, oz: 0.5 * D, c: XP_PAL.kick }, "Toe kick side R");
  }

  // ---- back: one per box (stacked) or one for the whole body ----
  if (cab.hasBack !== false) {
    if (stacked) {
      rows.forEach((r, ri) =>
        add({ x: 1, y: rowY0[ri], z: 0, w: W - 2, h: r.h, d: BT, ox: 0, oy: 0, oz: -0.5 * D, c: XP_PAL.back }, `Back R${ri + 1}`),
      );
    } else {
      add({ x: 1, y: kick, z: 0, w: W - 2, h: BH, d: BT, ox: 0, oy: 0, oz: -0.5 * D, c: XP_PAL.back }, "Back");
    }
  }

  // ---- carcass per box/row ----
  rows.forEach((row, ri) => {
    const y0 = rowY0[ri], y1 = y0 + row.h;
    const tag = rows.length > 1 ? ` R${ri + 1}` : "";
    // sides
    add({ x: 0, y: y0, z: BT, w: T, h: row.h, d: carcD, ox: -0.45 * W, oy: 0, oz: 0, c: XP_PAL.ply }, `Side panel L${tag}`);
    add({ x: W - T, y: y0, z: BT, w: T, h: row.h, d: carcD, ox: 0.45 * W, oy: 0, oz: 0, c: XP_PAL.ply }, `Side panel R${tag}`);
    // bottom + top
    add({ x: T, y: y0, z: BT, w: W - 2 * T, h: T, d: carcD, ox: 0, oy: (y0 <= kick + 1 ? -0.2 : -0.08) * H, oz: 0, c: XP_PAL.ply }, `Bottom${tag}`);
    add({ x: T, y: y1 - T, z: BT, w: W - 2 * T, h: T, d: carcD, ox: 0, oy: 0.32 * H * (0.4 + 0.6 * (y1 / H)), oz: 0, c: XP_PAL.ply }, `Top${tag}`);
    // row divider (multi-row, non-stacked)
    if (!stacked && ri < rows.length - 1)
      add({ x: T, y: y1 - T, z: BT, w: W - 2 * T, h: T, d: carcD, ox: 0, oy: 0.16 * H, oz: 0, c: XP_PAL.ply }, `Row section R${ri + 1}/R${ri + 2}`);

    // ---- columns ----
    const lays = columnLayout(cab, row, S);
    lays.forEach((lay, ci) => {
      const col = lay.col;
      const innerX = T + lay.x;
      const faceX = columnFaceX(lay, S);
      const faceW = lays.length === 1 ? W : columnFaceWidth(cab, lay, S);
      const cTag = lays.length > 1 ? ` R${ri + 1}C${ci + 1}` : ` R${ri + 1}`;
      // vertical divider between columns
      if (!lay.last)
        add({ x: innerX + lay.w, y: y0 + T, z: BT, w: T, h: row.h - T - S.dividerDeduct, d: carcD, ox: 0, oy: 0.25 * H, oz: 0.3 * D, c: XP_PAL.ply }, `Vertical divider${cTag}`);

      const hasDr = columnHasDrawers(col);
      const allHidden = hasDr && col.drawers.every((dr) => dr.hidden);
      const bank = hasDr ? drawerBank(col, row.h, S) : { y: 0, h: 0 };
      const aboveBank = (col.drawerAlign ?? "bottom") !== "top";
      const zoneY = hasDr ? (aboveBank ? bank.y + bank.h : 0) : 0;
      const zoneH = hasDr ? (aboveBank ? row.h - bank.y - bank.h : bank.y) : row.h;
      const shelfYs = (n: number): number[] => {
        if (n <= 0 || zoneH <= 0) return [];
        if (col.shelfMode === "manual" && (col.shelfPositions?.length ?? 0) > 0)
          return (col.shelfPositions ?? []).slice(0, n).map((yy) => zoneY + Math.min(Math.max(yy, 4), Math.max(4, zoneH - 4)));
        return Array.from({ length: n }, (_, k) => zoneY + (zoneH * (k + 1)) / (n + 1));
      };

      // MDF niche back
      if (col.mdfBack)
        add({ x: faceX, y: y0, z: BT, w: faceW, h: row.h, d: col.mdfBackThk ?? S.mdfThk, ox: 0, oy: 0, oz: -0.28 * D, c: XP_PAL.mdf }, `MDF back panel${cTag}`);

      // shelves
      shelfYs(col.shelves).forEach((sy, k) => {
        const sh = (aboveBank ? k : col.shelves - 1 - k); // fan order
        add({ x: innerX + (lay.w - (lay.w - S.shelfIncrease)) / 2, y: y0 + sy, z: BT, w: lay.w - S.shelfIncrease, h: T, d: carcD - S.shelfFrontSetback, ox: 0, oy: 0.06 * H + 40 * sh, oz: 0.55 * D + 25 * sh, c: XP_PAL.ply }, `Shelf${cTag} #${k + 1}`);
      });

      // rail shelves
      if (col.rail && col.rail !== "off" && col.railShelf) {
        railShelfYs(col, S, row.h).forEach((sy, k) =>
          add({ x: innerX, y: y0 + sy, z: BT, w: lay.w - S.shelfIncrease, h: T, d: carcD - S.shelfFrontSetback, ox: 0, oy: 0.06 * H + 40 * k, oz: 0.55 * D + 25 * k, c: XP_PAL.ply }, `Shelf above rail${cTag} #${k + 1}`),
        );
      }

      // drawers: fronts + boxes + splitter
      if (hasDr) {
        let dy = bank.y;
        col.drawers.forEach((dr, k) => {
          const fT = dr.frontMdf ? S.mdfThk : S.drawerThk;
          const front: [string, string, string] = dr.frontMdf ? (S.mdfFinish === "oak" ? XP_PAL.oak : XP_PAL.mdf) : XP_PAL.ply;
          add({ x: faceX, y: y0 + dy, z: D - fT, w: faceW, h: dr.frontHeight, d: fT, ox: 0, oy: 0, oz: 1.25 * D + 25 * k, c: front }, `${dr.hidden ? "Hidden " : ""}Drawer front${cTag} #${k + 1}`);
          const dims = drawerBoxDims(faceW, dr, S);
          add({ x: innerX + (lay.w - dims.boxW) / 2, y: y0 + dy, z: BT, w: dims.boxW, h: dims.sideH, d: dims.boxD, ox: 0, oy: 0, oz: 1.7 * D + 25 * k, c: XP_PAL.drawer }, `Drawer box${cTag} #${k + 1}`);
          dy += dr.frontHeight;
        });
        if (col.splitter)
          add({ x: innerX, y: y0 + bank.y + bank.h - T, z: BT, w: lay.w, h: T, d: carcD - S.shelfFrontSetback, ox: 0, oy: 0.1 * H, oz: 0.8 * D, c: XP_PAL.ply }, `Drawer splitter${cTag}`);
        (col.splitterShelves ?? 0) > 0 &&
          add({ x: innerX, y: y0 + bank.y + bank.h + T, z: BT, w: lay.w - S.shelfIncrease, h: T, d: carcD - S.shelfFrontSetback, ox: 0, oy: 0.12 * H, oz: 0.8 * D, c: XP_PAL.ply }, `Shelf above splitter${cTag}`);
      }

      // fixed panel
      if (col.fixed)
        add({ x: innerX, y: y0 + T, z: BT, w: lay.w, h: row.h - 2 * T, d: carcD - S.shelfFrontSetback, ox: 0, oy: 0.05 * H, oz: 0.6 * D, c: XP_PAL.ply }, `Fixed panel${cTag}`);

      // doors (same suppression as the generator)
      const cabDoor = stacked && !!cab.fullDoor && cab.fullDoor !== "off";
      const fullCols = new Set<number>();
      rows.forEach((r) => r.columns.forEach((c, i) => { if (c.door && c.door.full) fullCols.add(i); }));
      const suppressed = cabDoor || (fullCols.has(ci) ? col.door !== null && !col.door.full : false);
      if (col.door && !col.fixed && (!hasDr || allHidden) && !suppressed) {
        const door = col.door;
        const span = door.full ? BH : row.h;
        const dd = doorDims(faceW, span, door, S);
        const fT = door.material === "mdf" ? S.mdfThk : S.bodyThk;
        const pal = door.material === "glass" ? XP_PAL.glass : door.material === "mdf" ? (S.mdfFinish === "oak" ? XP_PAL.oak : XP_PAL.mdf) : XP_PAL.ply;
        const dY = door.full ? kick + (BH - dd.h) / 2 : y0 + (row.h - dd.h) / 2;
        const gapOuter = door.style === "inset" ? S.bodyThk + S.doorGap : S.doorGap;
        const gapMid = dd.count === 2 ? Math.max(4, faceW - 2 * gapOuter - 2 * dd.w) : 0;
        const totalW = dd.count === 1 ? dd.w : 2 * dd.w + gapMid;
        const x0 = faceX + (faceW - totalW) / 2;
        const nH = effectiveHingeCount(door, dd.h);
        const cups = hingeCupYs(dd.h, nH);
        const cupL = (j: number) => {
          const hingedLeft = dd.count === 1 ? door.swing === "left" : j === 0;
          return hingedLeft ? S.hingeCupEdge : dd.w - S.hingeCupEdge;
        };
        for (let j = 0; j < dd.count; j++) {
          const lx = door.type === "sliding" ? faceX + j * (faceW - dd.w) / 2 : x0 + j * (dd.w + gapMid);
          const zOff = door.type === "sliding" && j === 1 ? fT + 5 : 0;
          const dName =
            door.type === "sliding"
              ? `Sliding door${cTag} #${j + 1}`
              : `Door${cTag}${dd.count === 2 ? (j === 0 ? " L" : " R") : ""}`;
          add(
            { x: lx, y: dY, z: D - fT + zOff, w: dd.w, h: dd.h, d: fT, ox: dd.count === 2 ? (j === 0 ? -0.1 : 0.1) * W : 0, oy: 0.06 * H, oz: 0.85 * D + zOff, c: pal },
            dName,
          );
          // hinge cups ride along on the data so the JS can mark them (t>0.35)
          parts[parts.length - 1].hc = { n: nH, ys: cups, cx: cupL(j), dia: S.hingeCupDiameter };
        }
      }
    });
  });

  // ---- cabinet-level full door (stacked cabinets only, like the generator) ----
  if (stacked && cab.fullDoor && cab.fullDoor !== "off") {
    const raw = cab.fullDoor as string;
    const suffix = raw.includes("-") ? raw.split("-")[1] : "";
    const type: "double" | "single" = suffix === "double" ? "double" : suffix === "left" || suffix === "right" ? "single" : W > 620 ? "double" : "single";
    const fd: any = {
      type, style: "overlay", swing: suffix === "right" ? "right" : "left",
      material: raw.startsWith("glass") ? "glass" : "mdf", mdfThk: S.mdfThk,
      hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", full: true, hingeCount: cab.fullDoorHinges,
    };
    const dd = doorDims(W, BH, fd, S);
    const fT = S.mdfThk;
    const pal = fd.material === "glass" ? XP_PAL.glass : XP_PAL.mdf;
    const gapMid = dd.count === 2 ? Math.max(4, W - 2 * S.doorGap - 2 * dd.w) : 0;
    const totalW = dd.count === 1 ? dd.w : 2 * dd.w + gapMid;
    const nH = effectiveHingeCount(fd, dd.h);
    const cups = hingeCupYs(dd.h, nH);
    for (let j = 0; j < dd.count; j++) {
      const lx = (W - totalW) / 2 + j * (dd.w + gapMid);
      const cupL = dd.count === 1 ? (fd.swing === "left" ? S.hingeCupEdge : dd.w - S.hingeCupEdge) : j === 0 ? S.hingeCupEdge : dd.w - S.hingeCupEdge;
      add(
        { x: lx, y: kick + (BH - dd.h) / 2, z: D - fT, w: dd.w, h: dd.h, d: fT, ox: dd.count === 2 ? (j === 0 ? -0.1 : 0.1) * W : 0, oy: 0.08 * H, oz: 0.9 * D, c: pal },
        `Full door${dd.count === 2 ? (j === 0 ? " L" : " R") : ""}`,
      );
      (parts[parts.length - 1] as any).hc = { n: nH, ys: cups, cx: cupL, dia: S.hingeCupDiameter };
    }
  }

  // ---- cover panels (same dims + centering as the 3D/2D views) ----
  (cab.covers ?? []).forEach((cv) => {
    const dims = coverPanelDims(cab, S, cv);
    const pal = cv.mat === "mdf" ? (cv.finish ?? S.mdfFinish) === "oak" ? XP_PAL.oak : XP_PAL.mdf : XP_PAL.ply;
    const cx = coverCenterX(cab, S);
    if (cv.side === "L")
      add({ x: -dims.thk, y: 0, z: (D - dims.w) / 2, w: dims.thk, h: dims.h, d: dims.w, ox: -0.28 * W, oy: 0, oz: 0, c: pal }, "Cover panel L");
    else if (cv.side === "R")
      add({ x: W, y: 0, z: (D - dims.w) / 2, w: dims.thk, h: dims.h, d: dims.w, ox: 0.28 * W, oy: 0, oz: 0, c: pal }, "Cover panel R");
    else if (cv.side === "T")
      add({ x: cx - dims.w / 2, y: H, z: (D - dims.h) / 2, w: dims.w, h: dims.thk, d: dims.h, ox: 0, oy: 0.3 * H + 40, oz: 0, c: pal }, "Cover panel T");
    else
      add({ x: cx - dims.w / 2, y: -kick - dims.thk, z: (D - dims.h) / 2, w: dims.w, h: dims.thk, d: dims.h, ox: 0, oy: -0.28 * H, oz: 0, c: pal }, "Cover panel B");
  });

  return parts;
}

/** project ALL corners of a part box (at explode factor t) into canvas px */
function xpBoxCorners(p: XpPart, t: number, o: { x: number; y: number }, s: number): [number, number][] {
  const x = p.x + p.ox * t, y = p.y + p.oy * t, z = p.z + p.oz * t;
  return (
    [
      [x, y, z], [x + p.w, y, z], [x + p.w, y + p.h, z], [x, y + p.h, z],
      [x, y, z + p.d], [x + p.w, y, z + p.d], [x + p.w, y + p.h, z + p.d], [x, y + p.h, z + p.d],
    ] as [number, number, number][]
  ).map((c) => xpProj(c[0], c[1], c[2], o, s));
}

/** render one part box as three face polygons (right, front, top) */
function xpFaces(p: XpPart, t: number, o: { x: number; y: number }, s: number): { pts: [number, number][]; fill: string }[] {
  const c = xpBoxCorners(p, t, o, s);
  // c: 0=x0y0z0 1=x1y0z0 2=x1y1z0 3=x0y1z0 4=x0y0z1 5=x1y0z1 6=x1y1z1 7=x0y1z1
  const f = (idx: number[], fill: string) => ({ pts: idx.map((i) => c[i]), fill });
  return [
    f([1, 5, 6, 2], p.c[2]), // right
    f([4, 5, 6, 7], p.c[1]), // front
    f([3, 7, 6, 2], p.c[0]), // top
  ];
}

const f1 = (n: number) => (Math.round(n * 100) / 100).toString();

/** static (t=1) SVG of the exploded diagram — the print / no-JS fallback */
function renderExplodeStatic(parts: XpPart[], o: { x: number; y: number }, s: number, VW: number, VH: number): string {
  const list = parts
    .map((p) => ({ p, depth: p.x + p.ox + p.w + p.z + p.oz + p.d, topY: p.y + p.oy + p.h }))
    .sort((a, b) => a.depth - b.depth || a.topY - b.topY);
  let out = `<rect width="${VW}" height="${VH}" fill="#ffffff"/>`;
  for (const { p } of list) {
    const faces = xpFaces(p, 1, o, s);
    for (const f of faces)
      out += `<polygon points="${f.pts.map((q) => `${f1(q[0])},${f1(q[1])}`).join(" ")}" fill="${f.fill}" stroke="#5b4a2f" stroke-width="0.9" stroke-linejoin="round"/>`;
    // label at the top-front-right corner
    const lab = xpProj(p.x + p.ox + p.w, p.y + p.oy + p.h, p.z + p.oz + p.d, o, s);
    const big = Math.max(p.w * s, p.h * s, p.d * s) > 26;
    if (big) {
      out += `<text x="${f1(lab[0] + 5)}" y="${f1(lab[1] - 4)}" font-size="9.5" font-weight="700" fill="#333">${escH(p.n)}</text>`;
      out += `<text x="${f1(lab[0] + 5)}" y="${f1(lab[1] + 6)}" font-size="8.5" fill="#666">${escH(p.l)} mm</text>`;
    }
  }
  return out;
}

const XP_JS = `
(function () {
  var C = 0.8660254, S3 = 0.5;
  var blocks = [];
  function P(o, s, x, y, z) { return [o.x + (x - z) * C * s, o.y + ((x + z) * S3 - y) * s]; }
  function render(b, t) {
    var d = b.data, o = d.o, s = d.s, svg = b.svg;
    var list = d.parts.map(function (p) {
      return { p: p, x: p.x + p.ox * t, y: p.y + p.oy * t, z: p.z + p.oz * t,
               depth: p.x + p.ox + p.w + p.z + p.oz + p.d, topY: p.y + p.oy + p.h };
    }).sort(function (a, bb) { return (a.depth - bb.depth) || (a.topY - bb.topY); });
    var out = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i], p = it.p, x1 = it.x + p.w, y1 = it.y + p.h, z1 = it.z + p.d;
      var c = [
        [it.x, it.y, it.z], [x1, it.y, it.z], [x1, y1, it.z], [it.x, y1, it.z],
        [it.x, it.y, z1], [x1, it.y, z1], [x1, y1, z1], [it.x, y1, z1]
      ].map(function (q) { return P(o, s, q[0], q[1], q[2]); });
      var face = function (idx, fill) {
        var pts = idx.map(function (j) { return c[j][0].toFixed(1) + ',' + c[j][1].toFixed(1); }).join(' ');
        return '<polygon points="' + pts + '" fill="' + fill + '" stroke="#5b4a2f" stroke-width="0.9" stroke-linejoin="round"/>';
      };
      out += face([1, 5, 6, 2], p.c[2]) + face([4, 5, 6, 7], p.c[1]) + face([3, 7, 6, 2], p.c[0]);
      if (Math.max(p.w * s, p.h * s, p.d * s) > 26) {
        var lab = P(o, s, x1, y1, z1);
        var lo = Math.min(1, t * 1.25).toFixed(2);
        out += '<g opacity="' + lo + '"><text x="' + (lab[0] + 5).toFixed(1) + '" y="' + (lab[1] - 4).toFixed(1) +
          '" font-size="9.5" font-weight="700" fill="#333">' + p.n + '</text><text x="' + (lab[0] + 5).toFixed(1) +
          '" y="' + (lab[1] + 6).toFixed(1) + '" font-size="8.5" fill="#666">' + p.l + ' mm</text></g>';
      }
      // hinge cups (door leaves) on the leaf front face — fade in with the explode
      if (p.hc && t > 0.35) {
        var cups = p.hc;
        var a = Math.min(1, (t - 0.35) * 1.6);
        for (var k = 0; k < cups.ys.length; k++) {
          var cx = P(o, s, it.x + cups.cx, it.y + cups.ys[k], z1);
          out += '<circle cx="' + cx[0].toFixed(1) + '" cy="' + cx[1].toFixed(1) +
            '" r="' + Math.max(2.2, Math.min(6.5, (cups.dia / 2) * s * 10)).toFixed(1) +
            '" fill="rgba(248,113,113,' + a.toFixed(2) + ')" stroke="#7f1d1d" stroke-width="0.7"/>';
        }
      }
    }
    svg.innerHTML = out;
    if (b.slider) b.slider.value = String(t);
  }
  function animate(b, from, to, dur) {
    stop(b);
    var t0 = null;
    function step(now) {
      if (t0 === null) t0 = now;
      var u = Math.min(1, (now - t0) / dur);
      var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      render(b, from + (to - from) * e);
      if (u < 1) b.raf = requestAnimationFrame(step); else b.raf = null;
    }
    b.raf = requestAnimationFrame(step);
  }
  function stop(b) { if (b.raf) { cancelAnimationFrame(b.raf); b.raf = null; } }
  document.querySelectorAll('.xp-block').forEach(function (wrap) {
    var svg = wrap.querySelector('svg.xp-svg');
    var dataEl = wrap.querySelector('script.xp-data');
    if (!svg || !dataEl) return;
    var data;
    try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
    var b = { svg: svg, data: data, slider: wrap.querySelector('.xp-slider'), raf: null, t: 1 };
    blocks.push(b);
    render(b, 1);
    if (b.slider) b.slider.addEventListener('input', function () { stop(b); render(b, parseFloat(b.slider.value)); });
    var bA = wrap.querySelector('.xp-assemble'), bE = wrap.querySelector('.xp-explode');
    if (bA) bA.addEventListener('click', function () { animate(b, b.t, 0, 750); b.t = 0; });
    if (bE) bE.addEventListener('click', function () { animate(b, b.t, 1, 750); b.t = 1; });
    // when the user drags the slider mid-animation we must track the value
    if (b.slider) b.slider.addEventListener('change', function () { b.t = parseFloat(b.slider.value); });
  });
  // print always shows the exploded state
  if (window.addEventListener) window.addEventListener('beforeprint', function () { blocks.forEach(function (b) { render(b, 1); b.t = 1; }); });
})();
`;

/** full interactive block: controls + svg (pre-rendered exploded) + data */
function interactiveExplodeHtml(cab: Cabinet, S: Settings): string {
  const parts = buildExplodeParts(cab, S);
  if (parts.length < 3)
    return `<div class="card small">Interactive exploded view is not available for this cabinet type — see the 2D parts layout instead.</div>`;

  // canvas: fit the t=1 (exploded) extent, prefer landscape, go portrait for tall units
  const portrait = cab.height > cab.width * 1.25;
  const VW = portrait ? 980 : 1150;
  const VH = portrait ? 1150 : 800;
  const padL = 30, padR = 150, padT = 30, padB = 24;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of parts) {
    for (const t of [0, 1]) {
      for (const c of xpBoxCorners(p, t, { x: 0, y: 0 }, 1)) {
        minX = Math.min(minX, c[0]); minY = Math.min(minY, c[1]);
        maxX = Math.max(maxX, c[0]); maxY = Math.max(maxY, c[1]);
      }
    }
  }
  const extW = Math.max(1, maxX - minX), extH = Math.max(1, maxY - minY);
  const s = Math.min((VW - padL - padR) / extW, (VH - padT - padB) / extH, 0.22);
  const o = {
    x: padL + (VW - padL - padR - extW * s) / 2 - minX * s,
    y: padT + (VH - padT - padB - extH * s) / 2 - minY * s,
  };
  const body = renderExplodeStatic(parts, o, s, VW, VH);
  // JSON data — escape '<' so part names can never close the script tag
  const data = JSON.stringify({ o, s, parts }).replace(/</g, "\\u003c");
  return `
  <div class="xp-block">
    <div class="xp-ctrl no-print">
      <button type="button" class="xp-assemble">▣ Assembled</button>
      <input type="range" class="xp-slider" min="0" max="1" step="0.01" value="1" aria-label="Explode factor"/>
      <button type="button" class="xp-explode">⬚ Exploded</button>
      <span class="xp-hint">drag the slider — 0 = assembled · 1 = exploded</span>
    </div>
    <svg class="xp-svg" xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" font-family="Arial, Helvetica, sans-serif">${body}</svg>
    <script type="application/json" class="xp-data">${data}</script>
  </div>`;
}

/** Open door view – front with doors open 90° outward, drawers pulled, shelves visible */
function openDoorViewSvg(cab: Cabinet, S: Settings): string {
  const W = cab.width, H = cab.height, D = cab.depth;
  const kick = modelKickH(cab, S);
  const BH = H - kick;
  const VW=900, VH=620;
  const sc = Math.min((VW-260)/Math.max(W,1), (VH-120)/Math.max(H,1))*0.9;
  const ox = 130, base = VH-80;
  const f = (n:number)=> f2(n);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" font-family="Arial, Helvetica, sans-serif">`;
  out += `<rect width="${VW}" height="${VH}" fill="#ffffff"/>`;
  out += `<text x="${VW/2}" y="24" font-size="14" font-weight="700" text-anchor="middle" fill="#111">${escH(cab.name)} – Open Door View – ${W}×${H}×${D} – doors open 90°, drawers pulled 60%</text>`;
  const cabX = ox, cabTop = base - H*sc;
  out += `<rect x="${f(cabX)}" y="${f(cabTop)}" width="${f(W*sc)}" height="${f(H*sc)}" fill="#f5f0e0" stroke="#111" stroke-width="1.4"/>`;
  if (kick>0){
    out += `<rect x="${f(cabX)}" y="${f(base-kick*sc)}" width="${f(W*sc)}" height="${f(kick*sc)}" fill="#1a2740" opacity="0.8"/>`;
    out += `<text x="${f(cabX+W*sc/2)}" y="${f(base-kick*sc/2+3)}" font-size="8" fill="#8aa0c4" text-anchor="middle">KICK ${kick}mm</text>`;
  }
  // rows
  let y0 = kick;
  cab.rows.forEach(row=>{
    const rowTop = base - (y0+row.h)*sc;
    const lays = columnLayout(cab, row, S);
    lays.forEach(lay=>{
      const col = lay.col;
      const colX = cabX + (S.bodyThk+lay.x)*sc;
      const colW = lay.w*sc;
      // side divider
      if (!lay.last) out += `<line x1="${f(colX+colW)}" y1="${f(rowTop)}" x2="${f(colX+colW)}" y2="${f(rowTop+row.h*sc)}" stroke="#888" stroke-width="0.8"/>`;
      // shelves or drawers — SAME zone math as the part generator (model.ts
      // buildColumn): the bank sits where drawerAlign puts it, shelves fill
      // the leftover zone above (bottom/custom) or below (top) the bank
      const hasDr = columnHasDrawers(col);
      const bank = hasDr ? drawerBank(col, row.h, S) : { y: 0, h: 0 };
      const aboveBank = col.drawerAlign !== "top";
      const zoneY = hasDr ? (aboveBank ? bank.y + bank.h : 0) : 0;
      const zoneH = hasDr ? (aboveBank ? row.h - bank.y - bank.h : bank.y) : row.h;
      const shelfYs = (n: number): number[] => {
        if (n <= 0 || zoneH <= 0) return [];
        if (col.shelfMode === "manual" && (col.shelfPositions?.length ?? 0) > 0)
          return (col.shelfPositions ?? []).slice(0, n).map((yy) => zoneY + Math.min(Math.max(yy, 4), Math.max(4, zoneH - 4)));
        return Array.from({ length: n }, (_, k) => zoneY + (zoneH * (k + 1)) / (n + 1));
      };
      if (hasDr){
        // shelves in the leftover zone (dashed — same zone the generator uses)
        shelfYs(col.shelves).forEach((syMm)=>{
          const sy = base - (y0 + syMm)*sc;
          out += `<line x1="${f(colX+2)}" y1="${f(sy)}" x2="${f(colX+colW-2)}" y2="${f(sy)}" stroke="#3a5a8a" stroke-width="0.9" stroke-dasharray="3 3"/>`;
        });
        // drawers as pulled boxes in front, starting at the real bank Y
        let dy = bank.y;
        col.drawers.forEach(dr=>{
          const dh = dr.frontHeight*sc;
          const yy = base - (y0+dy+dr.frontHeight)*sc;
          // drawer box pulled 60%
          const pull = D*0.6*sc*0.35;
          out += `<rect x="${f(colX+pull)}" y="${f(yy)}" width="${f(colW-pull*0.2)}" height="${f(dh)}" fill="#d0c0a0" stroke="#5a4a36" stroke-width="0.9"/>`;
          out += `<text x="${f(colX+colW/2)}" y="${f(yy+dh/2+2)}" font-size="7" fill="#333" text-anchor="middle">Drawer ${dr.frontHeight}mm</text>`;
          dy+=dr.frontHeight;
        });
      } else if (col.fixed){
        out += `<rect x="${f(colX)}" y="${f(rowTop)}" width="${f(colW)}" height="${f(row.h*sc)}" fill="#e0d0b0" stroke="#888" stroke-dasharray="5 3"/>`;
      } else {
        // shelves (manual Y positions honored, like the generator)
        shelfYs(col.shelves).forEach((syMm)=>{
          const sy = base - (y0 + syMm)*sc;
          out += `<line x1="${f(colX+2)}" y1="${f(sy)}" x2="${f(colX+colW-2)}" y2="${f(sy)}" stroke="#3a5a8a" stroke-width="1"/>`;
        });
        // rail
        if (col.rail && col.rail!=='off'){
          const rh = col.railHeight ?? (col.rail==='suits'? S.railSuitsH : col.rail==='dresses'? S.railDressesH : S.railDouble1);
          const ry = base - (y0+rh)*sc;
          out += `<line x1="${f(colX+4)}" y1="${f(ry)}" x2="${f(colX+colW-4)}" y2="${f(ry)}" stroke="#d4af37" stroke-width="2"/>`;
          out += `<text x="${f(colX+colW/2)}" y="${f(ry-3)}" font-size="7" fill="#8a6a20" text-anchor="middle">${col.rail.toUpperCase()} ${rh}mm</text>`;
          if (col.railShelf){
            railShelfYs(col,S,row.h).forEach(syMm=>{
              const sy = base - (y0+syMm)*sc;
              out += `<line x1="${f(colX+2)}" y1="${f(sy)}" x2="${f(colX+colW-2)}" y2="${f(sy)}" stroke="#3a5a8a" stroke-dasharray="2 3"/>`;
            });
          }
        }
      }
    });
    y0+=row.h;
  });

  // doors open – draw outside with the REAL hinge count and cup positions
  // (same rule as the part generator: effectiveHingeCount + hingeCupYs)
  interface OpenDoor {
    x: number; y: number; w: number; h: number; label: string;
    /** cup positions (mm from leaf bottom) on the given edge — 'R' = right edge of the leaf */
    hinges?: { n: number; ys: number[]; edge: "L" | "R" };
    sliding?: boolean;
    glass?: boolean;
  }
  let doorIndex = 0;
  const openDoors: OpenDoor[] = [];
  // clamp open-leaf widths to the space beside the cabinet (wide double doors
  // would otherwise draw off-canvas) — labels keep the true dimensions
  const leafW = (d: number) =>
    Math.min(d * sc, Math.max(30, cabX - 17), Math.max(30, VW - 17 - cabX - W * sc));
  const fullDoorActive = modelStackOn(cab) && !!cab.fullDoor && cab.fullDoor !== "off";
  if (fullDoorActive) {
    // one long door (or pair) across the whole stack — exactly like genCabinetFullDoor
    const raw = cab.fullDoor as string;
    const suffix = raw.includes("-") ? raw.split("-")[1] : "";
    const isDouble = suffix === "double" || (suffix !== "left" && suffix !== "right" && W > 620);
    const fdSpec: any = {
      type: isDouble ? "double" : "single", style: "overlay", swing: suffix === "right" ? "right" : "left",
      material: raw.startsWith("glass") ? "glass" : "mdf", mdfThk: S.mdfThk,
      hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", full: true, hingeCount: cab.fullDoorHinges,
    };
    const fullH = modelStackedHeights(cab).reduce((a, h) => a + h, 0) - kick;
    const dd = doorDims(W, fullH, fdSpec, S);
    const nH = effectiveHingeCount(fdSpec, dd.h);
    const cups = hingeCupYs(dd.h, nH);
    const yT = base - (kick + fullH) * sc;
    if (isDouble) {
      const lw = leafW(dd.w);
      openDoors.push({ x: cabX - lw - 15, y: yT, w: lw, h: dd.h * sc, label: `Full door L ${Math.round(dd.w)}×${Math.round(dd.h)}`, hinges: { n: nH, ys: cups, edge: "R" }, glass: fdSpec.material === "glass" });
      openDoors.push({ x: cabX + W * sc + 15, y: yT, w: lw, h: dd.h * sc, label: `Full door R ${Math.round(dd.w)}×${Math.round(dd.h)}`, hinges: { n: nH, ys: cups, edge: "L" }, glass: fdSpec.material === "glass" });
    } else {
      const left = fdSpec.swing === "left";
      const lw = leafW(dd.w);
      openDoors.push({ x: left ? cabX - lw - 15 : cabX + W * sc + 15, y: yT, w: lw, h: dd.h * sc, label: `Full door ${W}×${fullH} · ${left ? "L" : "R"}`, hinges: { n: nH, ys: cups, edge: left ? "R" : "L" }, glass: fdSpec.material === "glass" });
    }
  } else {
    // per-row Y accumulator: each door must hang next to ITS OWN row, not at
    // the final y0 (which by now equals the full carcass height)
    let ry0 = kick;
    cab.rows.forEach((row) => {
      const lays = columnLayout(cab, row, S);
      lays.forEach((lay) => {
        const col = lay.col;
        // SAME suppression as the part generator: fixed panels and columns
        // with visible drawers have NO door — drawing one here would promise
        // hinges/leaves that don't exist
        const hasDr = columnHasDrawers(col);
        const allHidden = hasDr && col.drawers.every((d) => d.hidden);
        if (!col.door || col.fixed || (hasDr && !allHidden)) return;
        const fullSpan = col.door.full ? BH : row.h;
        // face width exactly like the generator (single column = full width,
        // otherwise the column face with its carcass-edge overlays)
        const faceW = lays.length === 1 ? W : columnFaceWidth(cab, lay, S);
        const d = doorDims(faceW, fullSpan, col.door, S);
        const y = col.door.full ? base - (kick + fullSpan) * sc : base - (ry0 + fullSpan) * sc;
        const nH = effectiveHingeCount(col.door, d.h);
        const cups = hingeCupYs(d.h, nH);
        const glass = col.door.material === "glass";
        if (col.door.type === "sliding") {
          // two overlapping leaves on a track — NO hinge cups
          openDoors.push({ x: cabX - d.w * sc * 0.18 - 8, y, w: d.w * sc, h: d.h * sc, label: `Sliding #${doorIndex + 1} ${Math.round(d.w)}×${Math.round(d.h)}`, sliding: true, glass });
          openDoors.push({ x: cabX + d.w * sc * 0.18 + 8, y, w: d.w * sc, h: d.h * sc, label: `Sliding #${doorIndex + 2} ${Math.round(d.w)}×${Math.round(d.h)}`, sliding: true, glass });
          doorIndex += 2;
        } else if (col.door.type === "double") {
          const lw = leafW(d.w);
          openDoors.push({ x: cabX - lw - 15, y, w: lw, h: d.h * sc, label: `Door ${doorIndex + 1}L ${Math.round(d.w)}×${Math.round(d.h)}`, hinges: { n: nH, ys: cups, edge: "R" }, glass });
          openDoors.push({ x: cabX + W * sc + 15, y, w: lw, h: d.h * sc, label: `Door ${doorIndex + 2}R ${Math.round(d.w)}×${Math.round(d.h)}`, hinges: { n: nH, ys: cups, edge: "L" }, glass });
          doorIndex += 2;
        } else {
          const left = col.door.swing === "left";
          const lw = leafW(d.w);
          openDoors.push({ x: left ? cabX - lw - 15 : cabX + W * sc + 15, y, w: lw, h: d.h * sc, label: `Door ${doorIndex + 1} ${Math.round(d.w)}×${Math.round(d.h)} ${left ? "L" : "R"}`, hinges: { n: nH, ys: cups, edge: left ? "R" : "L" }, glass });
          doorIndex++;
        }
      });
      ry0 += row.h;
    });
  }
  openDoors.forEach((od) => {
    const fill = od.glass ? "rgba(176,210,235,0.55)" : od.sliding ? "rgba(194,214,232,0.75)" : "#c2d6e8";
    out += `<rect x="${f(od.x)}" y="${f(od.y)}" width="${f(od.w)}" height="${f(od.h)}" fill="${fill}" stroke="#2a4a6a" stroke-width="1" stroke-dasharray="${od.glass ? "5 3" : ""}"/>`;
    if (od.sliding) {
      // track marks at the top instead of hinge cups
      out += `<line x1="${f(od.x + 3)}" y1="${f(od.y + 4)}" x2="${f(od.x + od.w - 3)}" y2="${f(od.y + 4)}" stroke="#444" stroke-width="2"/>`;
      out += `<text x="${f(od.x + od.w / 2)}" y="${f(od.y + 14)}" font-size="6.5" fill="#444" text-anchor="middle">TRACK — no hinge cups</text>`;
    } else if (od.hinges && od.hinges.n > 0) {
      // the REAL cups: n of them, 140mm from ends, on the HINGED edge
      // (a leaf opened to the left is hinged on its RIGHT edge, and vice versa)
      const hx = od.hinges.edge === "R" ? od.x + od.w - 5 : od.x + 5;
      for (const cupY of od.hinges.ys)
        out += `<circle cx="${f(hx)}" cy="${f(od.y + od.h - cupY * sc)}" r="3.1" fill="#f87171" stroke="#7f1d1d" stroke-width="0.6"/>`;
      const tagY = od.y + od.h + 9;
      out += `<text x="${f(hx)}" y="${f(tagY)}" font-size="7" fill="#b91c1c" text-anchor="middle">${od.hinges.n}× Ø${S.hingeCupDiameter}</text>`;
    }
    out += `<text x="${f(od.x + od.w / 2)}" y="${f(od.y - 4)}" font-size="7" fill="#2a4a6a" text-anchor="middle">${escH(od.label)}</text>`;
    // leader line to cabinet
    const cx1 = od.x + od.w / 2 < cabX ? od.x + od.w : od.x;
    out += `<line x1="${f(cx1)}" y1="${f(od.y + od.h / 2)}" x2="${f(od.x + od.w / 2 < cabX ? cabX : cabX + W * sc)}" y2="${f(od.y + od.h / 2)}" stroke="#999" stroke-dasharray="2 2" stroke-width="0.6"/>`;
  });

  // dimensions
  out += `<line x1="${f(cabX)}" y1="${f(base+18)}" x2="${f(cabX+W*sc)}" y2="${f(base+18)}" stroke="#111" stroke-width="0.8"/>`;
  out += `<text x="${f(cabX+W*sc/2)}" y="${f(base+32)}" font-size="10" text-anchor="middle" fill="#111">${W}mm</text>`;
  out += `<line x1="${f(cabX-18)}" y1="${f(cabTop)}" x2="${f(cabX-18)}" y2="${f(base)}" stroke="#111" stroke-width="0.8"/>`;
  out += `<text x="${f(cabX-28)}" y="${f(cabTop+H*sc/2)}" font-size="10" text-anchor="middle" fill="#111" transform="rotate(-90 ${f(cabX-28)} ${f(cabTop+H*sc/2)})">${H}mm</text>`;

  out += `</svg>`;
  return out;
}

/**
 * Side drilling map — the side panel(s) with their holes, drawn from the TRUE
 * merged part geometry (same W×H, same hole coordinates as the cut list, the
 * Drilling tab and the DXF). Because the holes are plotted in the part's OWN
 * coordinate frame, they can never land outside the panel outline — a hole
 * drawn outside would mean the generator itself placed it wrong, not the map.
 * Stacked cabinets get one map per box panel; corner cabinets have no side
 * panels (a note is drawn instead).
 */
function drillingMapSvg(cab: Cabinet, S: Settings, side: 'L'|'R', grain: GrainOverrides, rot: RotationOverrides = {}): string {
  const panels = allPartsMerged([cab], S, grain, [], rot).filter((p) =>
    p.name === `Side panel ${side}` || p.name.startsWith(`Side panel ${side} `),
  );
  const VW = 420;
  const ox = 40, topPad = 44, gapY = 44;
  const holeColor = (kind: string) => kind === "slide" ? "#38bdf8" : kind === "hinge" ? "#f87171" : "#f5b33c";
  let out = "";
  let y = topPad;

  const drawPanel = (p: Part): string => {
    const sc = Math.min((VW - 100) / Math.max(1, p.w), 420 / Math.max(1, p.h));
    const pw = p.w * sc, ph = p.h * sc;
    let s = `<text x="${f2(ox + pw / 2)}" y="${f2(y - 8)}" font-size="11" font-weight="700" text-anchor="middle" fill="#111">${escH(p.name)} – ${p.w}×${p.h}${p.qty > 1 ? ` ×${p.qty}` : ""} – ${p.holes.length} holes</text>`;
    s += `<rect x="${f2(ox)}" y="${f2(y)}" width="${f2(pw)}" height="${f2(ph)}" fill="#f9f5e8" stroke="#111" stroke-width="1"/>`;
    // polygon outline (notched L/C sides) for orientation
    if (p.shape === "poly" && p.outline.length > 2) {
      const pts = p.outline.map(([px, py]) => `${f2(ox + px * sc)} ${f2(y + (p.h - py) * sc)}`).join(" ");
      s += `<polygon points="${pts}" fill="rgba(249,245,232,0.0)" stroke="#7a6a4a" stroke-width="1.2"/>`;
    }
    // slot / drawer grooves at true coordinates
    for (const g of p.grooves) {
      s += `<rect x="${f2(ox + g.x1 * sc)}" y="${f2(y + (p.h - g.y2) * sc)}" width="${f2(Math.max(1, (g.x2 - g.x1) * sc))}" height="${f2(Math.max(1, (g.y2 - g.y1) * sc))}" fill="none" stroke="#a855f7" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    }
    // holes at true coordinates (SVG y grows down, part y grows up)
    for (const h of p.holes) {
      const r = h.kind === "hinge" ? 4 : h.dia >= 5 ? 3 : 2;
      s += `<circle cx="${f2(ox + h.x * sc)}" cy="${f2(y + (p.h - h.y) * sc)}" r="${r}" fill="${holeColor(h.kind)}" stroke="#111" stroke-width="0.4"/>`;
    }
    // banded edges = the FRONT edge on side panels — labeled for orientation
    const tick = "#d0654a";
    if (p.band.left) s += `<rect x="${f2(ox)}" y="${f2(y)}" width="3" height="${f2(ph)}" fill="${tick}"/>`;
    if (p.band.right) s += `<rect x="${f2(ox + pw - 3)}" y="${f2(y)}" width="3" height="${f2(ph)}" fill="${tick}"/>`;
    if (p.band.top) s += `<rect x="${f2(ox)}" y="${f2(y)}" width="${f2(pw)}" height="3" fill="${tick}"/>`;
    if (p.band.bottom) s += `<rect x="${f2(ox)}" y="${f2(y + ph - 3)}" width="${f2(pw)}" height="3" fill="${tick}"/>`;
    if (p.band.top || p.band.bottom || p.band.left || p.band.right)
      s += `<text x="${f2(ox + pw + 6)}" y="${f2(y + 10)}" font-size="7.5" fill="#d0654a" font-weight="700">◀ FRONT (banded)</text>`;
    // W×H dimension labels
    s += `<text x="${f2(ox + pw / 2)}" y="${f2(y + ph + 14)}" font-size="8" fill="#111" text-anchor="middle">${p.w}mm</text>`;
    s += `<text x="${f2(ox - 8)}" y="${f2(y + ph / 2)}" font-size="8" fill="#111" text-anchor="middle" transform="rotate(-90 ${f2(ox - 8)} ${f2(y + ph / 2)})">${p.h}mm</text>`;
    y += ph + gapY;
    return s;
  };

  if (panels.length > 0) panels.forEach((p) => { out += drawPanel(p); });
  else out += `<text x="${f2(VW / 2)}" y="60" font-size="10" fill="#555" text-anchor="middle">No side panel ${side} on this cabinet (corner / special type).</text>`;

  const VH = Math.max(200, Math.round(y + 34));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" font-family="Arial, Helvetica, sans-serif">`
    + `<rect width="${VW}" height="${VH}" fill="#fff"/>`
    + `<text x="${f2(VW / 2)}" y="18" font-size="11" font-weight="700" text-anchor="middle" fill="#111">Side ${side} drilling map – cut orientation (same as cut list / DXF)</text>`
    + out
    + `<text x="${f2(ox)}" y="${f2(VH - 8)}" font-size="8" fill="#555">Shelf ⌀${S.holeDiameter} · Slide ⌀${S.slideHoleDiameter} · Hinge ⌀${S.hingeCupDiameter} · 32mm system · orange tick = banded (front) edge</text>`
    + `</svg>`;
}

function perCabinetCutTable(cab: Cabinet, S: Settings, grain: GrainOverrides, rot: RotationOverrides = {}): string {
  // drawn EXACTLY as the cut list holds them (cut-list manual rotations
  // included) — rotating a second time here used to mirror every banding edge
  const merged = allPartsMerged([cab], S, grain, [], rot);
  const rows = merged.map((p,i)=>{
    const bendM = (bandLengthMm(p)*p.qty/1000).toFixed(2);
    const area = (p.w*p.h*p.qty/1e6).toFixed(3);
    const holes = p.holes.length * p.qty;
    return `<tr><td>${i+1}</td><td>${escH(p.name)}</td><td>${escH(matLabel(S,p))}</td><td class="num">${p.thickness}</td><td class="num">${p.w}</td><td class="num">${p.h}</td><td class="num">${p.qty}</td><td>${bandStr(p.band)||'-'}</td><td class="num">${bendM}m</td><td class="num">${area}m²</td><td class="num">${holes}</td><td>${p.grain?'locked':''}</td><td class="small">${escH(p.note||'')}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>#</th><th>Part</th><th>Material</th><th>Thk</th><th>L mm</th><th>W mm</th><th>Qty</th><th>Banding</th><th>Bend</th><th>Area</th><th>Holes</th><th>Grain</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function perCabinetHardware(cab: Cabinet, S: Settings): string {
  let hinges = 0, rails = 0;
  const slides: Record<number, number> = {};
  const kick = modelKickH(cab, S);
  const fullSpan = (modelStackOn(cab) ? modelStackedHeights(cab).reduce((a, h) => a + h, 0) : cab.height) - kick;
  // a cabinet-level full door (stacked cabinets only) suppresses EVERY
  // per-column door — exactly like the part generator (buildStackedBody)
  const fullDoorActive = modelStackOn(cab) && !!cab.fullDoor && cab.fullDoor !== "off";
  const columnHasDrawersLocal = (col: Cabinet["rows"][number]["columns"][number]) => columnHasDrawers(col);
  cab.rows.forEach((row) => {
    const lays = columnLayout(cab, row, S);
    row.columns.forEach((col, ci) => {
      if (col.door && !col.fixed && !fullDoorActive) {
        const allHidden = col.drawers.length > 0 && col.drawers.every((dr) => dr.hidden);
        if (!columnHasDrawersLocal(col) || allHidden) {
          // same leaf dims + clamp as the generator: leaves × (1..6 cups each);
          // sliding doors take 0 (effectiveHingeCount returns 0 for them)
          const lay = lays.find((l) => l.col.id === col.id) ?? lays[ci];
          const faceW = lays.length === 1 ? cab.width : columnFaceWidth(cab, lay, S);
          const dd = doorDims(faceW, col.door.full ? fullSpan : row.h, col.door, S);
          hinges += dd.count * effectiveHingeCount(col.door, dd.h);
        }
      }
      col.drawers.forEach((dr) => {
        const cm = Math.round(dr.slideDepthCm);
        slides[cm] = (slides[cm] ?? 0) + 1;
      });
      if (col.rail && col.rail !== "off") rails += col.rail === "double" ? 2 : 1;
    });
  });
  if (fullDoorActive) {
    // count the full door exactly like genCabinetFullDoor
    const raw = cab.fullDoor as string;
    const suffix = raw.includes("-") ? raw.split("-")[1] : "";
    const isDouble = suffix === "double" || (suffix !== "left" && suffix !== "right" && cab.width > 620);
    const fdSpec: any = {
      type: isDouble ? "double" : "single", style: "overlay", swing: suffix === "right" ? "right" : "left",
      material: raw.startsWith("glass") ? "glass" : "mdf", mdfThk: S.mdfThk,
      hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", full: true, hingeCount: cab.fullDoorHinges,
    };
    const dd = doorDims(cab.width, fullSpan, fdSpec, S);
    hinges += dd.count * effectiveHingeCount(fdSpec, dd.h);
  }
  // shelves coexist with drawers (they sit above/below the bank), so they count
  // even in drawer columns — plus splitter shelves and rail shelves
  const totalShelves = cab.rows.reduce((a,r)=> a + r.columns.reduce((aa,c)=> aa + c.shelves + (c.splitterShelves ?? 0) + (c.railShelf? railShelfYs(c,S,r.h).length:0) ,0),0);
  const shelfPins = totalShelves*4;
  const wastePct = wastePctOf(S);
  const hwRow = (item: string, qty: number, unit: string, note: string) =>
    `<tr><td>${item}</td><td class="num">${qty}</td><td class="num"><b>${applyWaste(qty, unit, wastePct)}</b></td><td>${unit}</td><td class="small">${note}</td></tr>`;
  const rows: string[] = [];
  if (hinges>0) rows.push(hwRow(`Hinges Universal 35mm`, hinges, "pcs", `auto &lt;900→2 900-1799→3 1800-2399→4 2400-2999→5 ≥3000→6 · 140mm from ends`));
  Object.keys(slides).map(Number).sort((a,b)=>a-b).forEach(cm=>{
    rows.push(hwRow(`Drawer slides ${cm}0mm`, slides[cm], "pairs", `per drawer depth`));
  });
  if (rails>0) rows.push(hwRow(`Hanging rails`, rails, "pcs", `suits/dresses`));
  if (shelfPins>0) rows.push(hwRow(`Shelf pins 32mm`, shelfPins, "pcs", `${totalShelves} shelves ×4`));
  return `<table><thead><tr><th>Item</th><th>Net qty</th><th>Order (+${wastePct}%)</th><th>Unit</th><th>Note</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="5" class="muted">No hardware</td></tr>'}</tbody></table>`;
}

export function explodedReportHtml(
  cabinets: Cabinet[],
  settings: Settings,
  panels: PanelItem[] = [],
  grain: GrainOverrides = {},
  project?: ProjectInfo | null,
  customers?: Customer[] | null,
  opts: ExplodedReportOpts = {},
  rot: RotationOverrides = {},
): string {
  const now = new Date();
  const nowStr = now.toLocaleString();
  const dateStr = now.toLocaleDateString();
  const projName = project?.name?.trim() || 'Untitled Project';
  const projType = project?.type || '-';
  const projStatus = project?.status || 'draft';
  const projNotes = project?.notes || '';
  const customer = customers?.find(c=>c.id===project?.customerId) ?? null;

  const allMerged = allPartsMerged(cabinets, settings, grain, panels, rot);
  const totalParts = allMerged.reduce((a,p)=>a+p.qty,0);
  const totalArea = allMerged.reduce((a,p)=>a+(p.w*p.h*p.qty)/1e6,0);
  const totalBend = allMerged.reduce((a,p)=>a+(bandLengthMm(p)*p.qty)/1000,0);
  const nesting = nestParts(allMerged, settings);
  const totalSheets = nesting.reduce((a,g)=>a+g.sheets.length,0);
  const banding = bandingByMaterial(cabinets, settings, grain, panels, rot);
  const wastePct = wastePctOf(settings);

  const css = `
    @page{margin:10mm;size:A4}
    *{box-sizing:border-box}
    body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;line-height:1.4}
    .page{page-break-after:always;padding:10mm 10mm 10mm;position:relative;min-height:100vh}
    .page:last-child{page-break-after:auto}
    h1{font-size:22px;margin:0 0 6px}
    h2{font-size:16px;margin:14px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}
    h3{font-size:12.5px;margin:12px 0 6px}
    .muted{color:#666}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .card{border:1px solid #bbb;border-radius:6px;padding:8px 10px;background:#fafafa}
    .badge{display:inline-block;background:#111;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:999px;letter-spacing:.06em;text-transform:uppercase}
    table{border-collapse:collapse;width:100%;margin-top:6px}
    th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;font-size:10px}
    th{background:#eee;font-weight:700}
    td.num{text-align:right;font-family:monospace}
    .cover{text-align:center;padding-top:22mm}
    .cover h1{font-size:28px}
    .cover .sub{font-size:12px;color:#444;margin-top:8px}
    .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
    .kpi .card{text-align:center}
    .kpi .v{font-size:20px;font-weight:800}
    .kpi .l{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.07em;margin-top:2px}
    .shot{margin-top:8px;text-align:center}
    .shot img{max-width:100%;max-height:380px;border:1px solid #bbb;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
    .elevation svg{width:100%;height:auto;border:1px solid #ddd;border-radius:6px;background:#fff}
    .small{font-size:9px;color:#666}
    .footer{position:absolute;bottom:6mm;left:10mm;right:10mm;display:flex;justify-content:space-between;font-size:8.5px;color:#777;border-top:1px solid #ddd;padding-top:3px}
    .toc a{color:#111;text-decoration:none}
    .toc li{margin:2px 0}
    .exploded-grid{display:grid;grid-template-columns:1fr;gap:8px}
    .drill-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .auto4{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .auto4 .shot img{max-height:440px}
    .xp-block{border:1px solid #bbb;border-radius:8px;padding:10px;background:#fff}
    .xp-ctrl{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
    .xp-ctrl button{font:700 11px/1 Arial,Helvetica,sans-serif;padding:6px 12px;border:1px solid #333;border-radius:6px;background:#f5f5f5;cursor:pointer}
    .xp-ctrl button:hover{background:#e8e8e8}
    .xp-slider{flex:1;min-width:180px;accent-color:#b45309}
    .xp-hint{font-size:10px;color:#666}
    .xp-svg{width:100%;height:auto;display:block;border:1px solid #e5e5e5;border-radius:6px;background:#fff}
    @media print{.no-print{display:none}}
  `;

  const customerBlock = customer
    ? `<div class="card"><b>Customer</b><br/>${escH(customer.name)}<br/><span class="small">${escH(customer.phone||'')} ${customer.email? ' - '+escH(customer.email):''}</span><br/><span class="small">${escH(customer.address||'')}</span></div>`
    : `<div class="card"><b>Customer</b><br/><span class="muted">No customer linked</span></div>`;
  const projectBlock = `<div class="card"><b>Project</b><br/>${escH(projName)}<br/><span class="small">Type: ${escH(projType)} – Status: ${escH(projStatus)} – ${escH(dateStr)}</span>${projNotes?`<br/><br/><span class="small">${escH(projNotes).replace(/\n/g,'<br/>')}</span>`:''}</div>`;

  const kpis = `<div class="kpi">
    <div class="card"><div class="v">${cabinets.length}</div><div class="l">Cabinets</div><div class="small">${panels.length} panels – ${cabinets.reduce((a,c)=>a+Math.max(1,c.qty),0)} units</div></div>
    <div class="card"><div class="v">${totalParts}</div><div class="l">Parts</div><div class="small">${totalArea.toFixed(2)} m² – ${totalBend.toFixed(1)} m band</div></div>
    <div class="card"><div class="v">${totalSheets}</div><div class="l">Sheets</div><div class="small">${nesting.length} groups – avg ${(nesting.reduce((a,g)=>a+g.avgUtil,0)/Math.max(1,nesting.length)*100).toFixed(1)}% util</div></div>
    <div class="card"><div class="v">${allMerged.reduce((a,p)=>a+p.holes.length*p.qty,0)}</div><div class="l">Holes</div><div class="small">${banding.length} banding mats</div></div>
  </div>`;

  const overallFront = frontElevationSvg(cabinets, panels);
  const screenshotHtml = opts.screenshotDataUrl
    ? `<div class="shot"><img src="${opts.screenshotDataUrl}" alt="3D view"/><div class="small">3D iso view – ${escH(nowStr)}</div></div>`
    : `<div class="card" style="text-align:center;padding:14px"><b>3D screenshot not included</b><br/><span class="small">Go to 3D View → PNG (top bar). The app saves last screenshot in localStorage <code>cnc-last-3d-png</code>. Then re-open Exploded Report.</span></div>`;

  // per-cabinet sections
  const perCabSections = cabinets.map((cab, idx)=>{
    const cabFront = frontElevationSvg([cab], []);
    const explodedSvg = explodedCabinetSvg(cab, settings, grain, rot);
    const openSvg = openDoorViewSvg(cab, settings);
    const drillL = drillingMapSvg(cab, settings, 'L', grain, rot);
    const drillR = drillingMapSvg(cab, settings, 'R', grain, rot);
    const cutTable = perCabinetCutTable(cab, settings, grain, rot);
    const hwTable = perCabinetHardware(cab, settings);
    const isoShot = opts.perCabinetScreenshots?.[cab.id] ? `<div class="shot"><img src="${opts.perCabinetScreenshots[cab.id]}" alt="${escH(cab.name)} iso"/><div class="small">Iso view – ${escH(cab.name)}</div></div>` : '';
    const explodedShot = opts.explodedScreenshots?.[cab.id] ? `<div class="shot"><img src="${opts.explodedScreenshots[cab.id]}" alt="${escH(cab.name)} exploded"/><div class="small">Exploded 3D (user screenshot)</div></div>` : '';
    // automatic ISO / front / left / EXPLODED photos — captured headlessly,
    // no user screenshots needed; the photo shows ONLY this cabinet (no panels)
    const auto = opts.autoShots?.[cab.id];
    const autoPairs: [string, string][] = auto
      ? (
          [
            ["ISO", auto.iso],
            ["FRONT", auto.front],
            ["LEFT", auto.left],
            ["EXPLODED 3D", auto.exploded],
          ] as [string, string][]
        ).filter(([, src]) => !!src)
      : [];
    const autoHtml =
      autoPairs.length > 0
        ? `<div class="auto4">${autoPairs
            .map(([label, src]) => `<div class="shot"><img src="${src}" alt="${escH(cab.name)} ${label}"/><div class="small">${label} – auto capture</div></div>`)
            .join("")}</div>`
        : "";

    // panel size summary for this cab
    const parts = allPartsMerged([cab], settings, grain, [], rot);
    const totalCabParts = parts.reduce((a,p)=>a+p.qty,0);
    const totalCabArea = parts.reduce((a,p)=>a+(p.w*p.h*p.qty)/1e6,0);

    return `
    <div class="page" id="cab-${cab.id}">
      <h2>Cabinet ${idx+1}/${cabinets.length} – ${escH(cab.name)} – ${cab.width}×${cab.height}×${cab.depth} – ${escH(cab.type)} – Qty ${cab.qty}</h2>
      <div class="card small">Plywood: ${escH(matLabel(settings,{material:'plywood', matId:cab.matId??undefined}))} · ${cab.hasToeKick?'kick':'no-kick'} · ${cab.hasBack===false?'no-back':'back'} · ${cab.hasFronts===false?'no-fronts':'fronts'} · ${modelStackOn(cab)?'stacked '+modelStackedHeights(cab).join('+')+'mm':'single box'} · ${cab.slot && cab.slot!=='none'?'slot '+cab.slot+' '+ (cab.slotFromFront ?? settings.slotFromFront)+'mm':''}</div>
      ${kpis}
      <div style="margin-top:10px">
        <h3>Front Elevation (single)</h3>
        <div class="elevation">${cabFront}</div>
      </div>
      <div style="margin-top:10px">
        <h3>3D photos — ISO / Front / Left / Exploded (auto capture · cabinet only, no panels)</h3>
        ${autoHtml || isoShot || explodedShot || '<div class="card small">No 3D photos – tick “Auto ISO / front / left / exploded photos” when generating the report.</div>'}
      </div>
      <div class="footer"><span>${escH(projName)} – ${escH(cab.name)} – Front + 3D</span><span>Page Cab ${idx+1} – Front</span></div>
    </div>

    <div class="page">
      <h2>${escH(cab.name)} – Exploded View (2D schematic)</h2>
      <p class="small">Every real cut part of this cabinet, drawn at scale from the same part generator as the cut list / nesting / DXF (same L-W rotation rule). Each part shows its true name, W×H×thk, qty, hole count, edge-banding ticks (orange) and grain-lock flag; polygon parts keep their exact cut outline (notched sides, kick-cut top/bottom, drawer boxes). Dashed = veneer back / glass reference (not drilled).</p>
      <div class="elevation">${explodedSvg}</div>
      <div class="footer"><span>${escH(projName)} – ${escH(cab.name)} – Exploded 2D</span><span>Cab ${idx+1} – Exploded</span></div>
    </div>

    <div class="page">
      <h2>${escH(cab.name)} – Interactive Exploded View (2.5D — assemble ⇄ explode)</h2>
      <p class="small">Dynamic diagram: drag the slider (or press Assembled / Exploded) to move every part between its real assembled seat and a fully exploded position. Part boxes come from the same layout math as the part generator, so positions are true to the cabinet; hinge cups are marked on door leaves (fade in with the explode). The printed / no-JS fallback shows the exploded state.</p>
      ${interactiveExplodeHtml(cab, settings)}
      <div class="footer"><span>${escH(projName)} – ${escH(cab.name)} – Interactive Explode</span><span>Cab ${idx+1} – Interactive</span></div>
    </div>

    <div class="page">
      <h2>${escH(cab.name)} – Open Door View – Doors open 90°, Drawers pulled 60%</h2>
      <p class="small">Open door view shows shelves, hanging rails (gold), drawer banks pulled 60% (brown), doors open 90° outside cabinet with hinge side marked (dots). Dimensions W×H in mm. Shelf positions, rail heights, drawer heights labeled.</p>
      <div class="elevation">${openSvg}</div>
      <div class="footer"><span>${escH(projName)} – ${escH(cab.name)} – Open Door</span><span>Cab ${idx+1} – Open Door</span></div>
    </div>

    <div class="page">
      <h2>${escH(cab.name)} – Drilling Map – Side L / Side R – 32mm system</h2>
      <p class="small">Side panels with shelf pin holes (amber), slide holes (cyan), hinge cups excluded (doors only). Linear slot (purple dashed) at the model's real width and position when it is milled. All holes at real X/Y from bottom-left. D=depth, BH=body height.</p>
      <div class="drill-grid">
        <div><div class="elevation">${drillL}</div></div>
        <div><div class="elevation">${drillR}</div></div>
      </div>
      <div class="footer"><span>${escH(projName)} – ${escH(cab.name)} – Drilling</span><span>Cab ${idx+1} – Drilling</span></div>
    </div>

    <div class="page">
      <h2>${escH(cab.name)} – Panel Size Table – ${totalCabParts} parts – ${totalCabArea.toFixed(3)} m²</h2>
      <p class="small">Per-cabinet cut list – span panels + backs keep grain along the length, every other part rotated once (L-W) then grain lock. Banding: T/B/L/R. Bend = banded edge length × qty. Area = W×H×qty. Holes = holes per part × qty. Material column shows plywood name (follows material).</p>
      ${cutTable}
      <h3 style="margin-top:10px">Hardware per Cabinet</h3>
      ${hwTable}
      <div class="footer"><span>${escH(projName)} – ${escH(cab.name)} – Cut List + Hardware – ${totalCabParts} parts</span><span>Cab ${idx+1} – Cut + HW</span></div>
    </div>
    `;
  }).join('\n');

  const bomRows = allMerged.slice(0,200).map((p,i)=>`<tr><td>${i+1}</td><td>${escH(p.cabName)}</td><td>${escH(p.name)}</td><td>${escH(matLabel(settings,p))}</td><td class="num">${p.w}×${p.h}×${p.thickness}</td><td class="num">${p.qty}</td><td>${bandStr(p.band)}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Exploded Report – ${escH(projName)}</title><style>${css}</style></head><body>
  <div class="page cover">
    <div class="badge">CNC Cabinet Designer Pro v11 – Exploded Per-Cabinet Report</div>
    <h1>${escH(projName)}</h1>
    <div class="sub">${escH(projType)} – ${escH(projStatus)} – ${escH(nowStr)}<br/>${cabinets.length} cabinets – ${panels.length} panels – ${totalParts} parts – ${totalSheets} sheets</div>
    ${kpis}
    <div class="grid2" style="margin-top:14px;text-align:left">
      ${projectBlock}
      ${customerBlock}
    </div>
    <div class="card" style="margin-top:12px;text-align:left"><b>Contents – Per Cabinet Pages</b><ol class="toc" style="margin:6px 0 0 18px">
      <li><a href="#overall">Overall 3D + Front Elevation</a></li>
      ${cabinets.map((c,i)=>`<li><a href="#cab-${c.id}">${i+1}. ${escH(c.name)} – ${c.width}×${c.height}×${c.depth} – Front + 3D / Exploded 2D / Interactive Explode / Open Door / Drilling / Cut List + Hardware</a></li>`).join('')}
      <li><a href="#overall-bom">Overall BOM + Cut List (first 200 rows) + Nesting</a></li>
    </ol></div>
    <div class="footer"><span>${escH(projName)} – ${escH(dateStr)}</span><span>Cover – Exploded Report</span></div>
  </div>

  <div class="page" id="overall">
    <h2>Overall – 3D View + Front Elevation (Customer Approval)</h2>
    <div class="grid2">
      <div><h3>3D View (E1 screenshot)</h3>${screenshotHtml}</div>
      <div><h3>Project summary</h3><div class="card"><b>${escH(projName)}</b><br/><span class="small">Cabinets: ${cabinets.map(c=>escH(c.name)).join(', ')||'-'}</span><br/><span class="small">Panels: ${panels.map(p=>escH(p.name)).join(', ')||'-'}</span><br/><br/><span class="small">Settings: body ${settings.bodyThk}mm – MDF ${settings.mdfThk}mm – back ${settings.backThk}mm – bit ${settings.bitDiameter}mm – shelf ${settings.holeDiameter}mm<br/>Hinge auto &lt;900→2 900-1799→3 1800-2399→4 2400-2999→5 ≥3000→6 – cups 140mm from ends<br/>Rail pilots 2×${settings.bitDiameter}mm per rail – first shelf +${settings.railShelfGap}mm above rail, rest ≥ ${settings.railShelfMinGap}mm<br/>BOM waste allowance ${wastePct}% (Net → Order columns)</span></div></div>
    </div>
    <h3 style="margin-top:10px">Front Elevation – Dimensioned (all cabinets + panels)</h3>
    <div class="elevation">${overallFront || '<div class="card">No elevation</div>'}</div>
    <div class="footer"><span>${escH(projName)} – Overall</span><span>Overall – 3D + Front</span></div>
  </div>

  ${perCabSections}

  <div class="page" id="overall-bom">
    <h2>Overall – BOM + Cut List (first 200) + Nesting Summary</h2>
    <h3>Cut List (first 200 rows)</h3>
    <table><thead><tr><th>#</th><th>Cabinet</th><th>Part</th><th>Material</th><th>Size</th><th>Qty</th><th>Banding</th></tr></thead><tbody>${bomRows}</tbody></table>
    <h3>Nesting Summary</h3>
    <table><thead><tr><th>Group</th><th>Sheets (net)</th><th>Order (+${wastePct}%)</th><th>Parts</th><th>Area m²</th><th>Avg util</th><th>Strategy</th><th>Unplaced</th></tr></thead><tbody>${nesting.map(g=>`<tr><td>${escH(g.key)}</td><td class="num">${g.sheets.length}</td><td class="num"><b>${applyWaste(g.sheets.length, "sheets", wastePct)}</b></td><td class="num">${g.partCount}</td><td class="num">${(g.totalArea/1e6).toFixed(2)}</td><td class="num">${(g.avgUtil*100).toFixed(1)}%</td><td>${escH(g.strategy||'')}</td><td class="num">${g.unplaced}</td></tr>`).join('') || '<tr><td colspan="8">No nesting</td></tr>'}</tbody></table>
    <h3>Banding by Material</h3>
    <table><thead><tr><th>Material</th><th>Net meters</th><th>Order (+${wastePct}%)</th><th>Net mm</th></tr></thead><tbody>${banding.map(b=>`<tr><td>${escH(b.material)}</td><td class="num">${b.meters.toFixed(2)}</td><td class="num"><b>${applyWaste(b.meters, "m", wastePct).toFixed(1)}</b></td><td class="num">${b.mm.toFixed(0)}</td></tr>`).join('') || '<tr><td colspan="4">No banding</td></tr>'}</tbody></table>
    <h3>Customer approval</h3>
    <div class="grid2"><div class="card" style="height:70px">Signature / Date<br/><br/><br/></div><div class="card" style="height:70px">Approved / Notes<br/><br/><br/></div></div>
    <div class="footer"><span>${escH(projName)} – ${escH(nowStr)} – CNC-PRO v11</span><span>End – Exploded Report</span></div>
  </div>
  <script>
  ${XP_JS}
  </script>
  </body></html>`;
}
