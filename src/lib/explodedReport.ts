import type { Cabinet, Customer, PanelItem, ProjectInfo, Settings } from "../types";
import {
  allPartsMerged,
  bandLengthMm,
  bandStr,
  drillOps,
  type GrainOverrides,
  bandingByMaterial,
  columnFaceWidth,
  columnLayout,
  doorDims,
  doorHingeCount,
  kickH as modelKickH,
  stackOn as modelStackOn,
  stackedHeights as modelStackedHeights,
  rotatePartOnce,
  mergePieces,
  railShelfYs,
  columnHasDrawers,
} from "./model";
import { nestParts } from "./nesting";
import { frontElevationSvg } from "./export";
import { partMatName } from "./defaults";

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
}

/**
 * 2D exploded parts layout for a single cabinet — drawn DIRECTLY from the real
 * cut-part list (same generator as cut list / nesting / DXF): every rectangle
 * is an actual part with its true name, W×H×thk, qty, holes, edge banding and
 * grain-lock flag; polygon parts (notched sides, kick-cut top/bottom, drawer
 * boxes) keep their real cut outline. Parts are packed left→right, top→down in
 * their natural build order (carcass → shelves → doors → drawers → covers).
 */
function explodedCabinetSvg(cab: Cabinet, S: Settings, grain: GrainOverrides): string {
  const raw = allPartsMerged([cab], S, grain, []);
  // same L-W rotation rule as the cut list / DXF
  const parts = raw.map(rotatePartOnce);
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
  out += `<text x="${VW / 2}" y="42" font-size="10" text-anchor="middle" fill="#666">${parts.length} part types · ${totalQty} pieces · ${totalArea.toFixed(2)} m² – drawn at 1:${f2(1 / sc)} from the real cut list (same rotation rule as DXF)</text>`;

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
    x += cw;

    const st = style(p);
    const rx = x - cellPad;
    const ry = y + 14;
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
  out += `<text x="${f2(VW - rightPad)}" y="${f2(ly)}" font-size="8" fill="#555" text-anchor="end">orange tick = edge banding · ⌀ = hole count · G = grain locked</text>`;

  out += `</svg>`;
  return out;
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
      // shelves or drawers
      if (columnHasDrawers(col)){
        // drawer bank zone
        const bankH = col.drawers.reduce((a,d)=>a+d.frontHeight,0);
        // draw shelves above if any
        const above = col.shelves;
        if (above>0){
          const shelfZoneH = row.h - bankH;
          for(let k=0;k<above;k++){
            const sy = base - (y0 + bankH + shelfZoneH*(k+1)/(above+1))*sc;
            out += `<line x1="${f(colX+2)}" y1="${f(sy)}" x2="${f(colX+colW-2)}" y2="${f(sy)}" stroke="#3a5a8a" stroke-width="0.9" stroke-dasharray="3 3"/>`;
          }
        }
        // drawers as pulled boxes in front
        let dy = 0;
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
        // shelves
        for(let k=0;k<col.shelves;k++){
          const sy = base - (y0 + row.h*(k+1)/(col.shelves+1))*sc;
          out += `<line x1="${f(colX+2)}" y1="${f(sy)}" x2="${f(colX+colW-2)}" y2="${f(sy)}" stroke="#3a5a8a" stroke-width="1"/>`;
        }
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

  // doors open – draw outside
  let doorIndex=0;
  const openDoors: {x:number; y:number; w:number; h:number; label:string}[]=[];
  if (cab.fullDoor && cab.fullDoor!=='off'){
    const fullH = modelStackOn(cab) ? modelStackedHeights(cab).reduce((a,h)=>a+h,0)-kick : BH;
    const isDouble = (cab.fullDoor as string).includes('double') || W>620 && (cab.fullDoor==='mdf' || cab.fullDoor==='glass');
    if (isDouble){
      openDoors.push({x: cabX - (W/2)*sc -20, y: cabTop, w: W/2*sc, h: fullH*sc, label: `Door L ${Math.round(W/2)}×${fullH}`});
      openDoors.push({x: cabX + W*sc +20, y: cabTop, w: W/2*sc, h: fullH*sc, label: `Door R ${Math.round(W/2)}×${fullH}`});
    } else {
      const side = (cab.fullDoor as string).includes('right') ? 'R' : 'L';
      const ox2 = side==='L' ? cabX - W*sc*0.55 -20 : cabX+W*sc+20;
      openDoors.push({x: ox2, y: cabTop, w: W*sc*0.5, h: fullH*sc, label: `Full Door ${W}×${fullH}`});
    }
  } else {
    cab.rows.forEach(row=>{
      const lays = columnLayout(cab, row, S);
      lays.forEach(lay=>{
        const col = lay.col;
        if (!col.door || col.fixed) return;
        const fullSpan = col.door.full ? BH : row.h;
        const d = doorDims(lay.w, fullSpan, col.door, S);
        const y = col.door.full ? base - (kick+fullSpan)*sc : base - (y0)*sc - row.h*sc + (row.h-fullSpan)*sc;
        if (col.door.type==='double'){
          openDoors.push({x: cabX - d.w*sc*0.5 -15, y: y, w: d.w*sc*0.5, h: d.h*sc, label: `Door ${doorIndex+1}L ${d.w}×${d.h}`});
          openDoors.push({x: cabX+W*sc+15, y: y, w: d.w*sc*0.5, h: d.h*sc, label: `Door ${doorIndex+1}R ${d.w}×${d.h}`});
          doorIndex+=2;
        } else {
          const side = col.door.swing;
          const ox2 = side==='left' ? cabX - d.w*sc*0.5 -15 : cabX+W*sc+15;
          openDoors.push({x: ox2, y: y, w: d.w*sc*0.5, h: d.h*sc, label: `Door ${doorIndex+1} ${d.w}×${d.h} ${side}`});
          doorIndex++;
        }
      });
    });
  }
  openDoors.forEach(od=>{
    out += `<rect x="${f(od.x)}" y="${f(od.y)}" width="${f(od.w)}" height="${f(od.h)}" fill="#c2d6e8" stroke="#2a4a6a" stroke-width="1"/>`;
    // hinge
    out += `<circle cx="${f(od.x+5)}" cy="${f(od.y+od.h*0.15)}" r="2.5" fill="#c9ccd4" stroke="#222"/>`;
    out += `<circle cx="${f(od.x+5)}" cy="${f(od.y+od.h*0.85)}" r="2.5" fill="#c9ccd4" stroke="#222"/>`;
    out += `<text x="${f(od.x+od.w/2)}" y="${f(od.y-4)}" font-size="7" fill="#2a4a6a" text-anchor="middle">${escH(od.label)}</text>`;
    // leader line to cabinet
    const cx1 = od.x + od.w/2 < cabX ? od.x+od.w : od.x;
    out += `<line x1="${f(cx1)}" y1="${f(od.y+od.h/2)}" x2="${f(od.x+od.w/2 < cabX ? cabX : cabX+W*sc)}" y2="${f(od.y+od.h/2)}" stroke="#999" stroke-dasharray="2 2" stroke-width="0.6"/>`;
  });

  // dimensions
  out += `<line x1="${f(cabX)}" y1="${f(base+18)}" x2="${f(cabX+W*sc)}" y2="${f(base+18)}" stroke="#111" stroke-width="0.8"/>`;
  out += `<text x="${f(cabX+W*sc/2)}" y="${f(base+32)}" font-size="10" text-anchor="middle" fill="#111">${W}mm</text>`;
  out += `<line x1="${f(cabX-18)}" y1="${f(cabTop)}" x2="${f(cabX-18)}" y2="${f(base)}" stroke="#111" stroke-width="0.8"/>`;
  out += `<text x="${f(cabX-28)}" y="${f(cabTop+H*sc/2)}" font-size="10" text-anchor="middle" fill="#111" transform="rotate(-90 ${f(cabX-28)} ${f(cabTop+H*sc/2)})">${H}mm</text>`;

  out += `</svg>`;
  return out;
}

/** side drilling map – side panel with holes */
function drillingMapSvg(cab: Cabinet, S: Settings, side: 'L'|'R'): string {
  const ops = drillOps([cab], S).filter(o=> o.part.toLowerCase().includes(`side panel ${side.toLowerCase()}`));
  const BH = cab.height - modelKickH(cab,S);
  const D = cab.depth;
  const VW=420, VH=520;
  const sc = Math.min((VW-80)/D, (VH-80)/BH)*0.9;
  const ox=40, oy=40;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" font-family="Arial, Helvetica, sans-serif">`;
  out += `<rect width="${VW}" height="${VH}" fill="#fff"/>`;
  out += `<rect x="${f2(ox)}" y="${f2(oy)}" width="${f2(D*sc)}" height="${f2(BH*sc)}" fill="#f9f5e8" stroke="#111" stroke-width="1"/>`;
  out += `<text x="${f2(ox+D*sc/2)}" y="${f2(oy-8)}" font-size="11" font-weight="700" text-anchor="middle" fill="#111">Side ${side} – ${D}×${BH} – ${ops.length} holes</text>`;
  ops.forEach(op=>{
    const cx = ox + op.x*sc;
    const cy = oy + BH*sc - op.y*sc;
    const color = op.type==='shelf' ? '#f5b33c' : op.type==='slide' ? '#38bdf8' : '#f87171';
    const r = op.type==='hinge' ? 4 : op.dia>=5 ? 3 : 2;
    out += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${r}" fill="${color}" stroke="#111" stroke-width="0.4"/>`;
  });
  // slot if any — SAME geometry as the part generator (model.ts buildBody):
  //   slotFromFront: per-cabinet override wins over Settings.slotFromFront
  //   width: Settings.slotWidth (min 6) · center at D − max(sw, fromFront)
  //   RIGHT panel is stored MIRRORED (x=0 = front edge)
  //   drawn only when it actually fits (x1 > 8 && x2 < D − 8)
  {
    const slot = cab.slot ?? "none";
    if (slot !== "none" && (slot === "both" || slot === side.toLowerCase())) {
      const slotFromFront = cab.slotFromFront != null && cab.slotFromFront > 0 ? cab.slotFromFront : S.slotFromFront;
      const sw = Math.max(6, S.slotWidth);
      const cx = D - Math.max(sw, slotFromFront); // model space: x=0 = BACK edge
      const x1 = cx - sw / 2, x2 = cx + sw / 2;
      if (x1 > 8 && x2 < D - 8) {
        const mapCx = side === "R" ? D - cx : cx; // right panel is mirrored in storage
        out += `<rect x="${f2(ox + (mapCx - sw / 2) * sc)}" y="${f2(oy)}" width="${f2(sw * sc)}" height="${f2(BH * sc)}" fill="none" stroke="#a855f7" stroke-width="1.2" stroke-dasharray="4 3"/>`;
        out += `<text x="${f2(ox + mapCx * sc)}" y="${f2(oy + BH * sc + 14)}" font-size="7" fill="#a855f7" text-anchor="middle">SLOT ${sw}mm @ ${Math.round(slotFromFront)}mm from front</text>`;
      }
    }
  }
  out += `<text x="${f2(ox)}" y="${f2(oy+BH*sc+28)}" font-size="8" fill="#555">Shelf ⌀${S.holeDiameter} · Slide ⌀${S.slideHoleDiameter} · Hinge ⌀${S.hingeCupDiameter} · 32mm system</text>`;
  out += `</svg>`;
  return out;
}

function perCabinetCutTable(cab: Cabinet, S: Settings, grain: GrainOverrides): string {
  const parts = allPartsMerged([cab], S, grain, []);
  const merged = mergePieces(parts.map(rotatePartOnce));
  const rows = merged.map((p,i)=>{
    const bendM = (bandLengthMm(p)*p.qty/1000).toFixed(2);
    const area = (p.w*p.h*p.qty/1e6).toFixed(3);
    const holes = p.holes.length * p.qty;
    return `<tr><td>${i+1}</td><td>${escH(p.name)}</td><td>${escH(matLabel(S,p))}</td><td class="num">${p.thickness}</td><td class="num">${p.w}</td><td class="num">${p.h}</td><td class="num">${p.qty}</td><td>${bandStr(p.band)||'-'}</td><td class="num">${bendM}m</td><td class="num">${area}m²</td><td class="num">${holes}</td><td>${p.grain?'locked':''}</td><td class="small">${escH(p.note||'')}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>#</th><th>Part</th><th>Material</th><th>Thk</th><th>L mm</th><th>W mm</th><th>Qty</th><th>Banding</th><th>Bend</th><th>Area</th><th>Holes</th><th>Grain</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function perCabinetHardware(cab: Cabinet, S: Settings): string {
  let hinges=0, rails=0;
  const slides: Record<number,number> = {};
  const fullSpan = (modelStackOn(cab) ? modelStackedHeights(cab).reduce((a,h)=>a+h,0) : cab.height) - modelKickH(cab,S);
  cab.rows.forEach(row=>{
    const lays = columnLayout(cab, row, S);
    row.columns.forEach((col,ci)=>{
      if (col.door && col.door.material==='glass' && col.door.type!=='sliding'){
        const faceW = lays.length===1? cab.width : columnFaceWidth(cab, lays[ci], S);
        const leafH = doorDims(faceW, col.door.full? fullSpan : row.h, col.door, S).h;
        hinges += Math.min(6, Math.max(1, col.door.hingeCount ?? doorHingeCount(leafH)));
      }
      col.drawers.forEach(dr=>{
        const cm = Math.round(dr.slideDepthCm);
        slides[cm]=(slides[cm]??0)+1;
      });
      if (col.rail && col.rail!=='off') rails += col.rail==='double'?2:1;
    });
  });
  if ((cab.fullDoor as string)?.startsWith('glass')){
    const leafH = doorDims(cab.width, fullSpan, {type: cab.width>620?'double':'single', style:'overlay', swing:'left', material:'glass', mdfThk:S.mdfThk, hingeBrand:'Universal 35mm', hasHandle:false, handlePos:'center', full:true, hingeCount:cab.fullDoorHinges} as any, S).h;
    hinges += Math.min(6, Math.max(1, cab.fullDoorHinges ?? doorHingeCount(leafH)));
  }
  // MDF doors hinges
  cab.rows.forEach(row=>{
    row.columns.forEach(col=>{
      if (col.door && col.door.material!=='glass'){
        const lay = columnLayout(cab,row,S).find(l=>l.col.id===col.id);
        if (!lay) return;
        const leafH = doorDims(lay.w, col.door.full? fullSpan : row.h, col.door, S).h;
        const cnt = col.door.hingeCount ?? doorHingeCount(leafH);
        hinges += col.door.type==='double'? cnt*2 : cnt;
      }
    });
  });
  if (cab.fullDoor && (cab.fullDoor as string).startsWith('mdf')){
    const leafH = doorDims(cab.width, fullSpan, {type: cab.width>620?'double':'single', style:'overlay', swing:'left', material:'mdf', mdfThk:S.mdfThk, hingeBrand:'Universal 35mm', hasHandle:false, handlePos:'center', full:true, hingeCount:cab.fullDoorHinges} as any, S).h;
    const cnt = cab.fullDoorHinges ?? doorHingeCount(leafH);
    const isDouble = (cab.fullDoor as string).includes('double') || cab.width>620 && (cab.fullDoor==='mdf');
    hinges += isDouble ? cnt*2 : cnt;
  }
  const totalShelves = cab.rows.reduce((a,r)=> a + r.columns.reduce((aa,c)=> aa + (columnHasDrawers(c)?0:c.shelves) + (c.railShelf? railShelfYs(c,S,r.h).length:0) ,0),0);
  const shelfPins = totalShelves*4;
  const rows: string[] = [];
  if (hinges>0) rows.push(`<tr><td>Hinges Universal 35mm</td><td class="num">${hinges}</td><td>pcs</td><td class="small">auto &lt;900→2 900-1799→3 1800-2399→4 2400-2999→5 ≥3000→6 · 140mm from ends</td></tr>`);
  Object.keys(slides).map(Number).sort((a,b)=>a-b).forEach(cm=>{
    rows.push(`<tr><td>Drawer slides ${cm}0mm</td><td class="num">${slides[cm]}</td><td>pairs</td><td class="small">per drawer depth</td></tr>`);
  });
  if (rails>0) rows.push(`<tr><td>Hanging rails</td><td class="num">${rails}</td><td>pcs</td><td class="small">suits/dresses</td></tr>`);
  if (shelfPins>0) rows.push(`<tr><td>Shelf pins 32mm</td><td class="num">${shelfPins}</td><td>pcs</td><td class="small">${totalShelves} shelves ×4</td></tr>`);
  return `<table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Note</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="4" class="muted">No hardware</td></tr>'}</tbody></table>`;
}

export function explodedReportHtml(
  cabinets: Cabinet[],
  settings: Settings,
  panels: PanelItem[] = [],
  grain: GrainOverrides = {},
  project?: ProjectInfo | null,
  customers?: Customer[] | null,
  opts: ExplodedReportOpts = {},
): string {
  const now = new Date();
  const nowStr = now.toLocaleString();
  const dateStr = now.toLocaleDateString();
  const projName = project?.name?.trim() || 'Untitled Project';
  const projType = project?.type || '-';
  const projStatus = project?.status || 'draft';
  const projNotes = project?.notes || '';
  const customer = customers?.find(c=>c.id===project?.customerId) ?? null;

  const allMerged = allPartsMerged(cabinets, settings, grain, panels);
  const totalParts = allMerged.reduce((a,p)=>a+p.qty,0);
  const totalArea = allMerged.reduce((a,p)=>a+(p.w*p.h*p.qty)/1e6,0);
  const totalBend = allMerged.reduce((a,p)=>a+(bandLengthMm(p)*p.qty)/1000,0);
  const nesting = nestParts(allMerged, settings);
  const totalSheets = nesting.reduce((a,g)=>a+g.sheets.length,0);
  const banding = bandingByMaterial(cabinets, settings);

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
    const explodedSvg = explodedCabinetSvg(cab, settings, grain);
    const openSvg = openDoorViewSvg(cab, settings);
    const drillL = drillingMapSvg(cab, settings, 'L');
    const drillR = drillingMapSvg(cab, settings, 'R');
    const cutTable = perCabinetCutTable(cab, settings, grain);
    const hwTable = perCabinetHardware(cab, settings);
    const isoShot = opts.perCabinetScreenshots?.[cab.id] ? `<div class="shot"><img src="${opts.perCabinetScreenshots[cab.id]}" alt="${escH(cab.name)} iso"/><div class="small">Iso view – ${escH(cab.name)}</div></div>` : '';
    const explodedShot = opts.explodedScreenshots?.[cab.id] ? `<div class="shot"><img src="${opts.explodedScreenshots[cab.id]}" alt="${escH(cab.name)} exploded"/><div class="small">Exploded 3D – per-part: side L −150 X · side R +150 X · top +120 Y · bottom −40 Y · back −120 Z · door +250 Z (45° open) · drawer +300 Z</div></div>` : '';

    // panel size summary for this cab
    const parts = allPartsMerged([cab], settings, grain, []);
    const totalCabParts = parts.reduce((a,p)=>a+p.qty,0);
    const totalCabArea = parts.reduce((a,p)=>a+(p.w*p.h*p.qty)/1e6,0);

    return `
    <div class="page" id="cab-${cab.id}">
      <h2>Cabinet ${idx+1}/${cabinets.length} – ${escH(cab.name)} – ${cab.width}×${cab.height}×${cab.depth} – ${escH(cab.type)} – Qty ${cab.qty}</h2>
      <div class="card small">Plywood: ${escH(matLabel(settings,{material:'plywood', matId:cab.matId??undefined}))} · ${cab.hasToeKick?'kick':'no-kick'} · ${cab.hasBack===false?'no-back':'back'} · ${cab.hasFronts===false?'no-fronts':'fronts'} · ${modelStackOn(cab)?'stacked '+modelStackedHeights(cab).join('+')+'mm':'single box'} · ${cab.slot && cab.slot!=='none'?'slot '+cab.slot+' '+ (cab.slotFromFront ?? settings.slotFromFront)+'mm':''}</div>
      ${kpis}
      <div style="margin-top:10px" class="grid2">
        <div><h3>Front Elevation (single)</h3><div class="elevation">${cabFront}</div></div>
        <div><h3>3D Iso + Exploded 3D</h3>${isoShot || '<div class="card small">No per-cab iso – use View3D snapshot per cabinet (future)</div>'}${explodedShot}</div>
      </div>
      <div class="footer"><span>${escH(projName)} – ${escH(cab.name)} – Front + Iso</span><span>Page Cab ${idx+1} – Front</span></div>
    </div>

    <div class="page">
      <h2>${escH(cab.name)} – Exploded View (2D schematic)</h2>
      <p class="small">Every real cut part of this cabinet, drawn at scale from the same part generator as the cut list / nesting / DXF (same L-W rotation rule). Each part shows its true name, W×H×thk, qty, hole count, edge-banding ticks (orange) and grain-lock flag; polygon parts keep their exact cut outline (notched sides, kick-cut top/bottom, drawer boxes). Dashed = veneer back / glass reference (not drilled).</p>
      <div class="elevation">${explodedSvg}</div>
      <div class="footer"><span>${escH(projName)} – ${escH(cab.name)} – Exploded 2D</span><span>Cab ${idx+1} – Exploded</span></div>
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
      <p class="small">Per-cabinet cut list – every part rotated once (L-W) then grain lock. Banding: T/B/L/R. Bend = banded edge length × qty. Area = W×H×qty. Holes = holes per part × qty. Material column shows plywood name (follows material).</p>
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
      ${cabinets.map((c,i)=>`<li><a href="#cab-${c.id}">${i+1}. ${escH(c.name)} – ${c.width}×${c.height}×${c.depth} – Exploded / Open Door / Drilling / Cut List / Hardware</a></li>`).join('')}
      <li><a href="#overall-bom">Overall BOM + Cut List (first 200 rows) + Nesting</a></li>
    </ol></div>
    <div class="footer"><span>${escH(projName)} – ${escH(dateStr)}</span><span>Cover – Exploded Report</span></div>
  </div>

  <div class="page" id="overall">
    <h2>Overall – 3D View + Front Elevation (Customer Approval)</h2>
    <div class="grid2">
      <div><h3>3D View (E1 screenshot)</h3>${screenshotHtml}</div>
      <div><h3>Project summary</h3><div class="card"><b>${escH(projName)}</b><br/><span class="small">Cabinets: ${cabinets.map(c=>escH(c.name)).join(', ')||'-'}</span><br/><span class="small">Panels: ${panels.map(p=>escH(p.name)).join(', ')||'-'}</span><br/><br/><span class="small">Settings: body ${settings.bodyThk}mm – MDF ${settings.mdfThk}mm – back ${settings.backThk}mm – bit ${settings.bitDiameter}mm – shelf ${settings.holeDiameter}mm<br/>Hinge auto &lt;900→2 900-1799→3 1800-2399→4 2400-2999→5 ≥3000→6 – cups 140mm from ends<br/>Rail pilots 2×${settings.bitDiameter}mm per rail – min gap above rail ${settings.railShelfMinGap}mm</span></div></div>
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
    <table><thead><tr><th>Group</th><th>Sheets</th><th>Parts</th><th>Area m²</th><th>Avg util</th><th>Strategy</th><th>Unplaced</th></tr></thead><tbody>${nesting.map(g=>`<tr><td>${escH(g.key)}</td><td class="num">${g.sheets.length}</td><td class="num">${g.partCount}</td><td class="num">${(g.totalArea/1e6).toFixed(2)}</td><td class="num">${(g.avgUtil*100).toFixed(1)}%</td><td>${escH(g.strategy||'')}</td><td class="num">${g.unplaced}</td></tr>`).join('') || '<tr><td colspan="7">No nesting</td></tr>'}</tbody></table>
    <h3>Banding by Material</h3>
    <table><thead><tr><th>Material</th><th>Meters</th><th>Width mm</th></tr></thead><tbody>${banding.map(b=>`<tr><td>${escH(b.material)}</td><td class="num">${b.meters.toFixed(2)}</td><td class="num">${b.mm.toFixed(0)}</td></tr>`).join('') || '<tr><td colspan="3">No banding</td></tr>'}</tbody></table>
    <h3>Customer approval</h3>
    <div class="grid2"><div class="card" style="height:70px">Signature / Date<br/><br/><br/></div><div class="card" style="height:70px">Approved / Notes<br/><br/><br/></div></div>
    <div class="footer"><span>${escH(projName)} – ${escH(nowStr)} – CNC-PRO v11</span><span>End – Exploded Report</span></div>
  </div>
  </body></html>`;
}
