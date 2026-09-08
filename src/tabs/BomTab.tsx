import { useMemo } from "react";
import { allParts, bandingByMaterial, drillOps, doorHingeCount } from "../lib/model";
import type { Cabinet, Settings } from "../types";
import { Btn } from "../components/ui";
import { download } from "../lib/export";

interface Props {
  cabinets: Cabinet[];
  settings: Settings;
}

interface BomRow {
  category: string;
  item: string;
  qty: number;
  unit: string;
  note?: string;
}

export function BomTab({ cabinets, settings }: Props) {
  const bom = useMemo(() => {
    const rows: BomRow[] = [];
    let hinges = 0, drawerBoxes = 0, handles = 0, hangingRails = 0, shelfPins = 0;
    const slides: Record<number, number> = {25:0,30:0,35:0,40:0,45:0,50:0};
    const materials: Record<string, number> = {};
    cabinets.forEach((cab) => {
      allParts([cab], settings).forEach((p) => {
        const m = p.material === "plywood" ? (p.matId ?? "plywood") : p.material;
        materials[m] = (materials[m] ?? 0) + (p.w/1000)*(p.h/1000)*p.qty;
        if (p.name.includes("Shelf") && !p.name.includes("splitter")) shelfPins += Math.max(1,Math.round(settings.shelfHolesPerSide))*2*p.qty;
      });
      drillOps([cab], settings).forEach((op) => {
        if (op.type === "slide") { const d = op.depth; slides[d<=25?25:d<=30?30:d<=35?35:d<=40?40:d<=45?45:50]++; }
        // one drill op per Ø35 hinge CUP — cups already follow the door's
        // hingeCount override (auto or user-set), so count 1:1
        if (op.type === "hinge") hinges++;
      });
      cab.rows.forEach((row) => row.columns.forEach((col) => {
        if (col.door) {
          // cut-part doors are already counted 1:1 from their cups above —
          // count here only GLASS doors (hardware only, no cups are drilled).
          // Glass doors use the same hinge hardware as MDF doors.
          if (col.door.material === "glass" && col.door.type !== "sliding")
            hinges += col.door.hingeCount ?? doorHingeCount(col.door.full ? cab.height : row.h);
          if (col.door.hasHandle) handles++;
        }
        col.drawers.forEach((dr) => { if (!dr.hidden) drawerBoxes++; });
        if (col.rail && col.rail !== "off") hangingRails += col.rail === "double" ? 2 : 1;
      }));
      // cabinet-level glass full door (stacked boxes): hardware only — no cut
      // part, so no cups are drilled; count its hinges from the override/auto.
      // Glass doors use the same hinge hardware as MDF doors.
      if (cab.fullDoor === "glass") hinges += cab.fullDoorHinges ?? doorHingeCount(cab.height);
    });
    // Plywood materials (per library entry)
    const plyMats = settings.plyMaterials ?? [];
    if (plyMats.length > 0) {
      plyMats.forEach((pm) => {
        const area = materials[pm.id] ?? 0;
        if (area > 0) rows.push({category:"Materials",item:`${pm.name} (2440×1220)`,qty:Math.ceil(area/(2.44*1.22)),unit:"sheets",note:`${area.toFixed(2)} m² · ${pm.solid ? "solid" : "grain"}`});
      });
    } else {
      rows.push({category:"Materials",item:"Plywood (2440×1220)",qty:Math.ceil((materials["plywood"]??0)/(2.44*1.22)),unit:"sheets",note:`${(materials["plywood"]??0).toFixed(2)} m²`});
    }
    if (materials["mdf"]) rows.push({category:"Materials",item:`MDF (${settings.mdfSheet})`,qty:Math.ceil(materials["mdf"]/(settings.mdfSheet==="3050x1220"?3.05*1.22:2.44*1.22)),unit:"sheets",note:`${materials["mdf"].toFixed(2)} m²`});
    if (materials["back"]) rows.push({category:"Materials",item:"Veneer back (2440×1220)",qty:Math.ceil(materials["back"]/(2.44*1.22)),unit:"sheets",note:`${materials["back"].toFixed(2)} m²`});
    // edge banding — one row PER MATERIAL, named after the material itself
    bandingByMaterial(cabinets, settings).forEach((b) => {
      rows.push({category:"Materials",item:`Edge banding — ${b.material}`,qty:Math.round(b.meters*10)/10,unit:"m",note:`${b.mm.toFixed(0)} mm`});
    });
    if (hinges>0) rows.push({category:"Hardware",item:"Hinges — Universal 35mm",qty:hinges,unit:"pcs",note:"Ø35 cup bored in the door only"});
    if (handles>0) rows.push({category:"Hardware",item:"Door handles",qty:handles,unit:"pcs"});
    [25,30,35,40,45,50].forEach((d) => { if(slides[d]>0) rows.push({category:"Hardware",item:`Drawer slides ${d}0mm`,qty:slides[d],unit:"pairs"}); });
    if (drawerBoxes>0) rows.push({category:"Hardware",item:"Drawer boxes (pre-built)",qty:drawerBoxes,unit:"pcs"});
    if (hangingRails>0) rows.push({category:"Hardware",item:"Hanging rails",qty:hangingRails,unit:"pcs"});
    if (shelfPins>0) rows.push({category:"Hardware",item:"Shelf pins (32mm)",qty:shelfPins,unit:"pcs"});
    return rows;
  }, [cabinets, settings]);

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
