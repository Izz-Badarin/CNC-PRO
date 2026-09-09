import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Crosshair,
  FileDown,
  FilePlus2,
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
  HardDrive,
  AlertTriangle,
} from "lucide-react";
import type { Cabinet, ColumnSpec, Customer, PanelItem, ProjectInfo, Settings } from "./types";
import {
  DEFAULT_SETTINGS,
  PROJECT_TYPES,
  SETTINGS_VERSION,
  builtinLibrary,
  duplicateCabinet,
  makeCabinet,
  migrateCabinet,
  migratePanel,
  migrateSettings,
  nextCopyName,
  type LibraryItem,
} from "./lib/defaults";
import { allParts, drillOps, type GrainOverrides, type RotationOverrides } from "./lib/model";
import { download, readProjectFile } from "./lib/export";
import { buildShareUrl, clearShareParam, decodeProject, shareParamFromUrl } from "./lib/share";
import { findLatestPersistedKey, loadRaw, saveRaw, rotateBackups, idbSet, storageInfo, safeParse, listBackups } from "./lib/storage";
import { Btn } from "./components/ui";
import { OfflineBadge } from "./components/OfflineBadge";
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
  rotation: RotationOverrides;
}

const defaultProject = (): ProjectInfo => ({
  name: "Untitled Project",
  type: PROJECT_TYPES[0],
  customerId: null,
  status: "draft",
  notes: "",
  panels: [],
});

/** force every loaded panel to finite numbers (3D-blank defense, see migratePanel) */
const sanitizeProject = (p: ProjectInfo): ProjectInfo => ({
  ...p,
  panels: (p.panels ?? []).map(migratePanel),
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
    const latestKey = findLatestPersistedKey(SETTINGS_VERSION) || LS_KEY;
    const raw = loadRaw(latestKey) || loadRaw(LS_KEY);
    if (raw) {
      const data = safeParse<any>(raw);
      if (data) {
        const saved: LibraryItem[] = Array.isArray(data.library) ? data.library.filter((l: LibraryItem) => !l.builtin) : [];
        // if we loaded from older version, migrate and resave later
        if (latestKey !== LS_KEY) {
          console.log(`[CNC-PRO] Migrating storage ${latestKey} -> ${LS_KEY}`);
        }
        return {
          settings: migrateSettings(data.settings),
          cabinets: (Array.isArray(data.cabinets) ? data.cabinets : []).map(migrateCabinet),
          project: sanitizeProject({ ...defaultProject(), ...(data.project ?? {}) }),
          customers: Array.isArray(data.customers) ? data.customers : [],
          library: [...builtinLibrary(), ...saved],
          grain: data.grain && typeof data.grain === "object" ? data.grain : {},
          rotation: data.rotation && typeof data.rotation === "object" ? data.rotation : {},
        };
      }
    }
  } catch {
    /* fresh start */
  }
  return { settings: { ...DEFAULT_SETTINGS }, cabinets: demoCabinets(), project: defaultProject(), customers: [], library: builtinLibrary(), grain: {}, rotation: {} };
}

