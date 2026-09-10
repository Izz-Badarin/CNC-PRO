import type { Cabinet, Customer, PanelItem, ProjectInfo, Settings } from "../types";
import {
  allPartsMerged,
  bandLengthMm,
  bandStr,
  drillOps,
  type GrainOverrides,
  type RotationOverrides,
  bandingByMaterial,
  columnFaceWidth,
  columnLayout,
  doorDims,
  doorHingeCount,
  generatePanelParts as modelPanelParts,
  kickH as modelKickH,
  stackOn as modelStackOn,
  stackedHeights as modelStackedHeights,
  drillOps as modelDrillOps,
  glassDoorRefs as modelGlassDoorRefs,
} from "./model";
import { nestParts } from "./nesting";
import { layoutCabs, panelPositions } from "./layout2d";
import { plyMaterialById, partMatName, SETTINGS_VERSION, wastePctOf, applyWaste, bomOrderQty, type LibraryItem } from "./defaults";

const allParts = (c: Cabinet[], S: Settings, ov: GrainOverrides = {}, panels: PanelItem[] = [], rot: RotationOverrides = {}) =>
  allPartsMerged(c, S, ov, panels, rot);

/** human material label honoring per-cabinet plywood materials (ply name / veneer back follows ply) */
const matLabel = (S: Settings, p: { material: string; matId?: string }) => partMatName(S, p);

/** Reliable download that works offline, file://, and in PWA standalone */
function triggerDownload(blob: Blob, filename: string) {
  try {
    // IE / legacy Edge
    const nav: any = navigator as any;
    if (nav.msSaveBlob) {
      nav.msSaveBlob(blob, filename);
      return true;
    }
  } catch {}
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    a.rel = "noopener";
    document.body.appendChild(a);
    // file:// may block click if not in user gesture — but we are in click handler
    a.click();
    // fallback: if download attribute ignored (file:// Safari), open blob
    setTimeout(() => {
      try {
        a.remove();
      } catch {}
      URL.revokeObjectURL(url);
    }, 2500);
    return true;
  } catch (e) {
    console.warn("[download] blob URL failed", e);
    // ultimate fallback: data URL
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const a = document.createElement("a");
        a.href = reader.result as string;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 2000);
      };
      reader.readAsDataURL(blob);
      return true;
    } catch {
      return false;
    }
  }
}

export function download(filename: string, content: string, mime = "text/plain") {
  // BOM for CSV/HTML helps Excel and file:// viewers
  const blob = new Blob(["\ufeff" + content], { type: `${mime};charset=utf-8` });
  if (!triggerDownload(blob, filename)) {
    // last resort: show content in new tab for manual save (plane mode)
    try {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<pre>${content.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre>`);
        w.document.title = filename;
      }
    } catch {}
  }
}

export function downloadRaw(filename: string, content: string, mime = "application/dxf") {
  const blob = new Blob([content], { type: mime });
  if (!triggerDownload(blob, filename)) {
    try {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<pre>${content.slice(0, 20000)}</pre>`);
        w.document.title = filename;
      }
    } catch {}
  }
}

const csv = (rows: (string | number)[][]) =>
  rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");

/* ================= dimensioned front elevation (rule D2) ================= */

interface ElevItem {
  x: number;
  w: number;
  h: number;
  lift: number;
  label: string;
  sub: string;
  dashed: boolean;
}

/** elevation items = cabinets (their run) + raw panels, sorted left → right */
function elevationItems(cabs: Cabinet[], panels: PanelItem[]): ElevItem[] {
  const pos = layoutCabs(cabs);
  const ppos = panelPositions(cabs, panels);
  return [
    ...pos.map((p) => ({
      x: p.x,
      w: p.cab.width,
      h: p.cab.height,
      lift: p.y,
      label: p.cab.name + (p.cab.qty > 1 ? ` x${p.cab.qty}` : ""),
      sub: `${p.cab.width}x${p.cab.height}x${p.cab.depth}`,
      dashed: false,
    })),
    ...ppos.map((p) => ({
      x: p.x,
      w: p.pn.w,
      h: (p.y ?? 0) + p.pn.h,
      lift: p.y ?? 0,
      label: p.pn.name,
      sub: `panel ${Math.round(p.pn.w)}x${Math.round(p.pn.h)}`,
      dashed: true,
    })),
  ].sort((a, b) => a.x - b.x);
}

const eF = (n: number) => Math.round(n * 100) / 100;
const eEsc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));

/** one horizontal chain-dimension run: extension lines at every point,
 *  dimension segments between consecutive points, each segment labelled */
function chainDimSvg(pts: number[], X: (mm: number) => number, y: number): string {
  let s = "";
  pts.forEach((p) => {
    s += `<line x1="${eF(X(p))}" y1="${eF(y - 14)}" x2="${eF(X(p))}" y2="${eF(y + 10)}" stroke="#111" stroke-width="0.9"/>`;
  });
  for (let i = 0; i + 1 < pts.length; i++) {
    const xa = X(pts[i]), xb = X(pts[i + 1]);
    s += `<line x1="${eF(xa)}" y1="${eF(y)}" x2="${eF(xb)}" y2="${eF(y)}" stroke="#111" stroke-width="0.9"/>`;
    s += `<path d="M ${eF(xa)} ${eF(y)} l 6 -3 M ${eF(xa)} ${eF(y)} l 6 3" stroke="#111" stroke-width="0.9" fill="none"/>`;
    s += `<path d="M ${eF(xb)} ${eF(y)} l -6 -3 M ${eF(xb)} ${eF(y)} l -6 3" stroke="#111" stroke-width="0.9" fill="none"/>`;
    const lbl = `${Math.round(pts[i + 1] - pts[i])}`;
    if (xb - xa > 30) s += `<text x="${eF((xa + xb) / 2)}" y="${eF(y - 5)}" font-size="11" text-anchor="middle" fill="#111">${lbl}</text>`;
    else s += `<text x="${eF(xb + 4)}" y="${eF(y - 5)}" font-size="10" text-anchor="start" fill="#111">${lbl}</text>`;
  }
  return s;
}

/** SVG of the dimensioned front elevation: floor line + hatching, per-cabinet
 *  W×H outlines with labels, chain dimension along the floor, overall
 *  dimension and a per-item height dimension (rule D2) */
