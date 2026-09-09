import { useMemo, useState } from "react";
import { FileDown, FolderDown, Layers, PackageOpen } from "lucide-react";
import type { Cabinet, PanelItem, PartMaterial, Settings } from "../types";
import { buildDxf, dxfFileDefs } from "../lib/dxf";
import { DEFAULT_PLY_ID } from "../lib/defaults";
import { allParts, type GrainOverrides } from "../lib/model";
import { nestParts } from "../lib/nesting";
import { downloadRaw } from "../lib/export";
import { Btn, Empty, Stat } from "../components/ui";

const TONE: Record<PartMaterial, "ok" | "warn" | "default"> = {
  plywood: "ok",
  mdf: "warn",
  back: "default",
  glass: "default",
};

export function DxfTab({
  cabinets,
  settings,
  grain = {},
  panels = [],
}: {
  cabinets: Cabinet[];
  settings: Settings;
  grain?: GrainOverrides;
  panels?: PanelItem[];
}) {
  const defs = useMemo(() => dxfFileDefs(settings), [settings]);
  const groups = useMemo(() => nestParts(allParts(cabinets, settings, grain, panels), settings), [cabinets, settings, grain, panels]);
  const [preview, setPreview] = useState<string>("");

  if (cabinets.length === 0 && panels.length === 0) {
    return (
      <div className="card p-4 anim-rise">
        <Empty title="Nothing to export" sub="Add cabinets (or raw panels), then export nested DXF sheets ready for your CAM pipeline." icon={<PackageOpen size={26} />} />
      </div>
    );
  }

  const matStats = (mat: PartMaterial, matId?: string | null) => {
    // rule J — the default "def" plywood group also belongs to the default
    // plywood file (same match as buildDxf)
    const gs = groups.filter(
      (g) => g.material === mat && (mat !== "plywood" || g.matId === (matId ?? null) || (g.matId === null && matId === DEFAULT_PLY_ID))
    );
    const sheets = gs.reduce((a, g) => a + g.sheets.length, 0);
    const parts = gs.reduce((a, g) => a + g.partCount, 0);
    const util = gs.length ? gs.reduce((a, g) => a + g.avgUtil, 0) / gs.length : 0;
    const thks = gs.map((g) => g.thickness).join(" / ");
    return { sheets, parts, util, thks };
  };

  const doExport = (mat: PartMaterial | null, labels: boolean, matId?: string | null) => {
    if (mat === null) {
      defs.forEach((d) =>
        downloadRaw(`${d.filename}${labels ? "" : "_nolabel"}.dxf`, buildDxf(cabinets, settings, d.material, labels, grain, d.matId, panels)),
      );
      setPreview(`Exported ${defs.length} DXF files (${defs.map((d) => d.title).join(", ")})${labels ? "" : " without labels"}.`);
      return;
    }
    const def = defs.find((d) => d.material === mat && d.matId === (matId ?? null))!;
    const name = `${def.filename}${labels ? "" : "_nolabel"}.dxf`;
    downloadRaw(name, buildDxf(cabinets, settings, mat, labels, grain, def.matId, panels));
    const st = matStats(mat);
    setPreview(
      `Exported ${name} — ${st.sheets} sheet(s), ${st.parts} parts, avg util ${(st.util * 100).toFixed(1)}%${labels ? "" : " (no labels)"}.`,
    );
  };

  return (
    <div className="card p-5 anim-rise">
      <h2 className="card-h"><FolderDown size={17} className="text-amber-400" /> DXF Export — Flat Layout ({defs.length} files by material)</h2>
      <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] px-4 py-3 text-[12.5px] text-cyan-200/90">
        <span className="font-semibold">Layers:</span> CUT · CLAMP_HOLES · SHELF_HOLES · SLIDE_HOLES · DRAWER_GROOVE · SHEET · LABEL.
        Units mm, AutoCAD R12-compatible (LINE / CIRCLE / TEXT). Sheets tiled N columns × 5 rows. 10mm clamping holes are added in free areas
        (≥300mm apart). Glass doors appear as <b>GLASS DOOR REF</b> label text (not drilled) — Ø35 cup circles stay out of the DXF.
      </div>

      <div className="flex gap-2 mt-5 flex-wrap">
        {defs.map((d) => (
          <Btn key={d.filename} variant={TONE[d.material]} onClick={() => doExport(d.material, true, d.matId)}>
            <FileDown size={15} /> {d.title} DXF
          </Btn>
        ))}
        <Btn onClick={() => doExport(null, true)}>
          <Layers size={15} /> All {defs.length} files
        </Btn>
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        {defs.map((d) => (
          <Btn key={d.filename + "nl"} size="sm" variant={TONE[d.material]} onClick={() => doExport(d.material, false, d.matId)}>
            {d.title} (no labels)
          </Btn>
        ))}
        <Btn size="sm" onClick={() => doExport(null, false)}>
          All {defs.length} (no labels)
        </Btn>
      </div>

      <div className="flex gap-2.5 mt-6 flex-wrap">
        {groups.map((g) => (
          <Stat
            key={g.key}
            label={g.key}
            value={`${g.sheets.length}`}
            unit={`sheet(s) · ${(g.avgUtil * 100).toFixed(0)}% util`}
            tone={g.material === "mdf" ? "#fbbf24" : g.material === "back" ? "#94a3b8" : "#6ee7b7"}
          />
        ))}
      </div>

      {preview && (
        <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-[12.5px] text-emerald-200">
          {preview}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.07]">
        <table className="tbl w-full min-w-[560px]">
          <thead className="bg-ink-900/80">
            <tr><th>File</th><th>Contents</th><th className="!text-right">Sheets</th><th className="!text-right">Parts</th><th className="!text-right">Avg util</th></tr>
          </thead>
          <tbody className="bg-ink-850/60">
            {defs.map((d) => {
              const st = matStats(d.material, d.matId);
              return (
                <tr key={d.filename}>
                  <td className="font-mono text-amber-300">{d.filename}.dxf</td>
                  <td className="text-ink-300">
                    {d.title} {st.thks ? `${st.thks}mm` : ""}
                    {d.material === "plywood" ? " — carcass, shelves, kicks, drawer boxes" : d.material === "mdf" ? " — doors & drawer fronts" : " — back panels & drawer bottoms"}
                  </td>
                  <td className="!text-right font-mono">{st.sheets}</td>
                  <td className="!text-right font-mono">{st.parts}</td>
                  <td className="!text-right font-mono text-emerald-300">{st.sheets ? `${(st.util * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
