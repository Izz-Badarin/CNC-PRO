import { useMemo } from "react";
import { allParts, bandingByMaterial, columnFaceWidth, columnLayout, doorDims, drillOps, doorHingeCount, generatePanelParts, kickH, stackOn, stackedHeights } from "../lib/model";
import { nestParts } from "../lib/nesting";
import type { Cabinet, PanelItem, Settings } from "../types";
import { Btn } from "../components/ui";
import { download } from "../lib/export";

interface Props {
  cabinets: Cabinet[];
  settings: Settings;
  panels?: PanelItem[];
  /** grain overrides — affect nesting, hence the sheet counts */
  grain?: Record<string, boolean>;
}

interface BomRow {
  category: string;
  item: string;
  qty: number;
  unit: string;
  note?: string;
}

export function BomTab({ cabinets, settings, panels = [], grain = {} }: Props) {
  const bom = useMemo(() => {
    const rows: BomRow[] = [];
    let hinges = 0, drawerBoxes = 0, hangingRails = 0, shelfPins = 0;
    // rule M — slides counted PER DRAWER at the drawer's REAL slide depth
    const slides: Record<number, number> = {};
    const materials: Record<string, number> = {};
    // raw project panels count toward the material area like any other cut part
    generatePanelParts(panels, settings).forEach((p) => {
      const m = p.material === "plywood" ? (p.matId ?? "plywood") : p.material;
      materials[m] = (materials[m] ?? 0) + (p.w/1000)*(p.h/1000)*p.qty;
    });
    cabinets.forEach((cab) => {
      allParts([cab], settings).forEach((p) => {
        const m = p.material === "plywood" ? (p.matId ?? "plywood") : p.material;
        materials[m] = (materials[m] ?? 0) + (p.w/1000)*(p.h/1000)*p.qty;
        if (p.name.includes("Shelf") && !p.name.includes("splitter")) shelfPins += Math.max(1,Math.round(settings.shelfHolesPerSide))*2*p.qty;
      });
      drillOps([cab], settings).forEach((op) => {
        // one drill op per Ø35 hinge CUP — cups already follow the new hinge
        // rule (≤1000→2 … >2400→6) and the door's override, so count 1:1
        if (op.type === "hinge") hinges++;
      });
      // full-height door span (all boxes, minus kick) — same math as the model
      const fullSpan = (stackOn(cab) ? stackedHeights(cab).reduce((a, h) => a + h, 0) : cab.height) - kickH(cab, settings);
      cab.rows.forEach((row) => {
        const lays = columnLayout(cab, row, settings);
        row.columns.forEach((col, ci) => {
          if (col.door) {
            // cut-part doors are already counted 1:1 from their cups above —
            // count here only GLASS doors (hardware only, no cups drilled),
            // with the NEW rule applied to the REAL leaf height (incl. the
            // manual height override and the full-door span).
            if (col.door.material === "glass" && col.door.type !== "sliding") {
              const faceW = lays.length === 1 ? cab.width : columnFaceWidth(cab, lays[ci], settings);
              const leafH = doorDims(faceW, col.door.full ? fullSpan : row.h, col.door, settings).h;
              hinges += Math.min(6, Math.max(1, col.door.hingeCount ?? doorHingeCount(leafH)));
            }
          }
          col.drawers.forEach((dr) => {
            if (!dr.hidden) drawerBoxes++;
            const cm = Math.round(dr.slideDepthCm);
            slides[cm] = (slides[cm] ?? 0) + 1; // one PAIR of slides per drawer
          });
          if (col.rail && col.rail !== "off") hangingRails += col.rail === "double" ? 2 : 1;
        });
      });
      // cabinet-level glass full door (stacked boxes): hardware only — no cut
      // part, so no cups are drilled; count its hinges from the override/auto
      // rule applied to the full carcass span (not the overall cabinet height).
      if (cab.fullDoor === "glass") {
        const leafH = doorDims(cab.width, fullSpan, { type: cab.width > 620 ? "double" : "single", style: "overlay", swing: "left", material: "glass", mdfThk: settings.mdfThk, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", full: true, hingeCount: cab.fullDoorHinges }, settings).h;
        hinges += Math.min(6, Math.max(1, cab.fullDoorHinges ?? doorHingeCount(leafH)));
      }
    });
    // rule M — sheet counts come from the ACTUAL NESTING output (same
    // packer, same grain locks), not a naive area ÷ sheet-area division
    const sheetCount: Record<string, number> = {};
    nestParts(allParts(cabinets, settings, grain, panels), settings).forEach((g) => {
      const k = `${g.material}@${g.matId ?? "def"}`;
      sheetCount[k] = (sheetCount[k] ?? 0) + g.sheets.length;
    });
    // Plywood materials (per library entry)
    const plyMats = settings.plyMaterials ?? [];
    if (plyMats.length > 0) {
      plyMats.forEach((pm) => {
        const area = materials[pm.id] ?? 0;
        if (area > 0) rows.push({category:"Materials",item:`${pm.name} (2440×1220)`,qty:sheetCount[`plywood@${pm.id}`] ?? 0,unit:"sheets",note:`${area.toFixed(2)} m² · ${pm.solid ? "solid" : "grain"} · nesting`});
      });
    } else {
      const a = materials["plywood"] ?? 0;
      rows.push({category:"Materials",item:"Plywood (2440×1220)",qty:Math.ceil(a/(2.44*1.22)),unit:"sheets",note:`${a.toFixed(2)} m²`});
    }
    if (materials["mdf"]) rows.push({category:"Materials",item:`MDF (${settings.mdfSheet})`,qty:sheetCount["mdf@def"] ?? Math.ceil(materials["mdf"]/(settings.mdfSheet==="3050x1220"?3.05*1.22:2.44*1.22)),unit:"sheets",note:`${materials["mdf"].toFixed(2)} m² · nesting`});
    if (materials["back"]) rows.push({category:"Materials",item:"Veneer back (2440×1220)",qty:sheetCount["back@def"] ?? Math.ceil(materials["back"]/(2.44*1.22)),unit:"sheets",note:`${materials["back"].toFixed(2)} m² · nesting`});
    // edge banding — one row PER MATERIAL, named after the material itself
    bandingByMaterial(cabinets, settings).forEach((b) => {
      rows.push({category:"Materials",item:`Edge banding — ${b.material}`,qty:Math.round(b.meters*10)/10,unit:"m",note:`${b.mm.toFixed(0)} mm`});
    });
    if (hinges>0) rows.push({category:"Hardware",item:"Hinges — Universal 35mm",qty:hinges,unit:"pcs",note:"Ø35 cup bored in the door only · auto: ≤1000→2 ≤1500→3 ≤2000→4 ≤2400→5 >2400→6"});
    Object.keys(slides).map(Number).sort((a, b) => a - b).forEach((cm) => {
      if (slides[cm] > 0) rows.push({category:"Hardware",item:`Drawer slides ${cm}0mm`,qty:slides[cm],unit:"pairs",note:"1 pair per drawer, by real drawer depth"});
    });
    if (drawerBoxes>0) rows.push({category:"Hardware",item:"Drawer boxes (pre-built)",qty:drawerBoxes,unit:"pcs"});
    if (hangingRails>0) rows.push({category:"Hardware",item:"Hanging rails",qty:hangingRails,unit:"pcs"});
    if (shelfPins>0) rows.push({category:"Hardware",item:"Shelf pins (32mm)",qty:shelfPins,unit:"pcs"});
    return rows;
  }, [cabinets, settings, panels, grain]);

  const exportCsv = () => {
    const h = "Category,Item,Qty,Unit,Note";
    const l = bom.map((r) => `${r.category},${r.item},${r.qty},${r.unit},${r.note??""}`);
    download([h,...l].join("\n"), "bom.csv", "text/csv");
  };
  const exportHtml = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>BOM</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px 10px;text-align:left}th{background:#eee}</style></head><body><h1>Bill of Materials</h1><table><thead><tr><th>Category</th><th>Item</th><th>Qty</th><th>Unit</th><th>Note</th></tr></thead><tbody>${bom.map((r)=>`<tr><td>${r.category}</td><td>${r.item}</td><td>${r.qty}</td><td>${r.unit}</td><td>${r.note??""}</td></tr>`).join("")}</tbody></table></body></html>`;
    download(html, "bom.html", "text/html");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bill of Materials & Hardware</h2>
        <div className="flex gap-2"><Btn onClick={exportCsv}>Export CSV</Btn><Btn onClick={exportHtml}>Print HTML</Btn></div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead className="bg-ink-900/80 text-ink-300"><tr><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-left">Unit</th><th className="px-3 py-2 text-left">Note</th></tr></thead>
          <tbody>{bom.map((r,i) => (<tr key={i} className="border-t border-white/[0.04] hover:bg-ink-900/40"><td className="px-3 py-1.5 text-ink-400">{r.category}</td><td className="px-3 py-1.5">{r.item}</td><td className="px-3 py-1.5 text-right font-mono">{r.qty}</td><td className="px-3 py-1.5 text-ink-400">{r.unit}</td><td className="px-3 py-1.5 text-ink-500 text-xs">{r.note??""}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
