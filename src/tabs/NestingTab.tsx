import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CircleStop, FileSpreadsheet, Package, PackageOpen, Play, TriangleAlert } from "lucide-react";
import type { Cabinet, PanelItem, Settings } from "../types";
import { MATERIAL_LABEL } from "../types";
import { allPartsMerged, type GrainOverrides } from "../lib/model";
import { partMatName, plyMaterialById } from "../lib/defaults";
import { runNesting, partColor, placedOutline, rotPoint, type NestGroup, type NestRunProgress, type PlacedPart, type Sheet } from "../lib/nesting";
import NestWorker from "../lib/nesting.worker?worker&inline";
import { buildDxf, buildDxfFromSheets, dxfFileDefs, plyGroupMatch } from "../lib/dxf";
import { download, downloadRaw, nestingCsv } from "../lib/export";
import { Btn, Chip, Empty, Stat } from "../components/ui";

export function NestingTab({
  cabinets,
  settings,
  grain = {},
  setSettings,
  panels = [],
}: {
  cabinets: Cabinet[];
  settings: Settings;
  grain?: GrainOverrides;
  setSettings?: (s: Settings) => void;
  panels?: PanelItem[];
}) {
  const parts = useMemo(() => allPartsMerged(cabinets, settings, grain, panels), [cabinets, settings, grain, panels]);
  const partsSig = useMemo(() => parts.map((p) => `${p.name}:${p.w}x${p.h}:${p.qty}`).join("|"), [parts]);
  const [prog, setProg] = useState<NestRunProgress>({ running: false, phase: "Idle", done: 0, total: 0, groups: [] });
  const stopRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const timer = useRef<number | null>(null);

  /* ---- rule N — nest ONE MATERIAL at a time (faster budget, cleaner DXF) ---- */
  const groupKeyOf = (p: (typeof parts)[number]) => `${p.material}@${p.matId ?? "def"}`;
  const matGroups = useMemo(() => {
    const m = new Map<string, { material: (typeof parts)[number]["material"]; matId: string | null; count: number }>();
    parts.forEach((p) => {
      const k = groupKeyOf(p);
      const e = m.get(k) ?? { material: p.material, matId: p.matId ?? null, count: 0 };
      e.count += p.qty;
      m.set(k, e);
    });
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts]);
  const [matSel, setMatSel] = useState("all");
  const matSelEff = matSel !== "all" && !matGroups.some(([k]) => k === matSel) ? "all" : matSel;
  const nestedParts = matSelEff === "all" ? parts : parts.filter((p) => groupKeyOf(p) === matSelEff);
  const groupLabel = (k: string) => {
    const [mat, mid] = k.split("@");
    if (mat === "plywood") {
      const m = plyMaterialById(settings, mid === "def" ? null : mid);
      return m ? m.name : "Plywood";
    }
    if (mat === "back") {
      // veneer back follows the cabinet plywood — show its board name
      return partMatName(settings, { material: "back", matId: mid === "def" ? null : mid });
    }
    return MATERIAL_LABEL[mat as keyof typeof MATERIAL_LABEL];
  };

  const exportDxf = (labels: boolean) => {
    let n = 0;
    const defs = dxfFileDefs(settings);
    // one-material mode → export ONLY that material's file. Plywood AND
    // veneer-back map through the shared rule-J match (the "def" group
    // belongs to the project-default file — same rule as buildDxf).
    const defsToExport =
      matSelEff === "all"
        ? defs
        : defs.filter((d) => {
            const [mat, mid] = matSelEff.split("@");
            if (d.material !== mat) return false;
            if (mat === "plywood" || mat === "back") return plyGroupMatch({ matId: mid === "def" ? null : mid }, d.matId, settings.defaultPlyId);
            return true;
          });
    defsToExport.forEach((d) => {
      const dxf = buildDxf(cabinets, settings, d.material, labels, grain, d.matId, panels);
      if (dxf.includes("LINE")) {
        downloadRaw(`${d.filename}${labels ? "" : "_nolabel"}.dxf`, dxf);
        n++;
      }
    });
    return n;
  };

  type Mode = "labels" | "nolabel" | "none";
  const finish = (mode: Mode, stopped: boolean) => {
    if (stopped) {
      setProg((p) => ({ ...p, running: false, phase: "Stopped — keeping current best" }));
      return;
    }
    if (mode !== "none") {
      const n = exportDxf(mode === "labels");
      setProg((p) => ({ ...p, phase: `${p.phase} · exported ${n} DXF file(s)${mode === "nolabel" ? " (no labels)" : ""}` }));
    }
  };

  const start = (mode: Mode = "none") => {
    stopRef.current = false;
    setProg({ running: true, phase: "Starting…", done: 0, total: 0, groups: [] });
    const run = (pp: typeof nestedParts) => runNesting(pp, settings, setProg, () => stopRef.current).then(() => finish(mode, stopRef.current));
    // preferred path: Web Worker (UI never freezes — the optimizer runs off-thread)
    try {
      const w = new NestWorker();
      workerRef.current = w;
      w.onmessage = (e: MessageEvent) => {
        const m = e.data as { type: string; p?: NestRunProgress; message?: string };
        if (m.type === "progress" && m.p) setProg(m.p);
        else if (m.type === "done") {
          w.terminate();
          workerRef.current = null;
          finish(mode, stopRef.current);
        } else if (m.type === "error") {
          w.terminate();
          workerRef.current = null;
          // fall back to the in-thread engine
          void run(nestedParts);
        }
      };
      w.onerror = () => {
        w.terminate();
        workerRef.current = null;
        void run(nestedParts);
      };
      w.postMessage({ type: "run", parts: nestedParts, settings });
      return;
    } catch {
      workerRef.current = null;
    }
    // fallback: in-thread async engine (yields between strategies)
    void run(nestedParts);
  };

  // auto-run when parts (or the selected material) change (debounced)
  useEffect(() => {
    if (nestedParts.length === 0) return;
    stopRef.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => start("none"), 450);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      const w = workerRef.current;
      if (w) {
        w.postMessage({ type: "stop" });
        window.setTimeout(() => w.terminate(), 300);
        workerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partsSig, matSelEff, settings]);

  if (cabinets.length === 0 && panels.length === 0) {
    return (
      <div className="card p-4 anim-rise">
        <Empty title="Nothing to nest" sub="Add cabinets (or raw panels), then generate optimized sheet layouts with live progress and offcut detection." icon={<PackageOpen size={26} />} />
      </div>
    );
  }

  const groups = prog.groups;
  const sheetsTotal = groups.reduce((a, g) => a + g.sheets.length, 0);
  const avgUtil = groups.length ? groups.reduce((a, g) => a + g.avgUtil, 0) / groups.length : 0;
  const unplaced = groups.reduce((a, g) => a + g.unplaced, 0);
  const pct = prog.running ? (prog.total ? Math.round((prog.done / prog.total) * 100) : 8) : groups.length > 0 ? 100 : 0;

  /* ---- per-sheet (per-board) DXF selection ---- */
  const sheetKey = (g: NestGroup, s: Sheet) => `${g.key}#${s.index}`;
  const [selSheets, setSelSheets] = useState<Set<string>>(new Set());
  const allSheetKeys = groups.flatMap((g) => g.sheets.map((s) => sheetKey(g, s)));
  const selectedRefs = groups.flatMap((g) =>
    g.sheets.filter((s) => selSheets.has(sheetKey(g, s))).map((sheet) => ({ key: g.key, sheet })),
  );
  const toggleSheet = (key: string) =>
    setSelSheets((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const setAllSheets = (on: boolean) => setSelSheets(new Set(on ? allSheetKeys : []));
  const exportSelected = (labels: boolean) => {
    if (!selectedRefs.length) return;
    const dxf = buildDxfFromSheets(selectedRefs, settings, labels);
    downloadRaw(`nested_selected${labels ? "" : "_nolabel"}.dxf`, dxf);
    setProg((p) => ({ ...p, phase: `Exported ${selectedRefs.length} selected sheet(s) to DXF${labels ? "" : " (no labels)"}.` }));
  };

  return (
    <div className="card p-5 anim-rise">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="card-h"><Package size={17} className="text-amber-400" /> Nesting Optimization — Sheet Layouts</h2>
          <p className="hint mt-1">
            52 layouts tried: shelf packing · MaxRects (BAF/BSSF/BLSF) · guillotine saw patterns with offcut merging · every layout overlap-verified · clearance {settings.partClearance}mm · margin{" "}
            {settings.sheetMargin}mm · budget {settings.timeBudget}s/material · from "{settings.nestFrom}" · direction {settings.nestDirection}
            {settings.grainLock ? " · grain locked (no rotation)" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {prog.running ? (
            <Btn size="sm" variant="danger" onClick={() => {
              stopRef.current = true;
              const w = workerRef.current;
              if (w) {
                w.postMessage({ type: "stop" });
                // give the worker a moment to flush its best result, then stop it
                window.setTimeout(() => {
                  if (workerRef.current === w) {
                    w.terminate();
                    workerRef.current = null;
                    setProg((p) => ({ ...p, running: false, phase: "Stopped — keeping current best" }));
                  }
                }, 400);
              }
            }}>
              <CircleStop size={14} /> Stop (keep best)
            </Btn>
          ) : (
            <>
              <Btn size="sm" variant="ok" onClick={() => start("labels")} title="Optimize sheets and save DXF output">
                <Play size={14} /> Generate nesting + DXF
              </Btn>
              <Btn size="sm" variant="ok" onClick={() => start("nolabel")} title="Optimize and export DXF without part text — fastest for CNC">
                <Play size={14} /> Generate nesting (no label) + DXF
              </Btn>
              <Btn size="sm" onClick={() => start("none")}>Optimize only</Btn>
            </>
          )}
          <Btn size="sm" onClick={() => download("nesting.csv", nestingCsv(cabinets, settings, panels), "text/csv")}>
            <FileSpreadsheet size={14} /> Nesting CSV
          </Btn>
        </div>
      </div>

      {/* rule N — nest one material at a time */}
      {matGroups.length > 1 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] text-ink-400">Nest material:</span>
          <select
            className="inp !w-[240px] !py-1.5 text-[12px]"
            value={matSelEff}
            onChange={(e) => setMatSel(e.target.value)}
            title="Nest and export ONE material at a time — the optimizer spends its full time budget on a single board size, and DXF export covers only that material"
          >
            <option value="all">All materials ({parts.reduce((a, p) => a + p.qty, 0)} parts)</option>
            {matGroups.map(([k, e]) => (
              <option key={k} value={k}>
                {groupLabel(k)} {e.count} parts
              </option>
            ))}
          </select>
          {matSelEff !== "all" && (
            <Chip tone="cyan">
              nesting {nestedParts.reduce((a, p) => a + p.qty, 0)} parts · {groupLabel(matSelEff)}
            </Chip>
          )}
        </div>
      )}

      {/* quick-access toe kick toggle */}
      {setSettings && (
        <label
          className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
            settings.kickInNesting !== false
              ? "border-amber-400/35 bg-amber-400/[0.08] text-amber-100"
              : "border-white/[0.07] bg-ink-900/60 text-ink-300"
          }`}
        >
          <input
            type="checkbox"
            className="chk"
            checked={settings.kickInNesting !== false}
            onChange={(e) => setSettings({ ...settings, kickInNesting: e.target.checked })}
          />
          Include Toe Kick Parts
          <span className="text-[10.5px] text-ink-400">(toe kick front + sides in the nesting output)</span>
        </label>
      )}

      {/* quick-access clamping-hole toggle */}
      {setSettings && (
        <label
          className={`ml-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
            settings.clampHoles !== false
              ? "border-cyan-400/35 bg-cyan-400/[0.08] text-cyan-100"
              : "border-white/[0.07] bg-ink-900/60 text-ink-300"
          }`}
        >
          <input
            type="checkbox"
            className="chk"
            checked={settings.clampHoles !== false}
            onChange={(e) => setSettings({ ...settings, clampHoles: e.target.checked })}
          />
          Clamping Holes
          <span className="text-[10.5px] text-ink-400">(10mm vacuum clamps in sheet free areas on DXF)</span>
        </label>
      )}

      {/* progress */}
      <div className="mt-4">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-700">
            <div
              className={`h-full rounded-full transition-all duration-300 ${prog.running ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-ink-300 w-10 text-right">{pct}%</span>
        </div>
        <div className="mt-1.5 text-[12px] text-ink-300 flex items-center gap-2">
          {prog.running && <span className="h-2 w-2 rounded-full bg-amber-400 pulse-dot" />}
          {prog.phase}
        </div>
      </div>

      <div className="flex gap-2.5 mt-4 flex-wrap">
        <Stat label="Sheets" value={String(sheetsTotal)} tone="#f5b33c" />
        <Stat label="Material groups" value={String(groups.length)} />
        <Stat label="Avg utilization" value={`${(avgUtil * 100).toFixed(1)}%`} tone="#6ee7b7" />
        <Stat
          label="Waste"
          value={(
            (sheetsTotal * settings.sheetW * settings.sheetH - groups.reduce((a, g) => a + g.totalArea, 0)) / 1e6
          ).toFixed(2)}
          unit="m²"
          tone="#fb7185"
        />
        {unplaced > 0 && <Stat label="Unplaced parts" value={String(unplaced)} tone="#fb7185" />}
      </div>

      {/* per-board DXF selection */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn size="sm" variant="ok" disabled={selectedRefs.length === 0} onClick={() => exportSelected(true)}>
          <Package size={13} /> Export selected sheet{selectedRefs.length === 1 ? "" : "s"} ({selectedRefs.length}) DXF
        </Btn>
        <Btn size="sm" disabled={selectedRefs.length === 0} onClick={() => exportSelected(false)}>
          No labels
        </Btn>
        <Btn size="sm" onClick={() => setAllSheets(true)}>Select all</Btn>
        <Btn size="sm" onClick={() => setAllSheets(false)}>Clear</Btn>
        <span className="text-[11px] text-ink-400">
          Click a sheet thumbnail to mark that board for DXF export.
        </span>
      </div>

      {/* dedicated Unplaced Parts panel */}
      {unplaced > 0 && (
        <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <TriangleAlert size={16} className="text-red-300" />
            <span className="font-display text-sm font-semibold text-red-200">Unplaced parts — {unplaced}</span>
            <Chip tone="red">not nested on any sheet</Chip>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/[0.07]">
            <table className="tbl w-full min-w-[620px]">
              <thead className="bg-ink-900/80">
                <tr>
                  <th>Cabinet</th><th>Part</th><th>Material</th>
                  <th className="!text-right">Size</th><th>Why it could not be placed</th>
                </tr>
              </thead>
              <tbody className="bg-ink-850/60">
                {groups.flatMap((g) => g.unplacedParts.map((u) => ({ ...u, matId: g.matId }))).map((u, i) => (
                  <tr key={i}>
                    <td className="text-ink-300">{u.cabName}</td>
                    <td>{u.name}</td>
                    <td className="text-ink-300">{u.material === "back" ? partMatName(settings, { material: "back", matId: u.matId }) : MATERIAL_LABEL[u.material]} {u.thickness}</td>
                    <td className="!text-right font-mono">{u.w}×{u.h}</td>
                    <td className="text-[12px] text-red-200/90">{u.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <GroupView key={g.key} g={g} S={settings} selected={selSheets} onToggle={toggleSheet} sheetKey={(s) => sheetKey(g, s)} />
      ))}
    </div>
  );
}

function GroupView({
  g,
  S,
  selected,
  onToggle,
  sheetKey,
}: {
  g: NestGroup;
  S: Settings;
  selected: Set<string>;
  onToggle: (k: string) => void;
  sheetKey: (s: Sheet) => string;
}) {
  return (
    <div className="mt-7">
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        {g.material === "plywood" && <span className="inline-block h-3 w-3 rounded-full" style={{ background: plyMaterialById(S, g.matId).color }} />}
        {g.material === "back" && <span className="inline-block h-3 w-3 rounded-full opacity-70" style={{ background: plyMaterialById(S, g.matId).color }} />}
        <span className="font-display text-sm font-semibold">
          {g.material === "plywood"
            ? plyMaterialById(S, g.matId).name
            : g.material === "back"
              ? partMatName(S, { material: "back", matId: g.matId })
              : MATERIAL_LABEL[g.material]}{" "}
          — {g.thickness}mm
        </span>
        <Chip tone="amber">{g.sheets.length} sheet{g.sheets.length > 1 ? "s" : ""}</Chip>
        <Chip>{g.partCount} parts</Chip>
        <Chip tone="green">{(g.totalArea / 1e6).toFixed(2)} m² net</Chip>
        <Chip tone="cyan">{g.strategy}</Chip>
        {g.unplaced > 0 && <Chip tone="red">{g.unplaced} unplaced</Chip>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {g.sheets.map((s) => {
          const k = sheetKey(s);
          return <SheetView key={s.index} sheet={s} S={S} selected={selected.has(k)} onToggle={() => onToggle(k)} />;
        })}
      </div>
    </div>
  );
}

/** mirror placements for the "nest from" setting (display coordinates: y grows downward like SVG) */
function mirrorForDisplay(pp: PlacedPart, useW: number, useH: number, from: Settings["nestFrom"]): PlacedPart {
  let { x, y } = pp;
  if (from.includes("right")) x = useW - x - pp.w;
  if (from.includes("bottom")) y = useH - y - pp.h;
  return { ...pp, x, y };
}

const SheetView = memo(function SheetView({
  sheet,
  S,
  selected,
  onToggle,
}: {
  sheet: Sheet;
  S: Settings;
  selected: boolean;
  onToggle: () => void;
}) {
  const m = 26;
  // per-sheet size (plywood 2440×1220 · MDF possibly 3050×1220)
  const SW = sheet.sheetW || S.sheetW;
  const SH = sheet.sheetH || S.sheetH;
  const useW = SW - 2 * S.sheetMargin;
  const useH = SH - 2 * S.sheetMargin;
  const vw = SW + m * 2;
  const vh = SH + m * 2 + 30;
  const gridX: number[] = [];
  for (let x = 200; x < SW; x += 200) gridX.push(x);
  const gridY: number[] = [];
  for (let y = 200; y < SH; y += 200) gridY.push(y);

  const placed = sheet.placed.map((p) => mirrorForDisplay(p, useW, useH, S.nestFrom));
  const offcuts = sheet.offcuts.map((o) => {
    let { x, y } = o;
    if (S.nestFrom.includes("right")) x = useW - x - o.w;
    if (S.nestFrom.includes("bottom")) y = useH - y - o.h;
    return { ...o, x, y };
  });

  return (
    <div
      onClick={onToggle}
      className={`relative cursor-pointer rounded-xl border p-2 transition-colors ${
        selected ? "border-amber-400/70 bg-amber-400/[0.04]" : "border-white/[0.07] bg-[#0a0f18] hover:border-white/[0.16]"
      }`}
      title={selected ? "Selected — click to unmark" : "Click to select this board for DXF export"}
    >
      <div
        className={`absolute left-3 top-3 z-10 flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${
          selected ? "border-amber-400 bg-amber-400 text-ink-950" : "border-white/30 bg-black/60 text-transparent"
        }`}
      >
        ✓
      </div>
      <svg viewBox={`0 0 ${vw} ${vh}`} className="w-full h-auto" fontFamily="JetBrains Mono, monospace">
        <rect x="0" y="0" width={vw} height={vh} fill="#0a0f18" />
        {gridX.map((x) => (
          <g key={x}>
            <line x1={m + x} y1={m} x2={m + x} y2={m + SH} stroke="#152238" strokeWidth="1" />
            <text x={m + x} y={m - 6} fill="#33465f" fontSize="9" textAnchor="middle">{x}</text>
          </g>
        ))}
        {gridY.map((y) => (
          <g key={y}>
            <line x1={m} y1={m + y} x2={m + SW} y2={m + y} stroke="#152238" strokeWidth="1" />
            <text x={m - 5} y={m + y + 3} fill="#33465f" fontSize="9" textAnchor="end">{y}</text>
          </g>
        ))}
        {/* sheet board outline only */}
        <rect x={m} y={m} width={SW} height={SH} fill="none" stroke="#3d5878" strokeWidth="1.6" />
        {/* offcuts */}
        {offcuts.map((o, i) => (
          <rect key={i} x={m + S.sheetMargin + o.x} y={m + S.sheetMargin + o.y} width={o.w} height={o.h} fill="rgba(52,211,153,0.06)" stroke="#34d399" strokeDasharray="7 5" strokeWidth="1.2" />
        ))}
        {/* parts */}
        {placed.map((pp, i) => {
          const cx = m + S.sheetMargin + pp.x;
          const cy = m + S.sheetMargin + pp.y;
          const pts = pp.part.shape === "poly" ? placedOutline(pp) : null;
          const label = pp.part.name.replace(/ \(row.*\)/, "");
          return (
            <g key={i}>
              {pts ? (
                <polygon points={pts.map(([px, py]) => `${cx + px},${cy + py}`).join(" ")} fill={`${partColor(pp.part)}26`} stroke={partColor(pp.part)} strokeWidth="1.3" />
              ) : (
                <rect x={cx} y={cy} width={pp.w} height={pp.h} fill={`${partColor(pp.part)}26`} stroke={partColor(pp.part)} strokeWidth="1.3" />
              )}
              {pp.part.holes.map((h, hi) => {
                  const [hx, hy] = pp.rotated ? rotPoint(h.x, h.y, pp.part.w) : [h.x, h.y];
                  return <circle key={hi} cx={cx + hx} cy={cy + hy} r={Math.max(2.6, h.dia / 2)} fill="none" stroke="#f5b33c" strokeWidth="0.9" opacity="0.7" />;
                })}
              <text x={cx + pp.w / 2} y={cy + pp.h / 2 - 5} fill="#dbe2ec" fontSize={Math.min(24, Math.max(11, pp.w / 16))} textAnchor="middle" style={{ userSelect: "none" }}>
                {label}
              </text>
              <text x={cx + pp.w / 2} y={cy + pp.h / 2 + Math.min(20, Math.max(12, pp.w / 18))} fill="#7d8ea6" fontSize={Math.min(20, Math.max(10, pp.w / 20))} textAnchor="middle" style={{ userSelect: "none" }}>
                {pp.part.w}×{pp.part.h}{pp.rotated ? " ↻" : ""} · {pp.part.cabName}
              </text>
            </g>
          );
        })}
        <text x={m} y={vh - 10} fill="#f5b33c" fontSize="13" fontWeight="700">
          Sheet {sheet.index + 1} · util {(sheet.util * 100).toFixed(1)}% · {sheet.placed.length} parts
          {sheet.offcuts.length > 0 ? ` · ${sheet.offcuts.length} offcut${sheet.offcuts.length > 1 ? "s" : ""}` : ""}
        </text>
      </svg>
    </div>
  );
});