export function frontElevationSvg(cabs: Cabinet[], panels: PanelItem[] = []): string {
  const items = elevationItems(cabs, panels);
  if (items.length === 0) return "";
  const minX = Math.min(...items.map((i) => i.x));
  const maxX = Math.max(...items.map((i) => i.x + i.w));
  const maxH = Math.max(...items.map((i) => i.h));
  // single cabinet, no panels → TIGHT mode: the canvas follows the cabinet's
  // aspect (portrait allowed) so the report renders the elevation BIG instead
  // of a tiny cabinet centered in a 1560×880 landscape sheet
  const spanW = Math.max(maxX - minX, 1);
  const single = cabs.length === 1 && panels.length === 0 && items.length === 1;
  const W = single ? Math.min(1560, Math.max(460, Math.round(spanW + 360))) : 1560;
  const H = single ? Math.min(2300, Math.max(680, Math.round(maxH + 340))) : 880;
  const padL = 80, padR = 110, padT = 130, padB = 200;
  const sc = Math.min((W - padL - padR) / Math.max(maxX - minX, 1), (H - padT - padB) / Math.max(maxH, 1));
  const base = H - padB;
  const ox = padL + (W - padL - padR - (maxX - minX) * sc) / 2;
  const X = (mm: number) => ox + (mm - minX) * sc;
  const Y = (mm: number) => base - mm * sc;

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">`;
  out += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  out += `<text x="${W / 2}" y="36" font-size="20" font-weight="700" text-anchor="middle" fill="#111">Front Elevation — Dimensioned</text>`;
  out += `<text x="${W / 2}" y="56" font-size="12" text-anchor="middle" fill="#555">${new Date().toLocaleString()} · all dimensions in mm</text>`;

  const fx1 = X(minX - 80), fx2 = X(maxX + 80);
  out += `<line x1="${eF(fx1)}" y1="${eF(base)}" x2="${eF(fx2)}" y2="${eF(base)}" stroke="#111" stroke-width="3"/>`;
  for (let tx = fx1 + 8; tx < fx2 - 6; tx += 22) out += `<line x1="${eF(tx)}" y1="${eF(base)}" x2="${eF(tx - 12)}" y2="${eF(base + 12)}" stroke="#111" stroke-width="1"/>`;

  items.forEach((it) => {
    const x1 = X(it.x), x2 = X(it.x + it.w), yTop = Y(it.lift + it.h);
    const dash = it.dashed ? ` stroke-dasharray="8 5"` : "";
    out += `<rect x="${eF(x1)}" y="${eF(yTop)}" width="${eF(x2 - x1)}" height="${eF(base - yTop)}" fill="none" stroke="#111" stroke-width="1.8"${dash}/>`;
    out += `<text x="${eF((x1 + x2) / 2)}" y="${eF(yTop - 34)}" font-size="14" font-weight="700" text-anchor="middle" fill="#111">${eEsc(it.label)}</text>`;
    out += `<text x="${eF((x1 + x2) / 2)}" y="${eF(yTop - 16)}" font-size="11" text-anchor="middle" fill="#444">${eEsc(it.sub)}</text>`;
  });

  const edges = [...new Set(items.flatMap((i) => [i.x, i.x + i.w]).map((e) => Math.round(e)))].sort((a, b) => a - b);
  out += chainDimSvg(edges, X, base + 38);
  out += chainDimSvg([minX, maxX], X, base + 92);

  items.forEach((it) => {
    const hx = X(it.x) - 22;
    const yA = Y(it.lift), yB = Y(it.lift + it.h);
    out += `<line x1="${eF(hx + 8)}" y1="${eF(yA)}" x2="${eF(hx)}" y2="${eF(yA)}" stroke="#111" stroke-width="0.9"/>`;
    out += `<line x1="${eF(hx + 8)}" y1="${eF(yB)}" x2="${eF(hx)}" y2="${eF(yB)}" stroke="#111" stroke-width="0.9"/>`;
    out += `<line x1="${eF(hx)}" y1="${eF(yA)}" x2="${eF(hx)}" y2="${eF(yB)}" stroke="#111" stroke-width="0.9"/>`;
    out += `<path d="M ${eF(hx)} ${eF(yA)} l -3 -5 M ${eF(hx)} ${eF(yA)} l 3 -5" stroke="#111" stroke-width="0.9" fill="none"/>`;
    out += `<path d="M ${eF(hx)} ${eF(yB)} l -3 5 M ${eF(hx)} ${eF(yB)} l 3 5" stroke="#111" stroke-width="0.9" fill="none"/>`;
    out += `<text x="${eF(hx - 6)}" y="${eF((yA + yB) / 2 + 4)}" font-size="11" text-anchor="end" fill="#111">${Math.round(it.lift + it.h)}</text>`;
  });
  out += `</svg>`;
  return out;
}

