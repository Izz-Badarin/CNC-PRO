import { useMemo } from "react";
import { Download, FileSpreadsheet, FileText, LayoutList, Printer, Tags, Lock, RotateCw } from "lucide-react";
import type { Cabinet, PanelItem, Settings } from "../types";
import { MATERIAL_LABEL } from "../types";
import { allPartsMerged, bandLengthMm, bandStr, canonicalPartId, type GrainOverrides, type RotationOverrides } from "../lib/model";
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
  setRotation,
}: {
  cabinets: Cabinet[];
  settings: Settings;
  grain: GrainOverrides;
  setGrain: (fn: (g: GrainOverrides) => GrainOverrides) => void;
  panels?: PanelItem[];
  rotation?: RotationOverrides;
  setRotation?: (fn: (r: RotationOverrides) => RotationOverrides) => void;
}) {
  // heavy recompute — let typing settle first
  const dCabinets = useDebounced(cabinets, 180);
  const dSettings = useDebounced(settings, 180);
  const dPanels = useDebounced(panels, 180);
  const parts = useMemo(
    () => allPartsMerged(dCabinets, dSettings, grain, dPanels, rotation),
    [dCabinets, dSettings, grain, dPanels, rotation],
  );
  const toggleRotate = (cid: string) =>
    setRotation?.((r) => {
      const n = { ...r };
      if (n[cid]) delete n[cid];
      else n[cid] = true;
      return n;
    });

  const byMat = useMemo(() => {
    const m = new Map<string, typeof parts>();
    parts.forEach((p) => {
      // plywood material id splits same-thickness plywood into separate groups
      const key = `${p.material}@${p.thickness}@${p.matId ?? "def"}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [parts]);

  if (cabinets.length === 0 && panels.length === 0) {
    return (
      <div className="card p-4 anim-rise">
        <Empty title={t(lang, "noParts")} sub={t(lang, "addCabinetsFirst")} icon={<LayoutList size={26} />} />
      </div>
    );
  }

  const totalParts = parts.reduce((a, p) => a + p.qty, 0);
  const totalArea = parts.reduce((a, p) => a + (p.w * p.h * p.qty) / 1e6, 0);
  const totalHoles = parts.reduce((a, p) => a + p.holes.length * p.qty, 0);
  const bandM =
    parts.reduce(
      (a, p) => a + ((p.band.top ? p.w : 0) + (p.band.bottom ? p.w : 0) + (p.band.left ? p.h : 0) + (p.band.right ? p.h : 0)) * p.qty,
      0,
    ) / 1000;
  const lockedCount = parts.filter((p) => p.grain).length;
  const rotatedCount = parts.filter((p) => p.note.includes("manual 90°")).length;

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
          <Btn size="sm" onClick={() => download("cut-list.csv", cutListCsv(cabinets, settings, grain, panels, rotation), "text/csv")}>
            <FileSpreadsheet size={14} /> {t(lang, "csv")}
          </Btn>
          <Btn size="sm" variant="ok" onClick={() => openPrintWindow(cutListHtml(cabinets, settings, grain, panels, rotation))}>
            <FileText size={14} /> {t(lang, "print")}
          </Btn>
          <Btn size="sm" variant="warn" onClick={() => openPrintWindow(cutListHtml(cabinets, settings, grain, panels, rotation))}>
            <Printer size={14} /> {t(lang, "pdf")}
          </Btn>
          <Btn size="sm" onClick={() => openPrintWindow(labelsHtml(cabinets, settings, grain, panels, rotation))}>
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

      <div className="mt-3 flex gap-2 flex-wrap">
        <Btn size="sm" onClick={() => setGrain(() => Object.fromEntries(parts.map((p) => [canonicalPartId(p), true])))}>
          <Lock size={13} /> Lock all
        </Btn>
        <Btn size="sm" onClick={() => setGrain(() => Object.fromEntries(parts.map((p) => [canonicalPartId(p), false])))}>
          Unlock all
        </Btn>
        <Btn size="sm" variant="ghost" onClick={() => setGrain(() => ({}))}>
          Follow system ({settings.grainLock ? "locked" : "free"})
        </Btn>
        {rotatedCount > 0 && (
          <Btn size="sm" variant="ghost" onClick={() => setRotation?.(() => ({}))} title="Clear every manual 90° rotation">
            <RotateCw size={13} /> Reset rotations ({rotatedCount})
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
            list.forEach((p) => (ng[canonicalPartId(p)] = v));
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
                    const ids = list.map(canonicalPartId);
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
                    <th className="!text-right">{t(lang, "length")}</th>
                    <th className="!text-right">{t(lang, "width")}</th>
                    <th className="!text-right">{t(lang, "qty")}</th>
                    <th>{t(lang, "banding")}</th>
                    <th className="!text-right" title="Total banded-edge length for this row (incl. qty) — edge-banding tape to buy">{t(lang, "bend")}</th>
                    <th className="!text-right">{t(lang, "holes")}</th>
                    <th>{t(lang, "shape")}</th>
                  </tr>
                </thead>
                <tbody className="bg-ink-850/60">
                  {list.map((p, i) => {
                    const id = canonicalPartId(p);
                    const rotated = !!rotation[id];
                    return (
                      <tr key={id + i} className={rotated ? "bg-cyan-400/[0.06]" : undefined}>
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
                        <td className="!text-right font-mono">{p.w}</td>
                        <td className="!text-right font-mono">{p.h}</td>
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
