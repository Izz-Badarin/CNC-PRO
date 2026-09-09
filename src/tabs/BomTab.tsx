import { useEffect, useMemo, useState } from "react";
import { allParts, bandingByMaterial, columnFaceWidth, columnLayout, doorDims, drillOps, doorHingeCount, generatePanelParts, glassDoorRefs, kickH, stackOn, stackedHeights, type RotationOverrides } from "../lib/model";
import { nestParts } from "../lib/nesting";
import { applyWaste, plyMaterialById, wastePctOf } from "../lib/defaults";
import type { Cabinet, Customer, PanelItem, ProjectInfo, Settings } from "../types";
import { Btn, Chip } from "../components/ui";
import { bomReportHtml, download, openPrintWindow } from "../lib/export";
import { explodedReportHtml } from "../lib/explodedReport";
import { captureAllCabinetShots, type CabShots } from "../lib/cabShots";
import { FileText, FileSpreadsheet, Printer, Camera, Layers, PackageOpen, Loader2 } from "lucide-react";

interface Props {
  cabinets: Cabinet[];
  settings: Settings;
  panels?: PanelItem[];
  /** grain overrides — affect nesting, hence the sheet counts */
  grain?: Record<string, boolean>;
  /** cut-list manual 90° rotations — every quantity below reflects them */
  rotation?: RotationOverrides;
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

export function BomTab({ cabinets, settings, panels = [], grain = {}, rotation = {}, project = null, customers = null }: Props) {
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);
  const [explodedShots, setExplodedShots] = useState<Record<string, string>>({});
  const [perCabShots, setPerCabShots] = useState<Record<string, string>>({});
  /** automatic ISO/front/left photos per cabinet — captured headlessly on demand */
  const [autoPhotos, setAutoPhotos] = useState(true);
  const [capturing, setCapturing] = useState<{ done: number; total: number } | null>(null);
  const wastePct = wastePctOf(settings);

