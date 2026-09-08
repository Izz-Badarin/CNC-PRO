import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Crosshair,
  FileDown,
  FolderDown,
  FolderOpen,
  Layers2,
  Link2,
  LayoutList,
  Move3d,
  Package,
  PencilRuler,
  Save,
  Settings2,
  Zap,
} from "lucide-react";
import type { Cabinet, ColumnSpec, Customer, ProjectInfo, Settings } from "./types";
import {
  DEFAULT_SETTINGS,
  PROJECT_TYPES,
  SETTINGS_VERSION,
  builtinLibrary,
  duplicateCabinet,
  makeCabinet,
  migrateCabinet,
  migrateSettings,
  nextCopyName,
  uid,
  type LibraryItem,
} from "./lib/defaults";
import { allParts, drillOps, type GrainOverrides } from "./lib/model";
import { download, readProjectFile } from "./lib/export";
import { buildShareUrl, clearShareParam, decodeProject, shareParamFromUrl } from "./lib/share";
import { Btn } from "./components/ui";
import { ProjectTab } from "./tabs/ProjectTab";
import { EditTab } from "./tabs/EditTab";
import { View3DTab } from "./tabs/View3DTab";
import { View2DTab } from "./tabs/View2DTab";
import { CutListTab } from "./tabs/CutListTab";
import { NestingTab } from "./tabs/NestingTab";
import { DrillTab } from "./tabs/DrillTab";

import { DxfTab } from "./tabs/DxfTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { BomTab } from "./tabs/BomTab";
import { PlanTab } from "./tabs/PlanTab";



type TabId = "project" | "edit" | "view3d" | "view2d" | "plan" | "cut" | "nest" | "drill" | "dxf" | "bom" | "settings";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "project", label: "Project", icon: <LayoutList size={15} /> },
  { id: "edit", label: "Edit Cabinet", icon: <PencilRuler size={15} /> },
  { id: "view3d", label: "3D View", icon: <Move3d size={15} /> },
  { id: "view2d", label: "Front View", icon: <Layers2 size={15} /> },
  { id: "plan", label: "Plan View", icon: <LayoutList size={15} /> },
  { id: "cut", label: "Cut List", icon: <LayoutList size={15} /> },
  { id: "nest", label: "Nesting", icon: <Package size={15} /> },
  { id: "drill", label: "Drilling", icon: <Crosshair size={15} /> },

  { id: "dxf", label: "DXF Export", icon: <FolderDown size={15} /> },
  { id: "bom", label: "BOM / Hardware", icon: <Package size={15} /> },
  { id: "settings", label: "Settings", icon: <Settings2 size={15} /> },
];

const LS_KEY = `cnc-cabinet-designer-pro-v${SETTINGS_VERSION}`;

interface PersistState {
  settings: Settings;
  cabinets: Cabinet[];
  project: ProjectInfo;
  customers: Customer[];
  library: LibraryItem[];
  grain: GrainOverrides;
}

const defaultProject = (): ProjectInfo => ({
  name: "Untitled Project",
  type: PROJECT_TYPES[0],
  customerId: null,
  status: "draft",
  notes: "",
  panels: [],
});

function demoCabinets(): Cabinet[] {
  return [
    makeCabinet("base", 600, 720, 560, "Base-01"),
    makeCabinet("wall", 800, 720, 350, "Wall-01"),
    makeCabinet("custom", 900, 720, 560, "Custom-01"),
  ];
}

function loadPersisted(): PersistState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const saved: LibraryItem[] = Array.isArray(data.library) ? data.library.filter((l: LibraryItem) => !l.builtin) : [];
      return {
        settings: migrateSettings(data.settings),
        cabinets: (Array.isArray(data.cabinets) ? data.cabinets : []).map(migrateCabinet),
        project: { ...defaultProject(), ...(data.project ?? {}) },
        customers: Array.isArray(data.customers) ? data.customers : [],
        library: [...builtinLibrary(), ...saved],
        grain: data.grain && typeof data.grain === "object" ? data.grain : {},
      };
    }
  } catch {
    /* fresh start */
  }
  return { settings: { ...DEFAULT_SETTINGS }, cabinets: demoCabinets(), project: defaultProject(), customers: [], library: builtinLibrary(), grain: {} };
}