export default function App() {
  const [persisted] = useState(loadPersisted);
  const [settings, setSettingsState] = useState<Settings>(persisted.settings);
  const [cabinets, setCabinetsState] = useState<Cabinet[]>(persisted.cabinets);
  const [project, setProjectState] = useState<ProjectInfo>(persisted.project);
  const [customers, setCustomersState] = useState<Customer[]>(persisted.customers);
  const [library, setLibraryState] = useState<LibraryItem[]>(persisted.library);
  const [grain, setGrainState] = useState<GrainOverrides>(persisted.grain);
  const [rotation, setRotationState] = useState<RotationOverrides>(persisted.rotation);
  const panels = project.panels ?? [];
  const setPanels = useCallback((fn: (p: PanelItem[]) => PanelItem[]) => {
    setProjectState((p) => ({ ...p, panels: fn(p.panels ?? []) }));
  }, []);
  const [tab, setTab] = useState<TabId>("project");
  const [selectedId, setSelectedId] = useState<string | null>(persisted.cabinets[0]?.id ?? null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [shareFlash, setShareFlash] = useState(false);
  const [quotaWarn, setQuotaWarn] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<string | null>(null);
  const [clipboard, setClipboard] = useState<{ kind: "column"; col: ColumnSpec } | null>(null);
  const dirtyRef = useRef(false);

  // PWA install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // import shared project from URL hash
  useEffect(() => {
    const p = shareParamFromUrl();
    if (!p) return;
    void decodeProject(p).then((data) => {
      if (!data) return;
      if (data.settings) setSettingsState(migrateSettings(data.settings as Partial<Settings>));
      if (Array.isArray(data.cabinets)) setCabinetsState((data.cabinets as Cabinet[]).map(migrateCabinet));
      if (data.project) setProjectState(sanitizeProject({ ...defaultProject(), ...(data.project as object) }));
      if (Array.isArray(data.customers)) setCustomersState(data.customers as Customer[]);
      if (Array.isArray(data.library))
        setLibraryState([...builtinLibrary(), ...(data.library as LibraryItem[]).filter((l) => !l.builtin)]);
      if (data.grain && typeof data.grain === "object") setGrainState(data.grain as GrainOverrides);
      if (data.rotation && typeof data.rotation === "object") setRotationState(data.rotation as RotationOverrides);
      clearShareParam();
      alert("Shared project loaded from the link.");
    });
  }, []);

  // robust autosave with quota handling, backup rotation, idb fallback
  useEffect(() => {
    dirtyRef.current = true;
    const t = setTimeout(() => {
      try {
        const payload = JSON.stringify({ settings, cabinets, project, customers, library: library.filter((l) => !l.builtin), grain, rotation });
        const res = saveRaw(LS_KEY, payload);
        if (!res.ok) {
          if (res.quota) {
            setQuotaWarn(`Storage full (${storageInfo().percent}%). Export your project as .json to free space. Old backups will be trimmed.`);
            // try to free oldest backups
            const backs = listBackups(SETTINGS_VERSION);
            if (backs.length > 2) {
              try {
                const oldest = backs[backs.length - 1];
                localStorage.removeItem(oldest.key);
                // retry
                const retry = saveRaw(LS_KEY, payload);
                if (retry.ok) setQuotaWarn(null);
              } catch {}
            }
            // IndexedDB fallback
            void idbSet(LS_KEY, payload);
          } else {
            setQuotaWarn(`Save failed: ${res.error}`);
            void idbSet(LS_KEY, payload);
          }
        } else {
          setQuotaWarn(null);
          // rotate backups every 10 saves or 60s
          try {
            const last = localStorage.getItem("cnc-last-backup-ts");
            const now = Date.now();
            if (!last || now - parseInt(last, 10) > 60000) {
              rotateBackups(SETTINGS_VERSION, payload);
              localStorage.setItem("cnc-last-backup-ts", String(now));
            }
          } catch {}
          dirtyRef.current = false;
        }
      } catch (e: any) {
        setQuotaWarn(`Autosave error: ${String(e?.message || e).slice(0, 200)}`);
        try {
          void idbSet(LS_KEY, JSON.stringify({ settings, cabinets, project, customers, library: library.filter((l) => !l.builtin), grain, rotation }));
        } catch {}
      }
    }, 400);
    return () => clearTimeout(t);
  }, [settings, cabinets, project, customers, library, grain, rotation]);

  // beforeunload warning if dirty and no file saved
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const setCabinets = useCallback((fn: (c: Cabinet[]) => Cabinet[]) => setCabinetsState(fn), []);
  const updateCabinet = useCallback(
    (id: string, fn: (c: Cabinet) => Cabinet) => setCabinetsState((prev) => prev.map((c) => (c.id === id ? fn(c) : c))),
    []
  );
  const setCustomers = useCallback((fn: (c: Customer[]) => Customer[]) => setCustomersState(fn), []);

  const stats = useMemo(() => {
    const parts = allParts(cabinets, settings);
    const holes = drillOps(cabinets, settings).filter((o) => o.x >= 0).length;
    return { cabs: cabinets.length, parts: parts.reduce((a, p) => a + p.qty, 0), holes, units: cabinets.reduce((a, c) => a + Math.max(1, c.qty), 0) };
  }, [cabinets, settings]);

  const newProject = () => {
    const hasWork = cabinets.length > 0 || (project.name && project.name !== "Untitled Project") || panels.length > 0;
    if (hasWork && !window.confirm("Start a new project? The current project remains saved in your browser, but unsaved changes will be cleared from the editor.")) return;
    setCabinetsState([]);
    setProjectState(defaultProject());
    // Customers, materials/settings, and the cabinet library are shared resources;
    // keep them available in the new project.
    setGrainState({});
    setRotationState({});
    setSelectedId(null);
    setTab("project");
    lastFileRef.current = null;
    dirtyRef.current = false;
  };

  const saveProject = (asNew = false) => {
    let name = (lastFileRef.current ?? project.name ?? "cabinet-project").replace(/[^\w\- ]+/g, "").trim() || "cabinet-project";
    const untitled = !project.name || project.name.trim() === "Untitled Project";
    if (asNew || (untitled && !lastFileRef.current)) {
      const input = window.prompt(asNew ? "Save project as…" : "Name this project…", project.name && !untitled ? project.name : "cabinet-project");
      if (input === null) return;
      const trimmed = input.trim();
      if (trimmed) {
        name = trimmed.replace(/[^\w\- ]+/g, "").trim() || name;
        setProjectState((p) => ({ ...p, name: trimmed }));
      }
    }
    const fname = `${name}.json`;
    download(fname, JSON.stringify({ version: SETTINGS_VERSION, settings, cabinets, project: { ...project, name }, customers, library: library.filter((l) => !l.builtin), grain, rotation }, null, 2), "application/json");
    lastFileRef.current = fname;
    dirtyRef.current = false;
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
      rotation,
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
      const data = (await readProjectFile(f)) as { cabinets: Cabinet[]; settings?: Settings; project?: ProjectInfo; customers?: Customer[]; grain?: GrainOverrides; rotation?: RotationOverrides; library?: LibraryItem[] };
      setCabinetsState((data.cabinets ?? []).map(migrateCabinet));
      if (data.settings) setSettingsState(migrateSettings(data.settings));
      if (data.project) setProjectState(sanitizeProject({ ...defaultProject(), ...data.project }));
      if (data.customers) setCustomersState(data.customers);
      if (data.grain) setGrainState(data.grain as GrainOverrides);
      if (data.rotation) setRotationState(data.rotation as RotationOverrides);
      if (data.library) setLibraryState([...builtinLibrary(), ...(data.library as LibraryItem[]).filter((l) => !l.builtin)]);
      setSelectedId(data.cabinets?.[0]?.id ?? null);
      lastFileRef.current = f.name;
      dirtyRef.current = false;
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
    <div
      className="min-h-full flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && f.name.endsWith(".json")) loadProject(f);
      }}
    >
      {/* drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/80 backdrop-blur-sm pointer-events-none">
          <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-amber-400/10 px-10 py-12 text-center">
            <FolderOpen size={32} className="mx-auto text-amber-400 mb-3" />
            <p className="font-display font-bold text-amber-100">Drop project .json to load</p>
            <p className="text-[11px] text-ink-400 mt-1">Works fully offline — plane mode safe</p>
          </div>
        </div>
      )}

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
                  <span className="ml-1.5 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-mono text-amber-300 align-middle">v11 • OFFLINE</span>
                </h1>
                <p className="text-[10.5px] text-ink-400 mt-1 tracking-wide">
                  16.5MM POLYBOARD · AUTO-SHELF 300–350 · MULTI-STRATEGY NESTING · 100% OFFLINE
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <div className="hidden xl:flex mr-2">
                <OfflineBadge />
              </div>
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
              <Btn size="sm" onClick={newProject} title="Close the current project and start with a blank cabinet list">
                <FilePlus2 size={14} /> New
              </Btn>
              <Btn size="sm" variant="ok" onClick={() => saveProject(false)} title="Instant save to the same file — asks for a name first only while the project is still “Untitled Project”">
                <Save size={14} /> {saveFlash ? "Saved!" : "Save"}
              </Btn>
              <Btn size="sm" onClick={() => saveProject(true)} title="Save as a new file (asks for a name)">
                <Save size={14} /> Save As
              </Btn>
              <Btn size="sm" onClick={() => fileRef.current?.click()} title="Open a saved CNC-PRO project JSON file">
                <FolderOpen size={14} /> Open
              </Btn>
              <Btn size="sm" onClick={() => void shareLink()} title="Copy a link that opens this exact project — works offline (hash)">
                <Link2 size={14} /> {shareFlash ? "Copied!" : "Share link"}
              </Btn>
              {installPrompt && (
                <Btn
                  size="sm"
                  variant="warn"
                  onClick={async () => {
                    try {
                      installPrompt.prompt();
                      const choice = await installPrompt.userChoice;
                      if (choice.outcome === "accepted") setInstallPrompt(null);
                    } catch {}
                  }}
                  title="Install as offline PWA — works in plane mode"
                >
                  <HardDrive size={14} /> Install
                </Btn>
              )}
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

          {quotaWarn && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
              <AlertTriangle size={14} /> {quotaWarn}
              <Btn size="sm" variant="warn" onClick={() => saveProject(true)} className="ml-auto">
                Export now
              </Btn>
            </div>
          )}

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
            panels={panels}
            setPanels={setPanels}
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
            setLibrary={setLibraryState}
          />
        )}
        {tab === "view3d" && <View3DTab cabinets={cabinets} settings={settings} setSettings={setSettingsState} panels={panels} />}
        {tab === "view2d" && <View2DTab cabinets={cabinets} settings={settings} setCabinets={setCabinets} panels={panels} setPanels={setPanels} />}
        {tab === "plan" && <PlanTab cabinets={cabinets} settings={settings} setCabinets={setCabinets} panels={panels} setPanels={setPanels} />}
        {tab === "cut" && <CutListTab cabinets={cabinets} settings={settings} grain={grain} setGrain={setGrainState} panels={panels} rotation={rotation} setRotation={setRotationState} />}
        {tab === "nest" && <NestingTab cabinets={cabinets} settings={settings} grain={grain} setSettings={setSettingsState} panels={panels} rotation={rotation} />}
        {tab === "drill" && <DrillTab cabinets={cabinets} settings={settings} grain={grain} panels={panels} rotation={rotation} />}
        {tab === "dxf" && <DxfTab cabinets={cabinets} settings={settings} grain={grain} panels={panels} rotation={rotation} />}
        {tab === "bom" && <BomTab cabinets={cabinets} settings={settings} panels={panels} grain={grain} rotation={rotation} project={project} customers={customers} />}
        {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettingsState} />}
      </main>

      <footer className="border-t border-white/[0.05] py-4">
        <div className="mx-auto max-w-[1680px] px-4 lg:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-ink-500 font-mono">
          <span className="inline-flex items-center gap-1.5">
            <Zap size={11} className="text-amber-400" />
            CNC Cabinet Designer Pro v11 — offline, browser-stored • plane mode ready • PWA cached v2
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <FileDown size={11} /> R12 DXF · 39mm pin offset · MaxRects + shelf heuristics
            </span>
            <OfflineBadge />
          </div>
        </div>
      </footer>
    </div>
  );
}