  // reads the shots captured in 3D View (E1 overall PNG + per-cabinet iso/exploded)
  useEffect(() => {
    try {
      const s = localStorage.getItem("cnc-last-3d-png");
      if (s) setLastScreenshot(s);
      const exp: Record<string, string> = {};
      const per: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const v = localStorage.getItem(k);
        if (!v) continue;
        if (k.startsWith("cnc-exploded-")) exp[k.replace("cnc-exploded-", "")] = v;
        if (k.startsWith("cnc-cab-iso-")) per[k.replace("cnc-cab-iso-", "")] = v;
      }
      setExplodedShots(exp);
      setPerCabShots(per);
    } catch {}
  }, []);

  const hasCabShots = Object.keys(explodedShots).length > 0 || Object.keys(perCabShots).length > 0;

  const bom = useMemo(() => {
    const rows: BomRow[] = [];
    let hinges = 0, hangingRails = 0;
    // shelf PINS are hardware: 4 per shelf (2 per side), independent of how many
    // holes are drilled — the Drilling tab keeps the hole-op count (e.g. 132)
    const allForPins = allParts(cabinets, settings, grain, panels, rotation);
    const totalShelves = allForPins.filter((p) => p.name.startsWith("Shelf")).reduce((a, p) => a + p.qty, 0);
    const shelfPins = totalShelves * 4;
    const slides: Record<number, number> = {};
    const materials: Record<string, number> = {};
    // veneer back area tracked PER PLYWOOD MATERIAL — the back follows the
    // cabinet's plywood (matId), so the BOM gets one line per back material
    const backArea: Record<string, number> = {};
    const addArea = (p: { material: string; matId?: string | null; w: number; h: number; qty: number }) => {
      const m = p.material === "plywood" ? (p.matId ?? "plywood") : p.material === "back" ? `back:${p.matId ?? "def"}` : p.material;
      materials[m] = (materials[m] ?? 0) + (p.w / 1000) * (p.h / 1000) * p.qty;
      if (p.material === "back") backArea[m] = (backArea[m] ?? 0) + (p.w / 1000) * (p.h / 1000) * p.qty;
    };
    generatePanelParts(panels, settings).forEach(addArea);
    cabinets.forEach((cab) => {
      allParts([cab], settings, grain, [], rotation).forEach(addArea);
      drillOps([cab], settings, grain, [], rotation).forEach((op) => {
        if (op.type === "hinge") hinges++;
      });
      const fullSpan = (stackOn(cab) ? stackedHeights(cab).reduce((a, h) => a + h, 0) : cab.height) - kickH(cab, settings);
      // a cabinet-level full door suppresses every per-section door in the
      // model — don't count the suppressed per-column glass door hinges too
      const fullDoorActive = !!cab.fullDoor && cab.fullDoor !== "off";
      cab.rows.forEach((row) => {
        const lays = columnLayout(cab, row, settings);
        row.columns.forEach((col, ci) => {
          if (col.door && !fullDoorActive) {
            if (col.door.material === "glass" && col.door.type !== "sliding") {
              const faceW = lays.length === 1 ? cab.width : columnFaceWidth(cab, lays[ci], settings);
              const leafH = doorDims(faceW, col.door.full ? fullSpan : row.h, col.door, settings).h;
              hinges += Math.min(6, Math.max(1, col.door.hingeCount ?? doorHingeCount(leafH)));
            }
          }
          col.drawers.forEach((dr) => {
            const cm = Math.round(dr.slideDepthCm);
            slides[cm] = (slides[cm] ?? 0) + 1;
          });
          if (col.rail && col.rail !== "off") hangingRails += col.rail === "double" ? 2 : 1;
        });
      });
      if ((cab.fullDoor as string)?.startsWith("glass")) {
        const fdRaw = cab.fullDoor as string;
        const fdSuffix = fdRaw.includes("-") ? fdRaw.split("-")[1] : "";
        const fdType = fdSuffix === "double" ? "double" : fdSuffix === "left" || fdSuffix === "right" ? "single" : cab.width > 620 ? "double" : "single";
        const leafH = doorDims(cab.width, fullSpan, { type: fdType, style: "overlay", swing: fdSuffix === "right" ? "right" : "left", material: "glass", mdfThk: settings.mdfThk, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", full: true, hingeCount: cab.fullDoorHinges } as any, settings).h;
        hinges += Math.min(6, Math.max(1, cab.fullDoorHinges ?? doorHingeCount(leafH)));
      }
    });
    const sheetCount: Record<string, number> = {};
    nestParts(allParts(cabinets, settings, grain, panels, rotation), settings).forEach((g) => {
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
    // every veneer back material gets its own row, named after the plywood it
    // follows — sheet count from the actual nesting output (back@<plyId>)
    Object.entries(backArea).sort((a, b) => b[1] - a[1]).forEach(([key, area]) => {
      const mid = key.slice("back:".length);
      const pm = plyMaterialById(settings, mid === "def" ? null : mid);
      rows.push({category:"Materials",item:`Veneer back — ${pm.name} (2440×1220)`,qty:sheetCount[`back@${mid}`] ?? Math.ceil(area/(2.44*1.22)),unit:"sheets",note:`${area.toFixed(2)} m² · follows ${pm.name} · nesting`});
    });
    bandingByMaterial(cabinets, settings, grain, panels, rotation).forEach((b) => {
      rows.push({category:"Materials",item:`Edge banding — ${b.material}`,qty:Math.round(b.meters*10)/10,unit:"m",note:`${b.mm.toFixed(0)} mm`});
    });
    // Glass doors are PURCHASED hardware (aluminium + glass) — they are listed
    // in the BOM ONLY. They never become a cut part, so the cut list, nesting
    // and every DXF stay glass-free. One row per leaf (size included), counted
    // from the same reference list the Drilling tab shows, × cabinet qty.
    const cabQty = new Map(cabinets.map((c) => [c.id, c.qty ?? 1]));
    const glassAgg: Record<string, { qty: number; w: number; h: number }> = {};
    glassDoorRefs(cabinets, settings).forEach((g) => {
      const key = g.name.replace(" (reference)", "");
      const cur = (glassAgg[key] ??= { qty: 0, w: g.w, h: g.h });
      cur.qty += cabQty.get(g.cabId) ?? 1;
    });
    Object.entries(glassAgg).forEach(([name, { qty, w, h }]) => {
      // name already reads "Glass door" / "Glass full door L" etc.
      rows.push({
        category: "Hardware",
        item: `${name} · ${w}×${h}`,
        qty,
        unit: "pcs",
        note: "purchased (alu + glass) · NOT cut · NOT in DXF · Ø35 hinge cups are drilled in the glass at the positions shown in Drilling",
      });
    });
    if (hinges>0) rows.push({category:"Hardware",item:"Hinges — Universal 35mm",qty:hinges,unit:"pcs",note:"Ø35 cup bored in the door only · auto: <900→2 · 900-1799→3 · 1800-2399→4 · 2400-2999→5 · ≥3000→6 · 140mm from ends"});
    Object.keys(slides).map(Number).sort((a, b) => a - b).forEach((cm) => {
      if (slides[cm] > 0) rows.push({category:"Hardware",item:`Drawer slides ${cm}0mm`,qty:slides[cm],unit:"pairs",note:"1 pair per drawer, by real drawer depth"});
    });
    if (hangingRails>0) rows.push({category:"Hardware",item:"Hanging rails",qty:hangingRails,unit:"pcs"});
    if (shelfPins>0) rows.push({category:"Hardware",item:"Shelf pins (32mm)",qty:shelfPins,unit:"pcs",note:`${totalShelves} shelves ×4`});
    return rows;
  }, [cabinets, settings, panels, grain, rotation]);

  const exportCsv = () => {
    const h = `Category,Item,Net qty,Order qty (+${wastePct}% waste),Unit,Note`;
    const l = bom.map((r) => `${r.category},${r.item},${r.qty},${applyWaste(r.qty, r.unit, wastePct)},${r.unit},${r.note??""}`);
    download("bom.csv", [h,...l].join("\n"), "text/csv");
  };
  const exportHtml = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>BOM</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px 10px;text-align:left}th{background:#eee}</style></head><body><h1>Bill of Materials</h1><p>Net = real quantity · Order = net + ${wastePct}% waste/loss allowance (what to buy).</p><table><thead><tr><th>Category</th><th>Item</th><th>Net</th><th>Order (+${wastePct}%)</th><th>Unit</th><th>Note</th></tr></thead><tbody>${bom.map((r)=>`<tr><td>${r.category}</td><td>${r.item}</td><td>${r.qty}</td><td><b>${applyWaste(r.qty, r.unit, wastePct)}</b></td><td>${r.unit}</td><td>${r.note??""}</td></tr>`).join("")}</tbody></table></body></html>`;
    download("bom.html", html, "text/html");
  };

  const fullReport = (print = false) => {
    let shot: string | null = lastScreenshot;
    try {
      const s = localStorage.getItem("cnc-last-3d-png");
      if (s) shot = s;
    } catch {}
    const html = bomReportHtml(cabinets, settings, panels, grain, project, customers ?? undefined, { screenshotDataUrl: shot }, rotation);
    if (print) openPrintWindow(html);
    else download(`BOM-Report-${(project?.name || "project").replace(/[^\w\-]+/g, "_")}.html`, html, "text/html");
  };

  /** New O - exploded per-cabinet report: each cabinet gets its own pages
   *  (exploded schematic, open-door view, drilling map, panel size table, hardware).
   *  With “auto photos” on, ISO/front/left pictures of every cabinet are
   *  captured headlessly first — no user screenshots needed. */
  const explodedReport = async (print = false) => {
    if (capturing) return;
    let shot: string | null = lastScreenshot;
    const exp: Record<string, string> = { ...explodedShots };
    const per: Record<string, string> = { ...perCabShots };
    try {
      const s = localStorage.getItem("cnc-last-3d-png");
      if (s) shot = s;
      // re-read so shots captured a moment ago in 3D View land without a remount
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const v = localStorage.getItem(k);
        if (!v) continue;
        if (k.startsWith("cnc-exploded-")) exp[k.replace("cnc-exploded-", "")] = v;
        if (k.startsWith("cnc-cab-iso-")) per[k.replace("cnc-cab-iso-", "")] = v;
      }
    } catch {}
    let auto: Record<string, CabShots> | undefined;
    if (autoPhotos && cabinets.length > 0) {
      try {
        setCapturing({ done: 0, total: cabinets.length });
        auto = await captureAllCabinetShots(cabinets, settings, {
          panels,
          onProgress: (done, total) => setCapturing({ done, total }),
        });
      } catch {
        auto = undefined;
      } finally {
        setCapturing(null);
      }
    }
    const html = explodedReportHtml(cabinets, settings, panels, grain, project, customers ?? undefined, {
      screenshotDataUrl: shot,
      perCabinetScreenshots: per,
      explodedScreenshots: exp,
      autoShots: auto,
    }, rotation);
    if (print) openPrintWindow(html);
    else download(`Exploded-Report-${(project?.name || "project").replace(/[^\w\-]+/g, "_")}.html`, html, "text/html");
  };

  return (
    <div className="space-y-4 anim-rise">
      <div className="card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="card-h"><FileText size={17} className="text-amber-400" /> Bill of Materials & Hardware</h2>
            <p className="hint mt-1">Sheet counts from nesting output (M) · slides by real depth pairs/drawer · hinges from the new rule &lt;900→2 … ≥3000→6 incl. glass/full doors (U) · handles removed (L) · glass doors listed HERE only — purchased, never in the DXF. Full multi-page report includes 3D PNG (E1) + dimensioned elevation (D2) for customer approval (O). <span className="text-amber-300">Net</span> = real quantity · <span className="text-emerald-300">Order</span> = net + {wastePct}% waste/loss (Settings → BOM) — what to actually buy.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Btn size="sm" onClick={exportCsv}><FileSpreadsheet size={14} /> CSV</Btn>
            <Btn size="sm" variant="ok" onClick={exportHtml}><Printer size={14} /> Simple HTML</Btn>
            <Btn size="sm" variant="warn" onClick={() => fullReport(true)} title="Multi-page customer report — cover, 3D screenshot (E1), front elevation D2, cabinets, BOM, cut list by material, nesting, banding"><FileText size={14} /> Full Report (print)</Btn>
            <Btn size="sm" onClick={() => fullReport(false)} title="Save multi-page BOM report as HTML file"><FileText size={14} /> Save Full Report</Btn>
            <Btn size="sm" variant="ok" onClick={() => void explodedReport(true)} title="Exploded per-cabinet report - each cabinet gets its own pages: exploded view, open-door view, drilling map, panel size table and hardware">
              {capturing ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />} {capturing ? `Capturing ${capturing.done}/${capturing.total}…` : "Exploded Per-Cab (print)"}
            </Btn>
            <Btn size="sm" onClick={() => void explodedReport(false)} title="Save the exploded per-cabinet report as one offline HTML file">
              {capturing ? <Loader2 size={14} className="animate-spin" /> : <PackageOpen size={14} />} {capturing ? `Capturing ${capturing.done}/${capturing.total}…` : "Save Exploded Report"}
            </Btn>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-[11.5px] text-ink-300" title="Capture ISO / front / left photos of every cabinet automatically (no screenshots needed) and embed them in the Exploded Report">
              <input type="checkbox" className="chk" checked={autoPhotos} onChange={(e) => setAutoPhotos(e.target.checked)} />
              <Camera size={13} className="text-cyan-300" /> Auto ISO / front / left photos
            </label>
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
        {hasCabShots ? (
          <div className="mt-2 flex items-center gap-2">
            <Chip tone="green">
              <Layers size={12} /> {Object.keys(explodedShots).length} exploded + {Object.keys(perCabShots).length} iso per cabinet - embedded in the Exploded Report
            </Chip>
            <Btn size="sm" variant="danger" onClick={() => {
              try {
                Object.keys(localStorage).forEach((k) => {
                  if (k.startsWith("cnc-exploded-") || k.startsWith("cnc-cab-iso-")) localStorage.removeItem(k);
                });
              } catch {}
              setExplodedShots({});
              setPerCabShots({});
            }}>Clear per-cab shots</Btn>
          </div>
        ) : (
          <div className="mt-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.05] px-3 py-2 text-[11.5px] text-cyan-200/90">
            <PackageOpen size={12} className="inline mr-1 -mt-0.5" /> <b>Exploded Per-Cabinet Report</b> - every cabinet gets its own pages: 2D exploded schematic, open-door view, drilling map, panel size table and hardware. For 3D photos per cabinet, go to <b>3D View</b> - <b>Save All Cab PNGs</b> (optional; the report works without them).
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="tbl w-full">
          <thead className="bg-ink-900/80 text-ink-300"><tr><th>Category</th><th>Item</th><th className="!text-right" title="Real (net) quantity">Net</th><th className="!text-right" title={`Order quantity = net + ${wastePct}% waste/loss — what to buy (Settings → BOM)`}>Order (+{wastePct}%)</th><th>Unit</th><th>Note</th></tr></thead>
          <tbody>{bom.map((r,i) => (<tr key={i} className="border-t border-white/[0.04] hover:bg-ink-900/40"><td className="text-ink-400">{r.category}</td><td>{r.item}</td><td className="!text-right font-mono text-ink-300">{r.qty}</td><td className="!text-right font-mono font-semibold text-emerald-300">{applyWaste(r.qty, r.unit, wastePct)}</td><td className="text-ink-400">{r.unit}</td><td className="text-ink-500 text-[11px]">{r.note??""}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
