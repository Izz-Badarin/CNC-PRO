import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, LayoutList, Printer, Tags, Lock, RotateCw } from "lucide-react";
import type { Cabinet, PanelItem, Settings } from "../types";
import { MATERIAL_LABEL } from "../types";
import { allPartsMerged, bandLengthMm, bandStr, partToggleId, type GrainOverrides, type RotationOverrides, type SizeOverrides, type SkipNestOverrides } from "../lib/model";
import { partMatName, plyMaterialById } from "../lib/defaults";
import { cutListCsv, cutListHtml, download, labelsHtml, openPrintWindow } from "../lib/export";
import { partColor } from "../lib/nesting";
import { Btn, Chip, Empty, Stat } from "../components/ui";
import { useDebounced } from "../lib/useDebounced";

/* English-only labels */
const L: Record<string, string> = {
  noParts: "No parts yet",
  addCabinetsFirst: "Add cabinets first.",
  cutList: "Cut List",
  grainHint: "Checked = grain locked (no rotation during nesting).",
  csv: "CSV",
  print: "HTML / Print",
  pdf: "PDF",
  labels: "Part labels",
  parts: "Parts",
  netArea: "Net area",
  holes: "Holes",
  edgeBanding: "Edge banding",
  grainLock: "Grain lock",
  cabinets: "Cabinet",
  part: "Part",
  grain: "Grain",
  length: "Length",
  width: "Width",
  qty: "Qty",
  banding: "Banding",
  bend: "Bend (m)",
  shape: "Shape",
  polygon: "polygon",
  rect: "rect",
};
const lang = "en";
const t = (_l: string, k: string) => L[k] ?? k;