/** print/HTML wrapper around the dimensioned elevation SVG */
export function frontElevationHtml(cabs: Cabinet[], panels: PanelItem[] = []): string {
  const svg = frontElevationSvg(cabs, panels);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Front elevation</title>
  <style>body{margin:0;padding:16px;background:#fff}</style></head>
  <body>${svg}<script>window.onload=()=>window.print()</script></body></html>`;
}

/** DXF of the dimensioned front elevation (real mm, floor at y=0, layers
 *  FLOOR / ELEVATION / DIMENSION / LABEL — for plot or CAM reference) */
export function frontElevationDxf(cabs: Cabinet[], panels: PanelItem[] = []): string {
  const items = elevationItems(cabs, panels);
  if (items.length === 0) return "";
  const minX = Math.min(...items.map((i) => i.x));
  const maxX = Math.max(...items.map((i) => i.x + i.w));
  const r = (n: number) => (Math.round(n * 1000) / 1000).toString();
  const ascii = (s: string) => s.replace(/[^ -~]/g, "?");
  const line = (l: string, x1: number, y1: number, x2: number, y2: number) =>
    `0\nLINE\n8\n${l}\n10\n${r(x1)}\n20\n${r(y1)}\n30\n0\n11\n${r(x2)}\n21\n${r(y2)}\n31\n0\n`;
  const text = (l: string, x: number, y: number, h: number, t: string) =>
    `0\nTEXT\n8\n${l}\n10\n${r(x)}\n20\n${r(y)}\n30\n0\n40\n${r(h)}\n1\n${ascii(t)}\n`;

  let out = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n`;
  out += `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n`;
  for (const [name, color] of [
    ["FLOOR", 7],
    ["ELEVATION", 7],
    ["DIMENSION", 3],
    ["LABEL", 1],
  ])
    out += `0\nLAYER\n2\n${name}\n70\n0\n62\n${color}\n6\nCONTINUOUS\n`;
  out += `0\nENDTAB\n0\nENDSEC\n`;
  out += `0\nSECTION\n2\nENTITIES\n`;

  out += line("FLOOR", minX - 80, 0, maxX + 80, 0);
  for (let tx = minX - 70; tx < maxX + 80; tx += 22) out += line("FLOOR", tx, 0, tx - 12, -12);

  items.forEach((it) => {
    out += line("ELEVATION", it.x, it.lift, it.x, it.lift + it.h);
    out += line("ELEVATION", it.x + it.w, it.lift, it.x + it.w, it.lift + it.h);
    out += line("ELEVATION", it.x, it.lift + it.h, it.x + it.w, it.lift + it.h);
    out += line("ELEVATION", it.x, it.lift, it.x + it.w, it.lift);
    out += text("LABEL", it.x + it.w / 2, it.lift + it.h + 60, 40, it.label);
    out += text("LABEL", it.x + it.w / 2, it.lift + it.h + 10, 24, it.sub);
    out += line("DIMENSION", it.x - 40, it.lift, it.x - 40, it.lift + it.h);
    out += text("DIMENSION", it.x - 48, it.lift + it.h / 2 - 12, 24, `${Math.round(it.lift + it.h)}`);
  });

  const edges = [...new Set(items.flatMap((i) => [i.x, i.x + i.w]).map((e) => Math.round(e)))].sort((a, b) => a - b);
  const y1 = -60;
  edges.forEach((e) => (out += line("DIMENSION", e, -16, e, y1 - 14)));
  for (let i = 0; i + 1 < edges.length; i++) {
    out += line("DIMENSION", edges[i], y1, edges[i + 1], y1);
    out += text("DIMENSION", (edges[i] + edges[i + 1]) / 2, y1 + 8, 24, `${edges[i + 1] - edges[i]}`);
  }
  const y2 = -130;
  out += line("DIMENSION", minX, -16, minX, y2 - 14);
  out += line("DIMENSION", maxX, -16, maxX, y2 - 14);
  out += line("DIMENSION", minX, y2, maxX, y2);
  out += text("DIMENSION", (minX + maxX) / 2, y2 + 8, 30, `${Math.round(maxX - minX)} OVERALL`);

  out += `0\nENDSEC\n0\nEOF\n`;
  return out;
}

/* ---------------- cut list csv ---------------- */
export function cutListCsv(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}, panels: PanelItem[] = [], rot: RotationOverrides = {}): string {
  const rows: (string | number)[][] = [
    ["Cabinet", "Part", "Material", "Grain locked", "Length mm", "Width mm", "Qty", "Edge banding", "Bend length m", "Holes", "Shape"],
  ];
  allParts(cabs, S, ov, panels, rot).forEach((p) => {
  rows.push([
    p.cabName,
    p.name,
    matLabel(S, p),
    p.grain ? "yes" : "no",
    p.w,
    p.h,
    p.qty,
    bandStr(p.band),
    Math.round(bandLengthMm(p) * p.qty) / 1000,
    p.holes.length * p.qty,
    p.shape === "poly" ? `polygon ${p.outline.length}pts` : "rect",
  ]);
  });
  return csv(rows);
}

/* ---------------- drilling csv ---------------- */
export function drillingCsv(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}, panels: PanelItem[] = [], rot: RotationOverrides = {}): string {
  const rows: (string | number)[][] = [["Cabinet", "Part", "Material", "Instance", "X mm", "Y mm", "Dia mm", "Depth mm", "Type"]];
  drillOps(cabs, S, ov, panels, rot)
    .filter((o) => o.x >= 0)
    .forEach((o) => rows.push([o.cabName, o.part, o.material, o.instance, o.x, o.y, o.dia, o.depth, o.type]));
  return csv(rows);
}



/* ---------------- nesting csv ---------------- */
export function nestingCsv(cabs: Cabinet[], S: Settings, panels: PanelItem[] = [], ov: GrainOverrides = {}, rot: RotationOverrides = {}): string {
  const rows: (string | number)[][] = [["Sheet group", "Sheet #", "Cabinet", "Part", "X mm", "Y mm", "W mm", "H mm", "Rotated"]];
  nestParts(allParts(cabs, S, ov, panels, rot), S).forEach((g) =>
    g.sheets.forEach((s) =>
      s.placed.forEach((pp) =>
        rows.push([g.key, s.index + 1, pp.part.cabName, pp.part.name, pp.x, pp.y, pp.w, pp.h, pp.rotated ? "yes" : "no"]),
      ),
    ),
  );
  return csv(rows);
}

