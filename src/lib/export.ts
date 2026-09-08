import type { Cabinet, Settings } from "../types";
import { allPartsMerged, bandStr, drillOps, type GrainOverrides } from "./model";
import { nestParts } from "./nesting";
import { MATERIAL_LABEL } from "../types";
import { plyMaterialById } from "./defaults";

const allParts = (c: Cabinet[], S: Settings, ov: GrainOverrides = {}) => allPartsMerged(c, S, ov);

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

/* ---------------- cut list csv ---------------- */
export function cutListCsv(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}): string {
  const rows: (string | number)[][] = [
    ["Cabinet", "Part", "Material", "Grain locked", "Length mm", "Width mm", "Qty", "Edge banding", "Holes", "Shape"],
  ];
  allParts(cabs, S, ov).forEach((p) => {
  rows.push([
    p.cabName,
    p.name,
    matLabel(S, p),
    p.grain ? "yes" : "no",
    p.w,
    p.h,
    p.qty,
    bandStr(p.band),
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
export function nestingCsv(cabs: Cabinet[], S: Settings): string {
  const rows: (string | number)[][] = [["Sheet group", "Sheet #", "Cabinet", "Part", "X mm", "Y mm", "W mm", "H mm", "Rotated"]];
  nestParts(allParts(cabs, S), S).forEach((g) =>
    g.sheets.forEach((s) =>
      s.placed.forEach((pp) =>
        rows.push([g.key, s.index + 1, pp.part.cabName, pp.part.name, pp.x, pp.y, pp.w, pp.h, pp.rotated ? "yes" : "no"]),
      ),
    ),
  );
  return csv(rows);
}

/* ---------------- HTML / print ---------------- */
export function cutListHtml(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}): string {
  const parts = allParts(cabs, S, ov);
  const trs = parts
    .map(
      (p, i) => `<tr><td>${i + 1}</td><td>${p.cabName}</td><td>${p.name}</td><td>${matLabel(S, p)}</td>
      <td>${p.thickness}</td><td>${p.w}</td><td>${p.h}</td><td>${p.qty}</td><td>${bandStr(p.band)}</td><td>${p.holes.length * p.qty}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cut list</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:28px;font-size:12px}
  h1{font-size:20px} table{border-collapse:collapse;width:100%;margin-top:12px}
  th,td{border:1px solid #999;padding:4px 8px;text-align:left} th{background:#eee}</style></head>
  <body><h1>CNC Cabinet Generator — Cut List</h1>
  <p>Generated ${new Date().toLocaleString()} · ${cabs.length} cabinets · ${parts.reduce((a, p) => a + p.qty, 0)} parts</p>
  <table><thead><tr><th>#</th><th>Cabinet</th><th>Part</th><th>Material</th><th>Thk</th><th>Length</th><th>Width</th><th>Qty</th><th>Banding</th><th>Holes</th></tr></thead>
  <tbody>${trs}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`;
}

export function labelsHtml(cabs: Cabinet[], S: Settings, ov: GrainOverrides = {}): string {
  const cards: string[] = [];
  allParts(cabs, S, ov).forEach((p) => {
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
