import type { Cabinet, PanelItem, Settings } from "../types";
import { allPartsMerged, bandLengthMm, bandStr, drillOps, type GrainOverrides } from "./model";
import { nestParts } from "./nesting";
import { layoutCabs, panelPositions } from "./layout2d";
import { MATERIAL_LABEL } from "../types";
import { plyMaterialById } from "./defaults";

const allParts = (c: Cabinet[], S: Settings, ov: GrainOverrides = {}, panels: PanelItem[] = []) => allPartsMerged(c, S, ov, panels);

/** human material label honoring per-cabinet plywood materials */
const matLabel = (S: Settings, p: { material: string; matId?: string }) =>
  p.material === "plywood"
    ? plyMaterialById(S, p.matId ?? null).name
    : MATERIAL_LABEL[p.material as "plywood" | "mdf" | "back"];

export function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob(["\ufeff" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadRaw(filename: string, content: string, mime = "application/dxf") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
  const W = 1560, H = 880;
  const padL = 80, padR = 110, padT = 130, padB = 200;
  const sc = Math.min((W - padL - padR) / Math.max(maxX - minX, 1), (H - padT - padB) / Math.max(maxH, 1));
  const base = H - padB; // svg y of the floor line
  const ox = padL + (W - padL - padR - (maxX - minX) * sc) / 2;
  const X = (mm: number) => ox + (mm - minX) * sc;
  const Y = (mm: number) => base - mm * sc;

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">`;
  out += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  out += `<text x="${W / 2}" y="36" font-size="20" font-weight="700" text-anchor="middle" fill="#111">Front Elevation — Dimensioned</text>`;
  out += `<text x="${W / 2}" y="56" font-size="12" text-anchor="middle" fill="#555">${new Date().toLocaleString()} · all dimensions in mm</text>`;

  // floor line + hatching
  const fx1 = X(minX - 80), fx2 = X(maxX + 80);
  out += `<line x1="${eF(fx1)}" y1="${eF(base)}" x2="${eF(fx2)}" y2="${eF(base)}" stroke="#111" stroke-width="3"/>`;
  for (let tx = fx1 + 8; tx < fx2 - 6; tx += 22) out += `<line x1="${eF(tx)}" y1="${eF(base)}" x2="${eF(tx - 12)}" y2="${eF(base + 12)}" stroke="#111" stroke-width="1"/>`;

  // outlines + labels (panels dashed)
  items.forEach((it) => {
    const x1 = X(it.x), x2 = X(it.x + it.w), yTop = Y(it.lift + it.h);
    const dash = it.dashed ? ` stroke-dasharray="8 5"` : "";
    out += `<rect x="${eF(x1)}" y="${eF(yTop)}" width="${eF(x2 - x1)}" height="${eF(base - yTop)}" fill="none" stroke="#111" stroke-width="1.8"${dash}/>`;
    out += `<text x="${eF((x1 + x2) / 2)}" y="${eF(yTop - 34)}" font-size="14" font-weight="700" text-anchor="middle" fill="#111">${eEsc(it.label)}</text>`;
    out += `<text x="${eF((x1 + x2) / 2)}" y="${eF(yTop - 16)}" font-size="11" text-anchor="middle" fill="#444">${eEsc(it.sub)}</text>`;
  });

  // chain dimension along the floor (every item edge) + overall
  const edges = [...new Set(items.flatMap((i) => [i.x, i.x + i.w]).map((e) => Math.round(e)))].sort((a, b) => a - b);
  out += chainDimSvg(edges, X, base + 38);
  out += chainDimSvg([minX, maxX], X, base + 92);

  // per-item height dimension on the left edge
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

  // floor line + hatching
  out += line("FLOOR", minX - 80, 0, maxX + 80, 0);
  for (let tx = minX - 70; tx < maxX + 80; tx += 22) out += line("FLOOR", tx, 0, tx - 12, -12);

  // outlines + labels + height dimensions
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

  // chain dimension + overall
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
export function cutListCsv(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}, panels: PanelItem[] = []): string {
  const rows: (string | number)[][] = [
    ["Cabinet", "Part", "Material", "Grain locked", "Length mm", "Width mm", "Qty", "Edge banding", "Bend length m", "Holes", "Shape"],
  ];
  allParts(cabs, S, ov, panels).forEach((p) => {
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
export function drillingCsv(cabs: Cabinet[], S: Settings): string {
  const rows: (string | number)[][] = [["Cabinet", "Part", "Material", "Instance", "X mm", "Y mm", "Dia mm", "Depth mm", "Type"]];
  drillOps(cabs, S)
    .filter((o) => o.x >= 0)
    .forEach((o) => rows.push([o.cabName, o.part, o.material, o.instance, o.x, o.y, o.dia, o.depth, o.type]));
  return csv(rows);
}



/* ---------------- nesting csv ---------------- */
export function nestingCsv(cabs: Cabinet[], S: Settings, panels: PanelItem[] = []): string {
  const rows: (string | number)[][] = [["Sheet group", "Sheet #", "Cabinet", "Part", "X mm", "Y mm", "W mm", "H mm", "Rotated"]];
  nestParts(allParts(cabs, S, {}, panels), S).forEach((g) =>
    g.sheets.forEach((s) =>
      s.placed.forEach((pp) =>
        rows.push([g.key, s.index + 1, pp.part.cabName, pp.part.name, pp.x, pp.y, pp.w, pp.h, pp.rotated ? "yes" : "no"]),
      ),
    ),
  );
  return csv(rows);
}

/* ---------------- HTML / print ---------------- */
export function cutListHtml(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}, panels: PanelItem[] = []): string {
  const parts = allParts(cabs, S, ov, panels);
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

export function labelsHtml(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}, panels: PanelItem[] = []): string {
  const cards: string[] = [];
  allParts(cabs, S, ov, panels).forEach((p) => {
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

export function projectJson(cabs: Cabinet[], S: Settings): string {
  return JSON.stringify({ version: 5, settings: S, cabinets: cabs }, null, 2);
}

export async function readProjectFile(file: File): Promise<{ cabinets: Cabinet[]; settings?: Settings }> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (Array.isArray(data)) return { cabinets: data };
  if (data.cabinets) return { cabinets: data.cabinets, settings: data.settings };
  throw new Error("Invalid project file");
}