/* ---------------- HTML / print ---------------- */
export function cutListHtml(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}, panels: PanelItem[] = [], rot: RotationOverrides = {}): string {
  const parts = allParts(cabs, S, ov, panels, rot);
  const trs = parts
    .map(
      (p, i) => `<tr><td>${i + 1}</td><td>${p.cabName}</td><td>${p.name}</td><td>${matLabel(S, p)}</td>
      <td>${p.thickness}</td><td>${p.w}</td><td>${p.h}</td><td>${p.qty}</td><td>${bandStr(p.band)}</td><td>${((bandLengthMm(p) * p.qty) / 1000).toFixed(2)}</td><td>${p.holes.length * p.qty}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cut list</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:28px;font-size:12px}
  h1{font-size:20px} table{border-collapse:collapse;width:100%;margin-top:12px}
  th,td{border:1px solid #999;padding:4px 8px;text-align:left} th{background:#eee}</style></head>
  <body><h1>CNC Cabinet Generator — Cut List</h1>
  <p>Generated ${new Date().toLocaleString()} · ${cabs.length} cabinets · ${parts.reduce((a, p) => a + p.qty, 0)} parts</p>
  <table><thead><tr><th>#</th><th>Cabinet</th><th>Part</th><th>Material</th><th>Thk</th><th>Length</th><th>Width</th><th>Qty</th><th>Banding</th><th>Bend (m)</th><th>Holes</th></tr></thead>
  <tbody>${trs}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`;
}

export function labelsHtml(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}, panels: PanelItem[] = [], rot: RotationOverrides = {}): string {
  const cards: string[] = [];
  allParts(cabs, S, ov, panels, rot).forEach((p) => {
    for (let i = 0; i < p.qty; i++) {
      const edges = [
        p.band.top ? `<span class="e">TOP</span>` : "",
        p.band.bottom ? `<span class="e">BOT</span>` : "",
        p.band.left ? `<span class="e">LFT</span>` : "",
        p.band.right ? `<span class="e">RGT</span>` : "",
      ].join("");
      const maxd = Math.max(p.w, p.h);
      const sc = 62 / maxd;
      cards.push(`<div class="card">
        <div class="hd">${p.cabName}</div>
        <div class="nm">${p.name}${p.qty > 1 ? ` — ${i + 1}/${p.qty}` : ""}</div>
        <div class="dm">${p.w} × ${p.h} × ${p.thickness} <span>${matLabel(S, p)}</span></div>
        <div class="band">${edges || '<span class="e off">NO BANDING</span>'}</div>
        <svg width="86" height="64" viewBox="0 0 ${p.w * sc + 10} ${p.h * sc + 10}">
          <rect x="5" y="5" width="${p.w * sc}" height="${p.h * sc}" fill="none" stroke="#111" stroke-width="1.4"
            ${p.band.top ? 'stroke-dasharray="0"' : ""}/>
          ${p.band.top ? `<line x1="5" y1="5" x2="${p.w * sc + 5}" y2="5" stroke="#d00" stroke-width="2.4"/>` : ""}
          ${p.band.left ? `<line x1="5" y1="5" x2="5" y2="${p.h * sc + 5}" stroke="#d00" stroke-width="2.4"/>` : ""}
          ${p.band.right ? `<line x1="${p.w * sc + 5}" y1="5" x2="${p.w * sc + 5}" y2="${p.h * sc + 5}" stroke="#d00" stroke-width="2.4"/>` : ""}
          ${p.band.bottom ? `<line x1="5" y1="${p.h * sc + 5}" x2="${p.w * sc + 5}" y2="${p.h * sc + 5}" stroke="#d00" stroke-width="2.4"/>` : ""}
        </svg>
      </div>`);
    }
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Part labels</title>
  <style>@page{margin:8mm} body{font-family:Arial,sans-serif;color:#111}
  .card{display:inline-block;width:62mm;height:44mm;border:1.4px solid #111;border-radius:3mm;margin:2mm;padding:3mm;vertical-align:top;overflow:hidden;box-sizing:border-box}
  .hd{font-size:8pt;color:#555;text-transform:uppercase;letter-spacing:.08em}
  .nm{font-size:11pt;font-weight:700;margin:1mm 0}
  .dm{font-size:10pt;font-family:monospace}.dm span{color:#555;font-size:8pt}
  .band{margin:1.5mm 0}.e{display:inline-block;background:#111;color:#fff;font-size:6.5pt;padding:.4mm 1.6mm;border-radius:2mm;margin-right:.8mm}
  .e.off{background:#999}</style></head><body>
  ${cards.join("")}<script>window.onload=()=>window.print()</script></body></html>`;
}

export function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "width=1000,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* ================= O — multi-page BOM HTML report (needs E1 screenshot) ================= */

function escH(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

export interface BomReportOpts {
  screenshotDataUrl?: string | null;
}

export function bomReportHtml(
  cabinets: Cabinet[],
  settings: Settings,
  panels: PanelItem[] = [],
  grain: GrainOverrides = {},
  project?: ProjectInfo | null,
  customers?: Customer[] | null,
  opts: BomReportOpts = {},
  rot: RotationOverrides = {},
): string {
  const now = new Date();
  const nowStr = now.toLocaleString();
  const dateStr = now.toLocaleDateString();
  const projName = project?.name?.trim() || "Untitled Project";
  const projType = project?.type || "-";
  const projStatus = project?.status || "draft";
  const projNotes = project?.notes || "";
  const customer = customers?.find((c) => c.id === project?.customerId) ?? null;

  const frontSvg = frontElevationSvg(cabinets, panels);
  const parts = allParts(cabinets, settings, grain, panels, rot);
  const merged = allPartsMerged(cabinets, settings, grain, panels, rot);
  const nesting = nestParts(parts, settings);
  const totalSheets = nesting.reduce((a, g) => a + g.sheets.length, 0);
  const totalParts = merged.reduce((a, p) => a + p.qty, 0);
  const totalArea = merged.reduce((a, p) => a + (p.w * p.h * p.qty) / 1e6, 0);
  const totalBend = merged.reduce((a, p) => a + (bandLengthMm(p) * p.qty) / 1000, 0);
  const totalHoles = merged.reduce((a, p) => a + p.holes.length * p.qty, 0);
  const banding = bandingByMaterial(cabinets, settings, grain, panels, rot);
  const wastePct = wastePctOf(settings);

  let hinges = 0,
    railMm = 0;
  const slides: Record<number, number> = {};
  const materials: Record<string, number> = {};
  // veneer back area tracked PER PLYWOOD MATERIAL — the back follows the
  // cabinet's plywood (matId), so the BOM gets one line per back material
  const backArea: Record<string, number> = {};
  const matKeyOf = (p: { material: string; matId?: string | null }): string =>
    p.material === "plywood" ? (p.matId ?? "plywood") : p.material === "back" ? `back:${p.matId ?? "def"}` : p.material;
  // shelf PINS are hardware: 4 per shelf (2 per side) — the hole count drilled
  // per panel stays in the Drilling tab, the BOM only cares about pins bought
  const totalShelves = parts.filter((p) => p.name.startsWith("Shelf")).reduce((a, p) => a + p.qty, 0);
  const shelfPins = totalShelves * 4;
  const addArea = (p: { material: string; matId?: string | null; w: number; h: number; qty: number }) => {
    const m = matKeyOf(p);
    materials[m] = (materials[m] ?? 0) + (p.w / 1000) * (p.h / 1000) * p.qty;
    if (p.material === "back") backArea[m] = (backArea[m] ?? 0) + (p.w / 1000) * (p.h / 1000) * p.qty;
  };
  modelPanelParts(panels, settings).forEach(addArea);
  cabinets.forEach((cab) => {
    const qty = cab.qty ?? 1;
    allParts([cab], settings).forEach(addArea);
    // mdf/plywood door hinge cups (incl. full doors) — drillOps already
    // multiplies by qty; glass doors are reference parts NOT in drillOps,
    // so they are counted separately below (also × qty).
    modelDrillOps([cab], settings).forEach((op) => {
      if (op.type === "hinge") hinges++;
    });
    const fullSpan = (modelStackOn(cab) ? modelStackedHeights(cab).reduce((a, h) => a + h, 0) : cab.height) - modelKickH(cab, settings);
    // a cabinet-level full door suppresses every per-section door in the model
    // — don't double-count the suppressed per-column glass door hinges
    const fullDoorActive = !!cab.fullDoor && cab.fullDoor !== "off";
    cab.rows.forEach((row) => {
      const lays = columnLayout(cab, row, settings);
      row.columns.forEach((col, ci) => {
        if (col.door && !fullDoorActive && col.door.material === "glass" && col.door.type !== "sliding") {
          const faceW = lays.length === 1 ? cab.width : columnFaceWidth(cab, lays[ci], settings);
          const leafH = doorDims(faceW, col.door.full ? fullSpan : row.h, col.door, settings).h;
          hinges += qty * Math.min(6, Math.max(1, col.door.hingeCount ?? doorHingeCount(leafH)));
        }
        col.drawers.forEach((dr) => {
          const cm = Math.round(dr.slideDepthCm);
          slides[cm] = (slides[cm] ?? 0) + qty;
        });
        if (col.rail && col.rail !== "off") {
          // hanging rails are sold BY THE METER: each rail spans the column's
          // clear width (lays[ci].w), a "double" rail is 2 rails, × cabinet qty
          const rails = col.rail === "double" ? 2 : 1;
          railMm += rails * (cab.qty ?? 1) * (lays[ci]?.w ?? cab.width - 2 * settings.bodyThk);
        }
      });
    });
    if ((cab.fullDoor as string)?.startsWith("glass")) {
      // same variant parsing as the BOM tab: glass / glass-left / glass-right / glass-double
      const fdRaw = cab.fullDoor as string;
      const fdSuffix = fdRaw.includes("-") ? fdRaw.split("-")[1] : "";
      const fdType = fdSuffix === "double" ? "double" : fdSuffix === "left" || fdSuffix === "right" ? "single" : cab.width > 620 ? "double" : "single";
      const leafH = doorDims(
        cab.width,
        fullSpan,
        { type: fdType, style: "overlay", swing: fdSuffix === "right" ? "right" : "left", material: "glass", mdfThk: settings.mdfThk, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", full: true, hingeCount: cab.fullDoorHinges } as any,
        settings,
      ).h;
      hinges += qty * Math.min(6, Math.max(1, cab.fullDoorHinges ?? doorHingeCount(leafH)));
    }
  });
  const sheetCount: Record<string, number> = {};
  nesting.forEach((g) => {
    const k = `${g.material}@${g.matId ?? "def"}`;
    sheetCount[k] = (sheetCount[k] ?? 0) + g.sheets.length;
  });

  type BomRow = { category: string; item: string; qty: number; unit: string; note?: string };
  const bomRows: BomRow[] = [];
  const plyMats = settings.plyMaterials ?? [];
  if (plyMats.length > 0) {
    plyMats.forEach((pm) => {
      const area = materials[pm.id] ?? 0;
      if (area > 0) bomRows.push({ category: "Materials", item: `${pm.name} (2440x1220)`, qty: sheetCount[`plywood@${pm.id}`] ?? 0, unit: "sheets", note: `${area.toFixed(2)} m2 - ${pm.solid ? "solid" : "grain"} - nesting` });
    });
  }
  if (materials["plywood"] && plyMats.length === 0) {
    const a = materials["plywood"] ?? 0;
    if (a > 0) bomRows.push({ category: "Materials", item: "Plywood (2440x1220)", qty: Math.ceil(a / (2.44 * 1.22)), unit: "sheets", note: `${a.toFixed(2)} m2` });
  }
  if (materials["mdf"]) bomRows.push({ category: "Materials", item: `MDF (${settings.mdfSheet})`, qty: sheetCount["mdf@def"] ?? Math.ceil(materials["mdf"] / (settings.mdfSheet === "3050x1220" ? 3.05 * 1.22 : 2.44 * 1.22)), unit: "sheets", note: `${materials["mdf"].toFixed(2)} m2 - nesting` });
  // every veneer back material gets its own BOM line, named after the plywood
  // it follows — sheet count from the actual nesting output (back@<plyId>)
  Object.entries(backArea)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, area]) => {
      const mid = key.slice("back:".length);
      const pm = plyMaterialById(settings, mid === "def" ? null : mid);
      bomRows.push({
        category: "Materials",
        item: `Veneer back — ${pm.name} (2440x1220)`,
        qty: sheetCount[`back@${mid}`] ?? Math.ceil(area / (2.44 * 1.22)),
        unit: "sheets",
        note: `${area.toFixed(2)} m2 - follows ${pm.name} - nesting`,
      });
    });
  banding.forEach((b) => bomRows.push({ category: "Materials", item: `Edge banding - ${b.material}`, qty: Math.round(b.meters * 10) / 10, unit: "m", note: `${b.mm.toFixed(0)} mm` }));
  // Glass doors — PURCHASED hardware (alu + glass): listed in the BOM ONLY.
  // They never become a cut part, so cut list / nesting / DXF stay glass-free.
  const cabQtyOf = new Map(cabinets.map((c) => [c.id, c.qty ?? 1]));
  const glassAgg: Record<string, { qty: number; w: number; h: number }> = {};
  modelGlassDoorRefs(cabinets, settings).forEach((g) => {
    const key = g.name.replace(" (reference)", "");
    const cur = (glassAgg[key] ??= { qty: 0, w: g.w, h: g.h });
    cur.qty += cabQtyOf.get(g.cabId) ?? 1;
  });
  Object.entries(glassAgg).forEach(([name, { qty, w, h }]) => {
    // name already reads "Glass door" / "Glass full door L" etc.
    bomRows.push({ category: "Hardware", item: `${name} - ${w}x${h}`, qty, unit: "pcs", note: "purchased (alu + glass) - NOT cut - NOT in DXF - drill 35mm hinge cups in the glass (positions in Drilling)" });
  });
  if (hinges > 0) bomRows.push({ category: "Hardware", item: "Hinges - Universal 35mm", qty: hinges, unit: "pcs", note: "35 cup bored in the door only - auto: <900->2 900-1799->3 1800-2399->4 2400-2999->5 >=3000->6 - 140mm from ends" });
  Object.keys(slides)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((cm) => {
      if (slides[cm] > 0) bomRows.push({ category: "Hardware", item: `Drawer slides ${cm}0mm`, qty: slides[cm], unit: "pairs", note: "1 pair per drawer, by real drawer depth" });
    });
  if (railMm > 0) bomRows.push({ category: "Hardware", item: "Hanging rails", qty: Math.round((railMm / 1000) * 10) / 10, unit: "m", note: "ordered per meter · each rail spans the column width · suits/dresses" });
  if (shelfPins > 0) bomRows.push({ category: "Hardware", item: "Shelf pins (32mm)", qty: shelfPins, unit: "pcs", note: `${totalShelves} shelves x4 - 2 pins per side` });

  const materialsByKey = new Map<string, typeof merged>();
  merged.forEach((p) => {
    const key = `${p.material}@${p.matId ?? "def"}@${p.thickness}`;
    if (!materialsByKey.has(key)) materialsByKey.set(key, []);
    materialsByKey.get(key)!.push(p);
  });

  const css = `
    @page{margin:12mm;size:A4}
    *{box-sizing:border-box}
    body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45}
    .page{page-break-after:always;padding:14mm 12mm 12mm;position:relative;min-height:100vh}
    .page:last-child{page-break-after:auto}
    h1{font-size:22px;margin:0 0 6px;letter-spacing:-.02em}
    h2{font-size:16px;margin:18px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}
    h3{font-size:13px;margin:14px 0 6px}
    .muted{color:#555}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .card{border:1px solid #bbb;border-radius:6px;padding:10px 12px;background:#fafafa}
    .badge{display:inline-block;background:#111;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:999px;letter-spacing:.06em;text-transform:uppercase}
    table{border-collapse:collapse;width:100%;margin-top:8px}
    th,td{border:1px solid #bbb;padding:5px 7px;text-align:left;font-size:10.5px}
    th{background:#eee;font-weight:700}
    td.num{text-align:right;font-family:monospace}
    .cover{text-align:center;padding-top:28mm}
    .cover h1{font-size:30px;margin-bottom:6px}
    .cover .sub{font-size:13px;color:#444;margin-top:8px}
    .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}
    .kpi .card{text-align:center}
    .kpi .v{font-size:22px;font-weight:800}
    .kpi .l{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.07em;margin-top:2px}
    .shot{margin-top:10px;text-align:center}
    .shot img{max-width:100%;max-height:420px;border:1px solid #bbb;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
    .elevation svg{width:100%;height:auto;border:1px solid #ddd;border-radius:6px;background:#fff}
    .small{font-size:10px;color:#666}
    .footer{position:absolute;bottom:8mm;left:12mm;right:12mm;display:flex;justify-content:space-between;font-size:9px;color:#777;border-top:1px solid #ddd;padding-top:4px}
    .toc a{color:#111;text-decoration:none}
    .toc li{margin:3px 0}
    @media print{.no-print{display:none}}
  `;

  const customerBlock = customer
    ? `<div class="card"><b>Customer</b><br/>${escH(customer.name)}<br/><span class="small">${escH(customer.phone || "")} ${customer.email ? " - " + escH(customer.email) : ""}</span><br/><span class="small">${escH(customer.address || "")}</span></div>`
    : `<div class="card"><b>Customer</b><br/><span class="muted">No customer linked</span></div>`;

  const projectBlock = `<div class="card"><b>Project</b><br/>${escH(projName)}<br/><span class="small">Type: ${escH(projType)} - Status: ${escH(projStatus)} - ${escH(dateStr)}</span>${projNotes ? `<br/><br/><span class="small">${escH(projNotes).replace(/\n/g, "<br/>")}</span>` : ""}</div>`;

  const kpis = `
    <div class="kpi">
      <div class="card"><div class="v">${cabinets.length}</div><div class="l">Cabinets</div><div class="small">${panels.length} panels - ${cabinets.reduce((a, c) => a + Math.max(1, c.qty), 0)} units</div></div>
      <div class="card"><div class="v">${totalParts}</div><div class="l">Parts</div><div class="small">${totalArea.toFixed(2)} m2 - ${totalBend.toFixed(1)} m band</div></div>
      <div class="card"><div class="v">${totalSheets}</div><div class="l">Sheets</div><div class="small">${nesting.length} groups - avg ${(nesting.reduce((a, g) => a + g.avgUtil, 0) / Math.max(1, nesting.length) * 100).toFixed(1)}% util</div></div>
      <div class="card"><div class="v">${totalHoles}</div><div class="l">Holes</div><div class="small">${hinges} hinges - ${Object.keys(slides).length} slide sizes</div></div>
    </div>`;

  const cabRows = cabinets
    .map((c, i) => {
      const rows = c.rows.length;
      const cols = c.rows.reduce((a, r) => a + r.columns.length, 0);
      const doors = c.rows.reduce((a, r) => a + r.columns.filter((col) => col.door).length, 0);
      const drawers = c.rows.reduce((a, r) => a + r.columns.reduce((aa, col) => aa + col.drawers.length, 0), 0);
      return `<tr><td>${i + 1}</td><td>${escH(c.name)}${c.qty > 1 ? ` x${c.qty}` : ""}</td><td>${escH(c.type)}</td><td class="num">${c.width}x${c.height}x${c.depth}</td><td class="num">${c.qty}</td><td class="num">${rows} / ${cols}</td><td class="num">${doors}</td><td class="num">${drawers}</td><td>${c.hasToeKick ? "kick" : ""} ${c.hasFronts === false ? "no-fronts" : ""} ${c.hasBack === false ? "no-back" : ""}</td></tr>`;
    })
    .join("");

  const panelRows = panels
    .map((p, i) => {
      const thk = p.thk > 0 ? p.thk : p.material === "plywood" ? settings.bodyThk : p.material === "back" ? settings.backThk : settings.mdfThk;
      return `<tr><td>${i + 1}</td><td>${escH(p.name)}</td><td>${escH(p.material)}${p.matId ? " / " + escH(p.matId) : ""} ${p.finish ? " - " + escH(p.finish) : ""}</td><td class="num">${p.w}x${p.h}x${thk}</td><td>${p.grain ? "grain locked" : ""}</td></tr>`;
    })
    .join("");

  // every BOM line shows the NET (real) quantity and the ORDER quantity. The
  // waste/loss allowance is added ONLY to edge banding, shelf pins and hinges;
  // every other line is ordered at the exact net quantity.
  const bomTable = bomRows
    .map((r) => `<tr><td>${escH(r.category)}</td><td>${escH(r.item)}</td><td class="num">${r.qty}</td><td class="num"><b>${bomOrderQty(r.qty, r.unit, r.item, wastePct)}</b></td><td>${escH(r.unit)}</td><td class="small">${escH(r.note || "")}</td></tr>`)
    .join("");

  const cutByMat = [...materialsByKey.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => {
      const [mat, mid, thk] = key.split("@");
      // one representative part supplies the human material name (plywood →
      // library name · back → "Veneer back · <ply name>" · MDF → "MDF")
      const matName = list.length ? partMatName(settings, { material: mat, matId: mid === "def" ? null : mid }) : mat;
      const area = list.reduce((a, p) => a + (p.w * p.h * p.qty) / 1e6, 0);
      const rows = list
        .map((p, i) => `<tr><td>${i + 1}</td><td>${escH(p.cabName)}</td><td>${escH(p.name)}</td><td class="num">${p.w}x${p.h}x${p.thickness}</td><td class="num">${p.qty}</td><td>${bandStr(p.band)}</td><td class="num">${((bandLengthMm(p) * p.qty) / 1000).toFixed(2)}</td><td class="num">${p.holes.length * p.qty}</td></tr>`)
        .join("");
      return `<h3>${escH(matName)} - ${thk}mm - ${list.length} types - ${area.toFixed(2)} m2</h3><table><thead><tr><th>#</th><th>Cabinet</th><th>Part</th><th>Size</th><th>Qty</th><th>Banding</th><th>Bend m</th><th>Holes</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");

  const nestingTable = nesting
    .map((g) => {
      const sheets = g.sheets.length;
      const util = (g.avgUtil * 100).toFixed(1);
      const offcuts = g.sheets.flatMap((s) => s.offcuts).length;
      return `<tr><td>${escH(g.key)}</td><td class="num">${sheets}</td><td class="num">${g.partCount}</td><td class="num">${(g.totalArea / 1e6).toFixed(2)} m2</td><td class="num">${util}%</td><td>${escH(g.strategy || "")} - ${offcuts} offcuts</td><td class="num">${g.unplaced}</td></tr>`;
    })
    .join("");

  const screenshotHtml = opts.screenshotDataUrl
    ? `<div class="shot"><img src="${opts.screenshotDataUrl}" alt="3D view"/><div class="small">3D view - ${escH(nowStr)} - ${cabinets.length} cabinets + ${panels.length} panels</div></div>`
    : `<div class="card" style="text-align:center;padding:18px"><b>3D screenshot not included</b><br/><span class="small">Go to <b>3D View</b> - click <b>PNG</b> (top bar). The app saves the last screenshot automatically (localStorage <code>cnc-last-3d-png</code>). Then return to <b>BOM / Hardware</b> - <b>Full Report</b> - the image will appear here.</span></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>BOM Report - ${escH(projName)}</title><style>${css}</style></head><body>
  <div class="page cover">
    <div class="badge">CNC Cabinet Designer Pro v11 - BOM Report</div>
    <h1>${escH(projName)}</h1>
    <div class="sub">${escH(projType)} - ${escH(projStatus)} - ${escH(nowStr)}<br/>${cabinets.length} cabinets - ${panels.length} panels - ${totalParts} parts - ${totalSheets} sheets</div>
    ${kpis}
    <div class="grid2" style="margin-top:18px;text-align:left">
      ${projectBlock}
      ${customerBlock}
    </div>
    <div class="card" style="margin-top:14px;text-align:left"><b>Contents</b><ol class="toc" style="margin:6px 0 0 18px">
      <li><a href="#p2">3D view + Front elevation (customer approval)</a></li>
      <li><a href="#p3">Cabinets and Panels list</a></li>
      <li><a href="#p4">BOM - Materials and Hardware</a></li>
      <li><a href="#p5">Cut list by material (bend length)</a></li>
      <li><a href="#p6">Nesting summary (sheets, util, strategy)</a></li>
      <li><a href="#p7">Edge banding and Drilling notes</a></li>
    </ol></div>
    <div class="footer"><span>${escH(projName)} - ${escH(dateStr)}</span><span>Page 1 / 7 - BOM Report</span></div>
  </div>

  <div class="page" id="p2">
    <h2>Customer Approval - 3D View and Front Elevation</h2>
    <div class="grid2">
      <div><h3>3D View (E1 screenshot)</h3>${screenshotHtml}</div>
      <div><h3>Project summary</h3><div class="card">
        <b>${escH(projName)}</b><br/>
        <span class="small">Cabinets: ${cabinets.map((c) => escH(c.name)).join(", ") || "-"}</span><br/>
        <span class="small">Panels: ${panels.map((p) => escH(p.name)).join(", ") || "-"}</span><br/><br/>
        <span class="small">Settings: body ${settings.bodyThk}mm - MDF ${settings.mdfThk}mm - back ${settings.backThk}mm - bit ${settings.bitDiameter}mm - shelf ${settings.holeDiameter}mm<br/>
        Hinge auto &lt;900-&gt;2 900-1799-&gt;3 1800-2399-&gt;4 2400-2999-&gt;5 &gt;=3000-&gt;6 - cups 140mm from ends<br/>
        Rail pilots 2x ${settings.bitDiameter}mm per rail - first shelf +${settings.railShelfGap}mm above rail, rest &gt;= ${settings.railShelfMinGap}mm<br/>
        BOM waste allowance ${wastePct}% (Net -&gt; Order columns)</span>
      </div></div>
    </div>
    <h3 style="margin-top:14px">Front Elevation - Dimensioned (D2)</h3>
    <div class="elevation">${frontSvg || '<div class="card">No elevation - add cabinets</div>'}</div>
    <div class="footer"><span>${escH(projName)} - Front elevation - mm</span><span>Page 2 / 7</span></div>
  </div>

  <div class="page" id="p3">
    <h2>Cabinets and Panels</h2>
    <h3>Cabinets (${cabinets.length})</h3>
    <table><thead><tr><th>#</th><th>Name</th><th>Type</th><th>WxHxD</th><th>Qty</th><th>Rows/Cols</th><th>Doors</th><th>Drawers</th><th>Flags</th></tr></thead><tbody>${cabRows || '<tr><td colspan="9" class="muted">No cabinets</td></tr>'}</tbody></table>
    <h3 style="margin-top:12px">Raw Panels (${panels.length})</h3>
    <table><thead><tr><th>#</th><th>Name</th><th>Material</th><th>Size</th><th>Grain</th></tr></thead><tbody>${panelRows || '<tr><td colspan="5" class="muted">No panels</td></tr>'}</tbody></table>
    ${projNotes ? `<h3>Project notes</h3><div class="card">${escH(projNotes).replace(/\n/g, "<br/>")}</div>` : ""}
    <div class="footer"><span>${escH(projName)} - Cabinets and Panels</span><span>Page 3 / 7</span></div>
  </div>

  <div class="page" id="p4">
    <h2>Bill of Materials - Materials and Hardware (M + U + L)</h2>
    <p class="small">Sheet counts from actual nesting output. Slides counted per drawer at real slide depth (pairs/drawer). Hinges from new rule incl. glass and full doors. Handles removed everywhere. Net = real quantity · Order = net + ${wastePct}% waste ONLY for edge banding, shelf pins and hinges — every other item is ordered at the exact net.</p>
    <table><thead><tr><th>Category</th><th>Item</th><th>Net</th><th>Order (+${wastePct}%)</th><th>Unit</th><th>Note</th></tr></thead><tbody>${bomTable}</tbody></table>
    <div class="footer"><span>${escH(projName)} - BOM</span><span>Page 4 / 7</span></div>
  </div>

  <div class="page" id="p5">
    <h2>Cut List by Material - Bend length (I) + Grain lock (R)</h2>
    <p class="small">Span panels (tops, bottoms, shelves, sections) and backs keep grain along the length; every other part rotated once (L-W) then grain lock applies. Bend = total banded-edge length per row (incl. qty) - edge-banding tape to buy.</p>
    ${cutByMat || '<div class="card">No parts</div>'}
    <div class="footer"><span>${escH(projName)} - Cut list - ${totalParts} parts - ${totalArea.toFixed(2)} m2</span><span>Page 5 / 7</span></div>
  </div>

  <div class="page" id="p6">
    <h2>Nesting Summary - One-material-at-a-time (N) + Strategies</h2>
    <table><thead><tr><th>Group</th><th>Sheets</th><th>Parts</th><th>Area</th><th>Avg util</th><th>Strategy / Offcuts</th><th>Unplaced</th></tr></thead><tbody>${nestingTable || '<tr><td colspan="7">No nesting</td></tr>'}</tbody></table>
    <h3>Sheet size rules</h3>
    <div class="card small">Plywood / Veneer back: 2440x1220 locked. MDF: ${escH(settings.mdfSheet)} (auto = tall >2420 on 3050x1220 else 2440x1220). Margin ${settings.sheetMargin}mm - clearance ${settings.partClearance}mm - min offcut ${settings.minOffcut}mm - max sheets ${settings.maxSheets} - grainLock ${settings.grainLock ? "ON" : "OFF"} - nestFrom ${escH(settings.nestFrom)} - direction ${escH(settings.nestDirection)}</div>
    <div class="footer"><span>${escH(projName)} - Nesting - ${totalSheets} sheets</span><span>Page 6 / 7</span></div>
  </div>

  <div class="page" id="p7">
    <h2>Edge Banding and Drilling Notes</h2>
    <h3>Edge banding per material</h3>
    <table><thead><tr><th>Material</th><th>Net meters</th><th>Order (+${wastePct}%)</th><th>Net mm</th><th>Note</th></tr></thead><tbody>${banding.map((b) => `<tr><td>${escH(b.material)}</td><td class="num">${b.meters.toFixed(2)}</td><td class="num"><b>${applyWaste(b.meters, "m", wastePct).toFixed(1)}</b></td><td class="num">${b.mm.toFixed(0)}</td><td class="small">real ${b.meters.toFixed(2)} m - buy ${applyWaste(b.meters, "m", wastePct).toFixed(1)} m to be safe</td></tr>`).join("") || '<tr><td colspan="5">No banding</td></tr>'}</tbody></table>
    <h3>Drilling</h3>
    <div class="card small">
      Shelf pins ${settings.holeDiameter}mm (${settings.shelfHolesPerSide}/side at ${settings.shelfHoleCenter}mm) - rail pilots ${settings.bitDiameter}mm (2 per rail)<br/>
      Drawer slides ${settings.slideHoleDiameter}mm patterns - grooves ${settings.grooveWidth}mm x (slider - ${settings.grooveShorter}mm) at ${settings.grooveFromBottom}mm<br/>
      Hinge cups ${settings.hingeCupDiameter}mm x ${settings.hingeCupDepth}mm deep at ${settings.hingeCupEdge}mm from edge - auto &lt;900-&gt;2 900-1799-&gt;3 1800-2399-&gt;4 2400-2999-&gt;5 &gt;=3000-&gt;6 - cups 140mm from top/bottom<br/>
      Glass doors: REFERENCE only (dashed, NOT DRILLED) - drill glass at those positions - 35 cups excluded from DXF
    </div>
    <h3>DXF layers</h3>
    <div class="card small">CUT - CLAMP_HOLES - SHELF_HOLES - SLIDE_HOLES - DRAWER_GROOVE - SHEET - LABEL. Units mm, R12 compatible. Glass doors are BOM-only (not in DXF).</div>
    <h3>Customer approval</h3>
    <div class="grid2">
      <div class="card" style="height:70px">Signature / Date<br/><br/><br/></div>
      <div class="card" style="height:70px">Approved / Notes<br/><br/><br/></div>
    </div>
    <div class="footer"><span>${escH(projName)} - ${escH(nowStr)} - CNC-PRO v11</span><span>Page 7 / 7 - End</span></div>
  </div>
  </body></html>`;
}

export interface ProjectFileData {
  version?: number;
  settings?: Settings;
  cabinets: Cabinet[];
  project?: ProjectInfo;
  customers?: Customer[];
  library?: LibraryItem[];
  grain?: GrainOverrides;
  rotation?: RotationOverrides;
}

export function projectJson(cabs: Cabinet[], S: Settings, project?: ProjectInfo, customers?: Customer[], library?: LibraryItem[], grain?: GrainOverrides, rotation?: RotationOverrides): string {
  return JSON.stringify({ version: SETTINGS_VERSION, settings: S, cabinets: cabs, project, customers, library, grain, rotation }, null, 2);
}

/**
 * Read a saved project .json. Returns EVERYTHING the Save button wrote —
 * cabinets, settings AND project (which carries the raw panels), customers,
 * library and grain. Returning only cabinets/settings is what caused panels
 * to vanish when reopening a saved file.
 */
export async function readProjectFile(file: File): Promise<ProjectFileData> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (Array.isArray(data)) return { cabinets: data };
  if (data.cabinets)
    return {
      cabinets: data.cabinets,
      settings: data.settings,
      project: data.project,
      customers: data.customers,
      library: data.library,
      grain: data.grain,
      rotation: data.rotation,
    };
  throw new Error("Invalid project file");
}