export default function App() {
  const [persisted] = useState(loadPersisted);
  const [settings, setSettingsState] = useState<Settings>(persisted.settings);
  const [cabinets, setCabinetsState] = useState<Cabinet[]>(persisted.cabinets);
  const [project, setProjectState] = useState<ProjectInfo>(persisted.project);
  const [customers, setCustomersState] = useState<Customer[]>(persisted.customers);
  const [library, setLibraryState] = useState<LibraryItem[]>(persisted.library);
  const [grain, setGrainState] = useState<GrainOverrides>(persisted.grain);
  const [panels, setPanels] = useState<PanelItem[]>(persisted.project.panels ?? []);
  const setPanelsFn = useCallback((fn: (p: PanelItem[]) => PanelItem[]) => {
    setPanels((prev) => {
      const next = fn(prev);
      setProjectState((p) => ({ ...p, panels: next }));
      return next;
    });
  }, []);
  const [tab, setTab] = useState<TabId>("project");
  const [selectedId, setSelectedId] = useState<string | null>(persisted.cabinets[0]?.id ?? null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [shareFlash, setShareFlash] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // last filename used by Save/Save As — quick Save reuses it, Save As renames
  const lastFileRef = useRef<string | null>(null);
  // clipboard for copy/paste columns between cabinets
  const [clipboard, setClipboard] = useState<{ kind: "column"; col: ColumnSpec } | null>(null);

  // import a shared project from the URL hash (#p=...) if present
  useEffect(() => {
    const p = shareParamFromUrl();
    if (!p) return;
    void decodeProject(p).then((data) => {
      if (!data) return;
      if (data.settings) setSettingsState(migrateSettings(data.settings as Partial<Settings>));
      if (Array.isArray(data.cabinets)) setCabinetsState((data.cabinets as Cabinet[]).map(migrateCabinet));
      if (data.project) setProjectState({ ...defaultProject(), ...(data.project as object) });
      if (Array.isArray(data.customers)) setCustomersState(data.customers as Customer[]);
      if (Array.isArray(data.library))
        setLibraryState([...builtinLibrary(), ...(data.library as LibraryItem[]).filter((l) => !l.builtin)]);
      if (data.grain && typeof data.grain === "object") setGrainState(data.grain as GrainOverrides);
      clearShareParam();
      alert("Shared project loaded from the link.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          LS_KEY,
          JSON.stringify({ settings, cabinets, project, customers, panels: project.panels, library: library.filter((l) => !l.builtin), grain }),
        );
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [settings, cabinets, project, customers, library, grain]);

  const setCabinets = useCallback((fn: (c: Cabinet[]) => Cabinet[]) => setCabinetsState(fn), []);
  const updateCabinet = useCallback(
    (id: string, fn: (c: Cabinet) => Cabinet) => setCabinetsState((prev) => prev.map((c) => (c.id === id ? fn(c) : c))),
    [],
  );
  const setCustomers = useCallback((fn: (c: Customer[]) => Customer[]) => setCustomersState(fn), []);

  const stats = useMemo(() => {
    const parts = allParts(cabinets, settings);
    const holes = drillOps(cabinets, settings).filter((o) => o.x >= 0).length;
    return { cabs: cabinets.length, parts: parts.reduce((a, p) => a + p.qty, 0), holes, units: cabinets.reduce((a, c) => a + Math.max(1, c.qty), 0) };
  }, [cabinets, settings]);

  const saveProject = (asNew = false) => {
    let name = (lastFileRef.current ?? project.name ?? "cabinet-project").replace(/[^\w\- ]+/g, "").trim() || "cabinet-project";
    if (asNew) {
      const input = window.prompt("Save project as…", project.name || "cabinet-project");
      if (input === null) return; // cancelled
      const trimmed = input.trim();
      if (trimmed) {
        name = trimmed.replace(/[^\w\- ]+/g, "").trim() || name;
        setProjectState((p) => ({ ...p, name: trimmed }));
      }
    }
    const fname = `${name}.json`;
    download(fname, JSON.stringify({ version: SETTINGS_VERSION, settings, cabinets, project: { ...project, name }, customers }, null, 2), "application/json");
    lastFileRef.current = fname;
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1400);
  };

  const shareLink = async () => {
    const url = await buildShareUrl({
      settings,
      cabinets,
      project,
      customers,
      library: library.filter((l) => !l.builtin),
      grain,
    });
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setShareFlash(true);
    setTimeout(() => setShareFlash(false), 1800);
  };

  const loadProject = async (f: File) => {
    try {
      const data = (await readProjectFile(f)) as { cabinets: Cabinet[]; settings?: Settings; project?: ProjectInfo; customers?: Customer[] };
      setCabinetsState((data.cabinets ?? []).map(migrateCabinet));
      if (data.settings) setSettingsState(migrateSettings(data.settings));
      if (data.project) setProjectState({ ...defaultProject(), ...data.project });
      if (data.customers) setCustomersState(data.customers);
      setSelectedId(data.cabinets?.[0]?.id ?? null);
    } catch (e) {
      alert("Could not load project file: " + (e as Error).message);
    }
  };

  const STATUS_TONE: Record<string, string> = {
    draft: "bg-white/[0.06] text-ink-300",
    quoted: "bg-amber-400/15 text-amber-300",
    production: "bg-cyan-400/15 text-cyan-300",
    done: "bg-emerald-400/15 text-emerald-300",
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* ================= header ================= */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto max-w-[1680px] px-4 lg:px-6">
          <div className="flex items-center gap-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 shadow-[0_6px_20px_-4px_rgba(245,179,60,0.6)]">
                <Box size={21} className="text-ink-950" strokeWidth={2.4} />
                <span className="absolute -right-1 -bottom-1 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-ink-950 pulse-dot" />
              </div>
              <div>
                <h1 className="font-display text-[17px] font-bold tracking-tight leading-none">
                  CNC Cabinet Designer <span className="text-amber-400">Pro</span>
                  <span className="ml-1.5 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-mono text-amber-300 align-middle">v11</span>
                </h1>
                <p className="text-[10.5px] text-ink-400 mt-1 tracking-wide">
                  16.5MM POLYBOARD · AUTO-SHELF 300–350 · MULTI-STRATEGY NESTING · QUOTES
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <div className="hidden lg:flex items-center gap-2 mr-2">
                <input
                  className="inp !w-[170px] !py-1.5 text-[12px]"
                  value={project.name}
                  onChange={(e) => setProjectState({ ...project, name: e.target.value })}
                  title="Project name"
                />
                <span className={`rounded-md px-2 py-1 text-[10.5px] font-semibold ${STATUS_TONE[project.status] ?? STATUS_TONE.draft}`}>
                  {project.status}
                </span>

              </div>
              <div className="hidden md:flex items-center gap-4 mr-3 font-mono text-[11px] text-ink-400">
                <span><b className="text-ink-100">{stats.units}</b> units</span>
                <span><b className="text-amber-300">{stats.parts}</b> parts</span>
                <span><b className="text-cyan-300">{stats.holes}</b> holes</span>
              </div>
              <Btn size="sm" variant="ok" onClick={() => saveProject(false)} title="Save to the same file name again">
                <Save size={14} /> {saveFlash ? "Saved!" : "Save"}
              </Btn>
              <Btn size="sm" onClick={() => saveProject(true)} title="Save as a new file (asks for a name)">
                <Save size={14} /> Save As
              </Btn>
              <Btn size="sm" onClick={() => fileRef.current?.click()}>
                <FolderOpen size={14} /> Load
              </Btn>
              <Btn size="sm" onClick={() => void shareLink()} title="Copy a link that opens this exact project">
                <Link2 size={14} /> {shareFlash ? "Copied!" : "Share link"}
              </Btn>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadProject(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto pb-2 -mb-px" style={{ scrollbarWidth: "none" }}>
            {TABS.map((tb) => (
              <button key={tb.id} className={`tab-btn ${tab === tb.id ? "active" : ""}`} onClick={() => setTab(tb.id)}>
                {tb.icon}
                {tb.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ================= main ================= */}
      <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 lg:px-6 py-5">
        {tab === "project" && (
          <ProjectTab
            cabinets={cabinets}
            settings={settings}
            setCabinets={setCabinets}
            project={project}
            setProject={setProjectState}
            customers={customers}
            setCustomers={setCustomers}
            library={library}
            setLibrary={setLibraryState}
            onEdit={(id) => {
              setSelectedId(id);
              setTab("edit");
            }}
          />
        )}
        {tab === "edit" && (
          <EditTab
            cabinets={cabinets}
            settings={settings}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            updateCabinet={updateCabinet}
            clipboard={clipboard}
            setClipboard={setClipboard}
            onDuplicate={(id) => {
              const src = cabinets.find((c) => c.id === id);
              if (!src) return;
              const dup = duplicateCabinet(src, nextCopyName(src.name, cabinets.map((c) => c.name)));
              setCabinetsState((cs) => [...cs, dup]);
              setSelectedId(dup.id);
            }}
          />
        )}
        {tab === "view3d" && <View3DTab cabinets={cabinets} settings={settings} setSettings={setSettingsState} />}
        {tab === "view2d" && <View2DTab cabinets={cabinets} settings={settings} setCabinets={setCabinets} />}
        {tab === "plan" && <PlanTab cabinets={cabinets} settings={settings} setCabinets={setCabinets} />}
        {tab === "cut" && <CutListTab cabinets={cabinets} settings={settings} grain={grain} setGrain={setGrainState} />}
        {tab === "nest" && <NestingTab cabinets={cabinets} settings={settings} grain={grain} setSettings={setSettingsState} />}
        {tab === "drill" && <DrillTab cabinets={cabinets} settings={settings} />}

        {tab === "dxf" && <DxfTab cabinets={cabinets} settings={settings} grain={grain} />}
        {tab === "bom" && <BomTab cabinets={cabinets} settings={settings} />}
        {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettingsState} />}
      </main>

      {/* ================= footer ================= */}
      <footer className="border-t border-white/[0.05] py-4">
        <div className="mx-auto max-w-[1680px] px-4 lg:px-6 flex items-center justify-between text-[11px] text-ink-500 font-mono">
          <span className="inline-flex items-center gap-1.5">
            <Zap size={11} className="text-amber-400" />
            CNC Cabinet Designer Pro v11 — offline, browser-stored
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <FileDown size={11} /> R12 DXF · 39mm pin offset · MaxRects + shelf heuristics
            <span className="text-ink-600" title={uid()}>·</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