export function CutListTab({
  cabinets,
  settings,
  grain,
  setGrain,
  panels = [],
  rotation = {},
  skipNest = {},
  setSkipNest,
  sizeOverride = {},
  setSizeOverride,
  setRotation,
}: {
  cabinets: Cabinet[];
  settings: Settings;
  grain: GrainOverrides;
  setGrain: (fn: (g: GrainOverrides) => GrainOverrides) => void;
  panels?: PanelItem[];
  rotation?: RotationOverrides;
  setRotation?: (fn: (r: RotationOverrides) => RotationOverrides) => void;
  skipNest: SkipNestOverrides;
  setSkipNest: (fn: (s: SkipNestOverrides) => SkipNestOverrides) => void;
  sizeOverride: SizeOverrides;
  setSizeOverride: (fn: (s: SizeOverrides) => SizeOverrides) => void;
}) {
  // heavy recompute — let typing settle first
  const dCabinets = useDebounced(cabinets, 180);
  const dSettings = useDebounced(settings, 180);
  const dPanels = useDebounced(panels, 180);
  const parts = useMemo(
    () => allPartsMerged(dCabinets, dSettings, grain, dPanels, rotation, skipNest, sizeOverride),
    [dCabinets, dSettings, grain, dPanels, rotation, skipNest, sizeOverride],
  );
  const [filterCab, setFilterCab] = useState<string>("all");
  const [filterMat, setFilterMat] = useState<string>("all");
  const toggleSkipNest = (cid: string) =>
    setSkipNest((s) => {
      const n = { ...s };
      if (n[cid]) delete n[cid];
      else n[cid] = true;
      return n;
    });
  /** nest-only size override: set one dimension of a row (Length/Width for the sheet only) */
  const setSizeOverrideVal = (cid: string, w: number, h: number) =>
    setSizeOverride((s) => {
      const n = { ...s };
      const wv = Math.round((Number.isFinite(w) && w > 0 ? w : 1) * 10) / 10;
      const hv = Math.round((Number.isFinite(h) && h > 0 ? h : 1) * 10) / 10;
      n[cid] = { w: wv, h: hv };
      return n;
    });
  /** clear a row's nest-only size override → back to the real cabinet size */
  const clearSizeOverride = (cid: string) =>
    setSizeOverride((s) => {
      const n = { ...s };
      delete n[cid];
      return n;
    });
  const filtered = useMemo(
    () =>
      parts.filter(
        (p) =>
          (filterCab === "all" || p.cabName === filterCab) &&
          (filterMat === "all" || p.material + "@" + p.thickness + "@" + (p.matId ?? "def") === filterMat),
      ),
    [parts, filterCab, filterMat],
  );
  const cabOptions = [...new Set(parts.map((p) => p.cabName))].sort();
  const matOptions = (() => {
    const seen = new Map<string, string>();
    filtered.forEach((p) => {
      const key = p.material + "@" + p.thickness + "@" + (p.matId ?? "def");
      if (seen.has(key)) return;
      let label: string;
      if (p.material === "back" || p.material === "plywood") {
        const m = plyMaterialById(settings, p.matId ?? null);
        label = p.material === "back" ? partMatName(settings, { material: "back", matId: p.matId ?? null }) : m ? m.name : "Plywood";
      } else label = MATERIAL_LABEL[p.material];
      seen.set(key, label + " - " + p.thickness + "mm");
    });
    return [...seen.entries()].map(([k, v]) => ({ value: k, label: v })).sort((a, b) => a.label.localeCompare(b.label));
  })();
  const toggleRotate = (cid: string) =>
    setRotation?.((r) => {
      const n = { ...r };
      if (n[cid]) delete n[cid];
      else n[cid] = true;
      return n;
    });

  const byMat = useMemo(() => {
    const m = new Map<string, typeof parts>();
    filtered.forEach((p) => {
      // plywood material id splits same-thickness plywood into separate groups
      const key = `${p.material}@${p.thickness}@${p.matId ?? "def"}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  if (cabinets.length === 0 && panels.length === 0) {
    return (
      <div className="card p-4 anim-rise">
        <Empty title={t(lang, "noParts")} sub={t(lang, "addCabinetsFirst")} icon={<LayoutList size={26} />} />
      </div>
    );
  }

  const totalParts = filtered.reduce((a, p) => a + p.qty, 0);
  const totalArea = filtered.reduce((a, p) => a + (p.w * p.h * p.qty) / 1e6, 0);
  const totalHoles = filtered.reduce((a, p) => a + p.holes.length * p.qty, 0);
  const bandM =
    filtered.reduce(
      (a, p) => a + ((p.band.top ? p.w : 0) + (p.band.bottom ? p.w : 0) + (p.band.left ? p.h : 0) + (p.band.right ? p.h : 0)) * p.qty,
      0,
    ) / 1000;
  const lockedCount = filtered.filter((p) => p.grain).length;
  const rotatedCount = filtered.filter((p) => p.note.includes("manual 90°")).length;
  const excludedInView = filtered.filter((p) => p.skipNest).length;
  const overriddenCount = parts.filter((p) => p.sizeOverride).length;
  const overriddenInView = filtered.filter((p) => p.sizeOverride).length;

  return (
    <div className="card p-5 anim-rise">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="card-h"><LayoutList size={17} className="text-amber-400" /> {t(lang, "cutList")}</h2>
          <p className="hint mt-1">
            Span panels (tops, bottoms, shelves, sections) and backs keep their <span className="text-amber-300">grain along the length</span>; every
            other piece is <span className="text-amber-300">rotated once (length ↔ width)</span> before grain lock is applied. {t(lang, "grainHint")} The{" "}
            <RotateCw size={11} className="inline -mt-0.5 text-cyan-300" /> button rotates <span className="text-cyan-300">any piece 90°</span> — length,
            width, holes, grooves and banding all follow, and nesting, DXF, drilling, BOM and every report update to match.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn size="sm" onClick={() => download("cut-list.csv", cutListCsv(cabinets, settings, grain, panels, rotation, sizeOverride), "text/csv")}>
            <FileSpreadsheet size={14} /> {t(lang, "csv")}
          </Btn>
          <Btn size="sm" variant="ok" onClick={() => openPrintWindow(cutListHtml(cabinets, settings, grain, panels, rotation, sizeOverride))}>
            <FileText size={14} /> {t(lang, "print")}
          </Btn>
          <Btn size="sm" variant="warn" onClick={() => openPrintWindow(cutListHtml(cabinets, settings, grain, panels, rotation, sizeOverride))}>
            <Printer size={14} /> {t(lang, "pdf")}
          </Btn>
          <Btn size="sm" onClick={() => openPrintWindow(labelsHtml(cabinets, settings, grain, panels, rotation, sizeOverride))}>
            <Tags size={14} /> {t(lang, "labels")}
          </Btn>
        </div>
      </div>

      <div className="flex gap-2.5 mt-4 flex-wrap">
        <Stat label={t(lang, "parts")} value={String(totalParts)} />
        <Stat label={t(lang, "netArea")} value={totalArea.toFixed(2)} unit="m²" tone="#f5b33c" />
        <Stat label={t(lang, "holes")} value={String(totalHoles)} tone="#38bdf8" />
        <Stat label={t(lang, "edgeBanding")} value={bandM.toFixed(1)} unit="m" tone="#6ee7b7" />
        <Stat label={t(lang, "grainLock")} value={`${lockedCount}/${parts.length}`} tone="#f0abfc" />
        <Stat label="Auto rotation" value="L↔W" unit="applied" tone="#7dd3fc" />
        <Stat label="Rotated 90°" value={String(rotatedCount)} unit={rotatedCount === 1 ? "piece" : "pieces"} tone="#67e8f9" />
      </div>

      <div className="mt-3 flex gap-2 flex-wrap items-center">
        <span className="text-[11px] text-ink-400">Filter:</span>
        <select
          className="rounded-md border border-white/[0.08] bg-ink-900/80 px-2 py-1 text-[12px] text-ink-100"
          value={filterCab}
          onChange={(e) => setFilterCab(e.target.value)}
          title="Only show this cabinet's parts (across all materials)"
        >
          <option value="all">All cabinets</option>
          {cabOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select
          className="rounded-md border border-white/[0.08] bg-ink-900/80 px-2 py-1 text-[12px] text-ink-100"
          value={filterMat}
          onChange={(e) => setFilterMat(e.target.value)}
          title="Only show this material's parts (across all cabinets)"
        >
          <option value="all">All materials</option>
          {matOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {excludedInView > 0 && <Chip tone="amber">Excluded from nesting: {excludedInView}</Chip>}
        {overriddenInView > 0 && (
          <span title="These parts are cut at edited sizes that don't match the 3D model — nesting/DXF show the override, drilling stays on the real geometry">
            <Chip tone="amber">Nest-only size override: {overriddenInView} part{overriddenInView === 1 ? "" : "s"}</Chip>
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2 flex-wrap">
        <Btn size="sm" onClick={() => setGrain(() => Object.fromEntries(parts.map((p) => [partToggleId(p), true])))}>
          <Lock size={13} /> Lock all
        </Btn>
        <Btn size="sm" onClick={() => setGrain(() => Object.fromEntries(parts.map((p) => [partToggleId(p), false])))}>
          Unlock all
        </Btn>
        {filtered.some((p) => p.skipNest) && (
          <Btn
            size="sm"
            variant="ghost"
            onClick={() =>
              setSkipNest((s) => {
                const n = { ...s };
                filtered.forEach((p) => {
                  n[partToggleId(p)] = false;
                });
                return n;
              })
            }
            title="Include all parts currently shown (across the active filters)"
          >
            <Lock size={13} /> Include {filtered.filter((p) => p.skipNest).length} excluded
          </Btn>
        )}
        <Btn size="sm" variant="ghost" onClick={() => setGrain(() => ({}))}>
          Follow system ({settings.grainLock ? "locked" : "free"})
        </Btn>
        {rotatedCount > 0 && (
          <Btn size="sm" variant="ghost" onClick={() => setRotation?.(() => ({}))} title="Clear every manual 90° rotation">
            <RotateCw size={13} /> Reset rotations ({rotatedCount})
          </Btn>
        )}
        {overriddenCount > 0 && (
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => setSizeOverride(() => ({}))}
            title="Restore every part to its real cabinet size (clears all nest-only size overrides)"
          >
            ↺ Reset size overrides ({overriddenCount})
          </Btn>
        )}
      </div>

      {byMat.map(([key, list]) => {
        const [mat, thk, mid] = key.split("@");
        const matId = mid === "def" ? null : mid;
        // veneer back follows the cabinet plywood — group by its board name
        const ply = mat === "plywood" || mat === "back" ? plyMaterialById(settings, matId) : null;
        const matLabel =
          mat === "back" ? partMatName(settings, { material: "back", matId }) : ply ? ply.name : MATERIAL_LABEL[mat as keyof typeof MATERIAL_LABEL];
        const area = list.reduce((a, p) => a + (p.w * p.h * p.qty) / 1e6, 0);
        // rule R — one checkbox locks/unlocks the grain of the WHOLE group
        const groupLocked = list.every((p) => p.grain);
        const groupSome = list.some((p) => p.grain);
        const setGroupGrain = (v: boolean) =>
          setGrain((g) => {
            const ng = { ...g };
            list.forEach((p) => (ng[partToggleId(p)] = v));
            return ng;
          });
        return (
          <div key={key} className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <Download size={13} className="text-amber-400" />
              {ply && <span className="inline-block h-3 w-3 rounded-full" style={{ background: ply.color }} />}
              <span className="font-display text-sm font-semibold">
                {matLabel} — {thk}mm
              </span>
              <Chip tone="amber">{area.toFixed(2)} m²</Chip>
              <Chip>{list.reduce((a, p) => a + p.qty, 0)} {t(lang, "parts")}</Chip>
              <button
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-cyan-400/30 px-1.5 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-400/10"
                title="Rotate every piece of this group 90° (toggles off when all are already rotated)"
                onClick={() =>
                  setRotation?.((r) => {
                    const ids = list.map(partToggleId);
                    const allOn = ids.every((id) => r[id]);
                    const n = { ...r };
                    ids.forEach((id) => {
                      if (allOn) delete n[id];
                      else n[id] = true;
                    });
                    return n;
                  })
                }
              >
                <RotateCw size={12} /> Rotate group 90°
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
              <table className="tbl w-full min-w-[860px]">
                <thead className="bg-ink-900/80">
                  <tr>
                    <th className="!text-center" title="Included in nesting — uncheck to exclude this part from sheet nesting + DXF (it stays in the cut list & BOM)">In nesting</th>
                    <th>#</th>
                    <th>{t(lang, "cabinets")}</th>
                    <th>{t(lang, "part")}</th>
                    <th className="!text-center" title="Rotate this piece 90° — length ↔ width, holes, grooves and banding all follow; nesting, DXF, drilling and BOM update to match">
                      <RotateCw size={13} className="inline text-cyan-300" />
                    </th>
                    <th className="!text-center" title={`${t(lang, "grainHint")} (group — toggles every row below)`}>
                      <input
                        type="checkbox"
                        className="chk"
                        checked={groupLocked}
                        ref={(el) => {
                          if (el) el.indeterminate = groupSome && !groupLocked;
                        }}
                        onChange={(e) => setGroupGrain(e.target.checked)}
                      />
                    </th>
                    <th className="!text-right" title="Nest-only Length (mm) — editable for the sheet; the 3D model is unchanged">{t(lang, "length")}</th>
                    <th className="!text-right" title="Nest-only Width (mm) — editable for the sheet; the 3D model is unchanged">{t(lang, "width")}</th>
                    <th className="!text-right">{t(lang, "qty")}</th>
                    <th>{t(lang, "banding")}</th>
                    <th className="!text-right" title="Total banded-edge length for this row (incl. qty) — edge-banding tape to buy">{t(lang, "bend")}</th>
                    <th className="!text-right">{t(lang, "holes")}</th>
                    <th>{t(lang, "shape")}</th>
                  </tr>
                </thead>
                <tbody className="bg-ink-850/60">
                  {list.map((p, i) => {
                    const id = partToggleId(p);
                    const rotated = !!rotation[id];
                    return (
                      <tr key={id + i} className={p.skipNest ? "opacity-60" : rotated ? "bg-cyan-400/[0.06]" : undefined}>
                        <td className="!text-center">
                          <input
                            type="checkbox"
                            className="chk"
                            checked={!p.skipNest}
                            title={p.skipNest ? "Excluded from nesting — tick to include it again" : "Included in sheet nesting — untick to exclude it"}
                            onChange={() => toggleSkipNest(id)}
                          />
                        </td>
                        <td className="text-ink-500">{i + 1}</td>
                        <td className="text-ink-300">{p.cabName}</td>
                        <td>
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: partColor(p) }} />
                            {p.name}
                            {rotated && (
                              <span className="rounded border border-cyan-400/40 px-1 text-[10px] text-cyan-300" title="Manually rotated 90° — reflected in nesting, DXF, drilling and BOM">
                                ⟳ 90°
                              </span>
                            )}
                            {p.sizeOverride && (
                              <button
                                className="rounded border border-amber-400/50 bg-amber-400/10 px-1 text-[10px] text-amber-300 hover:bg-amber-400/20"
                                title="Nest-only size override — cut at this edited size (doesn't match the 3D model). Click to restore the real cabinet size."
                                onClick={() => clearSizeOverride(id)}
                              >
                                OVR ↺
                              </button>
                            )}
                          </span>
                        </td>
                        <td className="!text-center">
                          <button
                            className={`inline-flex items-center justify-center rounded-md border p-1 ${
                              rotated
                                ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200"
                                : "border-white/10 text-ink-400 hover:border-cyan-400/40 hover:text-cyan-300"
                            }`}
                            title={rotated ? "Undo the manual 90° rotation" : "Rotate this piece 90° (nesting, DXF, drilling and BOM follow)"}
                            onClick={() => toggleRotate(id)}
                          >
                            <RotateCw size={13} />
                          </button>
                        </td>
                        <td className="!text-center">
                          <input
                            type="checkbox"
                            className="chk"
                            checked={p.grain}
                            title={t(lang, "grainHint")}
                            onChange={(e) => setGrain((g) => ({ ...g, [id]: e.target.checked }))}
                          />
                        </td>
                        <td className="!text-right font-mono">
                          {p.shape === "rect" ? (
                            <input
                              type="number"
                              className={`w-[74px] rounded-md border px-1 py-0.5 text-right font-mono text-[12px] text-ink-100 focus:outline-none ${
                                p.sizeOverride ? "border-amber-400/50 bg-amber-400/5 text-amber-200" : "border-white/10 bg-ink-900/80 focus:border-amber-400/60"
                              }`}
                              value={p.w}
                              min={1}
                              step={1}
                              title="Nest-only Length (mm) — used for sheet nesting + DXF only, NOT the 3D model"
                              onChange={(e) => setSizeOverrideVal(id, +e.target.value, p.h)}
                            />
                          ) : (
                            p.w
                          )}
                        </td>
                        <td className="!text-right font-mono">
                          {p.shape === "rect" ? (
                            <input
                              type="number"
                              className={`w-[74px] rounded-md border px-1 py-0.5 text-right font-mono text-[12px] text-ink-100 focus:outline-none ${
                                p.sizeOverride ? "border-amber-400/50 bg-amber-400/5 text-amber-200" : "border-white/10 bg-ink-900/80 focus:border-amber-400/60"
                              }`}
                              value={p.h}
                              min={1}
                              step={1}
                              title="Nest-only Width (mm) — used for sheet nesting + DXF only, NOT the 3D model"
                              onChange={(e) => setSizeOverrideVal(id, p.w, +e.target.value)}
                            />
                          ) : (
                            p.h
                          )}
                        </td>
                        <td className="!text-right font-mono text-amber-300">{p.qty}</td>
                        <td className="font-mono text-[11px] text-ink-300">{bandStr(p.band)}</td>
                        <td className="!text-right font-mono">{bandLengthMm(p) > 0 ? ((bandLengthMm(p) * p.qty) / 1000).toFixed(2) : "—"}</td>
                        <td className="!text-right font-mono">{p.holes.length * p.qty || "—"}</td>
                        <td className="text-[11px] text-ink-400">{p.shape === "poly" ? `${t(lang, "polygon")} (${p.outline.length})` : t(lang, "rect")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
