import { useEffect, useMemo, useState } from "react";
import { allParts, bandingByMaterial, columnFaceWidth, columnLayout, doorDims, drillOps, doorHingeCount, generatePanelParts, kickH, stackOn, stackedHeights } from "../lib/model";
import { nestParts } from "../lib/nesting";
import type { Cabinet, Customer, PanelItem, ProjectInfo, Settings } from "../types";
import { Btn, Chip } from "../components/ui";
import { bomReportHtml, download, openPrintWindow } from "../lib/export";
import { FileText, FileSpreadsheet, Printer, Camera } from "lucide-react";

interface Props {
  cabinets: Cabinet[];
  settings: Settings;
  panels?: PanelItem[];
  /** grain overrides — affect nesting, hence the sheet counts */
  grain?: Record<string, boolean>;
  project?: ProjectInfo | null;
  customers?: Customer[] | null;
}

interface BomRow {
  category: string;
  item: string;
  qty: number;
  unit: string;
  note?: string;
}

export function BomTab({ cabinets, settings, panels = [], grain = {}, project = null, customers = null }: Props) {
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("cnc-last-3d-png");
      if (s) setLastScreenshot(s);
    } catch {}
  }, []);

  const bom = useMemo(() => {
    const rows: BomRow[] = [];
    let hinges = 0, drawerBoxes = 0, hangingRails = 0, shelfPins = 0;
    const slides: Record<number, number> = {};
    const materials: Record<string, number> = {};
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
        if (op.type === "hinge") hinges++;
      });
      const fullSpan = (stackOn(cab) ? stackedHeights(cab).reduce((a, h) => a + h, 0) : cab.height) - kickH(cab, settings);
      cab.rows.forEach((row) => {
        const lays = columnLayout(cab, row, settings);
        row.columns.forEach((col, ci) => {
          if (col.door) {
            if (col.door.material === "glass" && col.door.type !== "sliding") {
              const faceW = lays.length === 1 ? cab.width : columnFaceWidth(cab, lays[ci], settings);
              const leafH = doorDims(faceW, col.door.full ? fullSpan : row.h, col.door, settings).h;
              hinges += Math.min(6, Math.max(1, col.door.hingeCount ?? doorHingeCount(leafH)));
            }
          }
          col.drawers.forEach((dr) => {
            if (!dr.hidden) drawerBoxes++;
            const cm = Math.round(dr.slideDepthCm);
            slides[cm] = (slides[cm] ?? 0) + 1;
          });
          if (col.rail && col.rail !== "off") hangingRails += col.rail === "double" ? 2 : 1;
        });
      });
      if (cab.fullDoor === "glass") {
        const leafH = doorDims(cab.width, fullSpan, { type: cab.width > 620 ? "double" : "single", style: "overlay", swing: "left", material: "glass", mdfThk: settings.mdfThk, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", full: true, hingeCount: cab.fullDoorHinges } as any, settings).h;
        hinges += Math.min(6, Math.max(1, cab.fullDoorHinges ?? doorHingeCount(leafH)));
      }
    });
    const sheetCount: Record<string, number> = {};
    nestParts(allParts(cabinets, settings, grain, panels), settings).forEach((g) => {
      const k = `${g.material}@${g.matId ?? "def"}`;
      sheetCount[k] = (sheetCount[k] ?? 0) + g.sheets.length;
    });
    const plyMats = settings.plyMaterials ?? [];
    if (plyMats.length > 0) {
      plyMats.forEach((pm) => {
        const area = materials[pm.id] ?? 0;
        if (area > 0) rows.push({category:"Materials",item:`${pm.name} (2440×1220)`,qty:sheetCount[`plywood@${pm.id}`] ?? 0,unit:"sheets",note:`${area.toFixed(2)} m² · ${pm.solid ? "solid" : "grain"} · nesting`});
      });
    } else {
      const a = materials["plywood"] ?? 0;
      if (a>0) rows.push({category:"Materials",item:"Plywood (2440×1220)",qty:Math.ceil(a/(2.44*1.22)),unit:"sheets",note:`${a.toFixed(2)} m²`});
    }
    if (materials["mdf"]) rows.push({category:"Materials",item:`MDF (${settings.mdfSheet})`,qty:sheetCount["mdf@def"] ?? Math.ceil(materials["mdf"]/(settings.mdfSheet==="3050x1220"?3.05*1.22:2.44*1.22)),unit:"sheets",note:`${materials["mdf"].toFixed(2)} m² · nesting`});
    if (materials["back"]) rows.push({category:"Materials",item:"Veneer back (2440×1220)",qty:sheetCount["back@def"] ?? Math.ceil(materials["back"]/(2.44*1.22)),unit:"sheets",note:`${materials["back"].toFixed(2)} m² · nesting`});
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
    download("bom.csv", [h,...l].join("\n"), "text/csv");
  };
  const exportHtml = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>BOM</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px 10px;text-align:left}th{background:#eee}</style></head><body><h1>Bill of Materials</h1><table><thead><tr><th>Category</th><th>Item</th><th>Qty</th><th>Unit</th><th>Note</th></tr></thead><tbody>${bom.map((r)=>`<tr><td>${r.category}</td><td>${r.item}</td><td>${r.qty}</td><td>${r.unit}</td><td>${r.note??""}</td></tr>`).join("")}</tbody></table></body></html>`;
    download("bom.html", html, "text/html");
  };

  const fullReport = (print = false) => {
    let shot: string | null = lastScreenshot;
    try {
      const s = localStorage.getItem("cnc-last-3d-png");
      if (s) shot = s;
    } catch {}
    const html = bomReportHtml(cabinets, settings, panels, grain, project, customers ?? undefined, { screenshotDataUrl: shot });
    if (print) openPrintWindow(html);
    else download(`BOM-Report-${(project?.name || "project").replace(/[^\\w\\-]+/g, "_")}.html`, html, "text/html");
  };

  return (
    <div className="space-y-4 anim-rise">
      <div className="card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="card-h"><FileText size={17} className="text-amber-400" /> Bill of Materials & Hardware</h2>
            <p className="hint mt-1">Sheet counts from nesting output (M) · slides by real depth pairs/drawer · hinges from new rule ≤1000→2 … &gt;2400→6 incl. glass/full doors (U) · handles removed (L). Full multi-page report includes 3D PNG (E1) + dimensioned elevation (D2) for customer approval (O).</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Btn size="sm" onClick={exportCsv}><FileSpreadsheet size={14} /> CSV</Btn>
            <Btn size="sm" variant="ok" onClick={exportHtml}><Printer size={14} /> Simple HTML</Btn>
            <Btn size="sm" variant="warn" onClick={() => fullReport(true)} title="Multi-page customer report — cover, 3D screenshot (E1), front elevation D2, cabinets, BOM, cut list by material, nesting, banding"><FileText size={14} /> Full Report (print)</Btn>
            <Btn size="sm" onClick={() => fullReport(false)} title="Save multi-page BOM report as HTML file"><FileText size={14} /> Save Full Report</Btn>
          </div>
        </div>
        {lastScreenshot && (
          <div className="mt-3 flex items-center gap-2">
            <Chip tone="green"><Camera size={12} /> 3D screenshot ready — {Math.round(lastScreenshot.length/1024)} KB · will be included in Full Report</Chip>
            <Btn size="sm" variant="danger" onClick={() => { try{ localStorage.removeItem("cnc-last-3d-png"); }catch{}; setLastScreenshot(null); }}>Clear screenshot</Btn>
          </div>
        )}
        {!lastScreenshot && (
          <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11.5px] text-amber-200/90">
            <Camera size={12} className="inline mr-1 -mt-0.5" /> No 3D screenshot yet — go to <b>3D View</b> → click <b>PNG</b>. It saves automatically and will be embedded in the Full Report (O).
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="tbl w-full">
          <thead className="bg-ink-900/80 text-ink-300"><tr><th>Category</th><th>Item</th><th className="!text-right">Qty</th><th>Unit</th><th>Note</th></tr></thead>
          <tbody>{bom.map((r,i) => (<tr key={i} className="border-t border-white/[0.04] hover:bg-ink-900/40"><td className="text-ink-400">{r.category}</td><td>{r.item}</td><td className="!text-right font-mono">{r.qty}</td><td className="text-ink-400">{r.unit}</td><td className="text-ink-500 text-[11px]">{r.note??""}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
