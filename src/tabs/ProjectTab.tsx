import { useMemo, useState } from "react";
import {
  Box,
  Boxes,
  Briefcase,
  ChevronDown,
  Copy,
  Layers,
  Library,
  Pencil,
  Plus,
  Ruler,
  ScanSearch,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import type { Cabinet, CabinetType, Customer, PanelItem, ProjectInfo, ProjectStatus, Settings } from "../types";
import { DEFAULT_DIMS, DEFAULT_PLY_ID, duplicateCabinet, makeCabinet, nextCopyName, plyMaterialsOf, PROJECT_TYPES, sameConfig, TYPE_META, uid, type LibraryItem } from "../lib/defaults";
import { generateCabinetParts, validateCabinet } from "../lib/model";
import { Btn, Chip, Empty, Field, Num, Stat } from "../components/ui";
import { PackDialog } from "../components/PackDialog";

const STATUSES: { v: ProjectStatus; l: string }[] = [
  { v: "draft", l: "Draft" },
  { v: "quoted", l: "Quoted" },
  { v: "production", l: "Production" },
  { v: "done", l: "Done" },
];

/** common sizes for one-click entry */
const QUICK: Record<string, [number, number, number][]> = {
  custom: [
    [400, 720, 560],
    [600, 720, 560],
    [800, 720, 560],
    [900, 720, 560],
  ],
  base: [
    [400, 720, 560],
    [600, 720, 560],
    [800, 720, 560],
    [900, 720, 560],
  ],
  wall: [
    [400, 720, 350],
    [600, 720, 350],
    [800, 720, 350],
    [900, 720, 350],
  ],
  tall: [
    [600, 2100, 560],
    [600, 2300, 560],
  ],
};

export function ProjectTab({
  cabinets,
  settings,
  setCabinets,
  project,
  setProject,
  customers,
  setCustomers,
  onEdit,
  library,
  setLibrary,
  panels = [],
  setPanels,
}: {
  cabinets: Cabinet[];
  settings: Settings;
  setCabinets: (fn: (c: Cabinet[]) => Cabinet[]) => void;
  project: ProjectInfo;
  setProject: (p: ProjectInfo) => void;
  customers: Customer[];
  setCustomers: (fn: (c: Customer[]) => Customer[]) => void;
  onEdit: (id: string) => void;
  library: LibraryItem[];
  setLibrary: (fn: (l: LibraryItem[]) => LibraryItem[]) => void;
  /** raw panels (project-level cut parts) — editor ships in Phase 8 */
  panels?: PanelItem[];
  setPanels?: (fn: (p: PanelItem[]) => PanelItem[]) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CabinetType>("custom");
  // system defaults — 600 × 720 × 560. These are only ever changed by the user.
  const [w, setW] = useState(DEFAULT_DIMS[0]);
  const [h, setH] = useState(DEFAULT_DIMS[1]);
  const [d, setD] = useState(DEFAULT_DIMS[2]);
  const [qty, setQty] = useState(1);
  const [validation, setValidation] = useState<{ cab: string; level: string; msg: string }[] | null>(null);
  const [newCust, setNewCust] = useState("");
  const [search, setSearch] = useState("");
  const [packOpen, setPackOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  /** add a cabinet — identical configurations just bump the quantity */
  const addCabinet = (cab: Cabinet) => {
    setCabinets((cs) => {
      const i = cs.findIndex((x) => sameConfig(x, cab));
      if (i >= 0) return cs.map((x, k) => (k === i ? { ...x, qty: x.qty + cab.qty } : x));
      return [...cs, cab];
    });
  };

  const add = () => {
    const c = makeCabinet(type, w, h, d, name || `${TYPE_META[type].label}-${String(cabinets.length + 1).padStart(2, "0")}`);
    c.qty = Math.max(1, Math.round(qty));
    addCabinet(c);
    setName("");
    // dimensions, quantity and type stay exactly as the user left them
    onEdit(c.id);
  };

  const stats = useMemo(() => {
    const parts = cabinets.flatMap((c) => generateCabinetParts(c, settings));
    return {
      parts: parts.reduce((a, p) => a + p.qty, 0),
      holes: parts.reduce((a, p) => a + p.holes.length * p.qty, 0),
      units: cabinets.reduce((a, c) => a + Math.max(1, c.qty), 0),
      area: parts.reduce((a, p) => a + (p.w * p.h * p.qty) / 1e6, 0),
    };
  }, [cabinets, settings]);

  const issuesByCab = useMemo(() => {
    const m = new Map<string, number>();
    cabinets.forEach((c) => m.set(c.id, validateCabinet(c, settings).filter((v) => v.level === "err").length));
    return m;
  }, [cabinets, settings]);

  const customer = customers.find((c) => c.id === project.customerId) ?? null;
  const quick = QUICK[type] ?? [];
  const filtered = search
    ? cabinets.filter((c) => `${c.name} ${TYPE_META[c.type].label} ${c.width}${c.height}${c.depth}`.toLowerCase().includes(search.toLowerCase()))
    : cabinets;

  return (
    <>
    <PackDialog
      open={packOpen}
      onClose={() => setPackOpen(false)}
      startIndex={cabinets.length}
      onAdd={(cabs) => cabs.forEach(addCabinet)}
    />
    <div className="grid gap-5 xl:grid-cols-[380px_1fr] anim-rise">
      {/* ============ left: add + project ============ */}
      <div className="space-y-4">
        {/* ---- add cabinet (primary action) ---- */}
        <div className="card p-5">
          <h2 className="card-h"><Box size={17} className="text-amber-400" /> Add Cabinet</h2>

          <div className="mt-4 space-y-3.5">
            <Field label="Type">
              <select
                className="inp"
                value={type}
                onChange={(e) => {
                  // changing the type NEVER alters the dimensions or quantity
                  setType(e.target.value as CabinetType);
                }}
              >
                {Object.entries(TYPE_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label} — {v.desc}</option>
                ))}
              </select>
            </Field>

            {quick.length > 0 && (
              <div>
                <div className="field-label !mb-1.5">Quick size</div>
                <div className="flex flex-wrap gap-1.5">
                  {quick.map(([qw, qh, qd]) => {
                    const active = w === qw && h === qh && d === qd;
                    return (
                      <button
                        key={`${qw}x${qh}`}
                        onClick={() => { setW(qw); setH(qh); setD(qd); }}
                        className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11.5px] transition-all ${
                          active
                            ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                            : "border-white/[0.07] bg-ink-900/70 text-ink-300 hover:text-ink-100 hover:border-white/20"
                        }`}
                      >
                        {qw}×{qh}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2">
              <Field label="W mm"><Num value={w} onChange={setW} /></Field>
              <Field label="H mm"><Num value={h} onChange={setH} /></Field>
              <Field label="D mm"><Num value={d} onChange={setD} /></Field>
              <Field label="Qty"><Num value={qty} onChange={(v) => setQty(Math.max(1, Math.round(v)))} /></Field>
            </div>

            <Field label="Name (optional)">
              <input
                className="inp"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${TYPE_META[type].label}-${String(cabinets.length + 1).padStart(2, "0")}`}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </Field>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Btn variant="ok" className="!py-3 !text-[14px]" onClick={add}>
                <Plus size={17} /> Add cabinet
              </Btn>
              <Btn className="!py-3" title="Enter several cabinets at once in a table" onClick={() => setPackOpen(true)}>
                <Layers size={16} /> Add pack
              </Btn>
            </div>
            <p className="hint">
              Opens the editor right away. Identical cabinets merge into one line with a higher quantity.
              <span className="text-amber-300"> Type, size &amp; qty stay as you set them.</span>
            </p>
          </div>
        </div>

        {/* ---- raw panels (project-level cut parts — full editor in Phase 8) ---- */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="card-h text-[14px]"><Layers size={15} className="text-amber-400" /> Panels</span>
            <Btn
              size="sm"
              onClick={() =>
                setPanels?.((ps) => [
                  ...ps,
                  { id: uid(), name: `Panel-${String(ps.length + 1).padStart(2, "0")}`, w: 400, h: 300, thk: 0, material: "mdf", finish: "oak", grain: true, layout: null },
                ])
              }
              title="Add a raw panel (not inside any cabinet) — appears in cut list, nesting, DXF and BOM"
            >
              <Plus size={12} /> Add panel
            </Btn>
          </div>
          {panels.length === 0 ? (
            <p className="hint mt-2">
              Raw panels are standalone cut parts (an oak MDF panel, a plyboard piece…) — no cabinet needed.
              They flow into the cut list, nesting, DXF and BOM, and show as labeled rectangles in the
              Front / Plan views (floating in 3D).
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {panels.map((p) => (
                <PanelEditor
                  key={p.id}
                  p={p}
                  S={settings}
                  onChange={(patch) => setPanels?.((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))}
                  onDelete={() => setPanels?.((ps) => ps.filter((x) => x.id !== p.id))}
                />
              ))}
            </div>
          )}
        </div>

        {/* ---- library (collapsible) ---- */}
        <div className="card p-4">
          <button className="flex w-full items-center justify-between" onClick={() => setShowLibrary((v) => !v)}>
            <span className="card-h text-[14px]"><Library size={15} className="text-amber-400" /> Library</span>
            <span className="flex items-center gap-2">
              <Chip>{library.length}</Chip>
              <ChevronDown size={15} className={`text-ink-400 transition-transform ${showLibrary ? "rotate-180" : ""}`} />
            </span>
          </button>
          {showLibrary && (
            <div className="mt-3 max-h-[320px] overflow-y-auto pr-1">
              <p className="hint mb-2">
                Cabinet templates — <b>“Save as template”</b> in the Edit tab stores any cabinet here; the <b>+</b> button adds a copy
                to this project (identical configs merge into one line).
              </p>
              <div className="space-y-1.5">
              {library.map((it) => (
                <div key={it.id} className="group flex items-center gap-2 rounded-lg border border-white/[0.06] bg-ink-900/60 px-2.5 py-2 hover:border-amber-400/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <input
                      className="w-full bg-transparent border-0 outline-none text-[12.5px] text-ink-100 focus:text-amber-200"
                      value={it.name}
                      onChange={(e) => setLibrary((l) => l.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))}
                    />
                    <div className="font-mono text-[10.5px] text-ink-400">
                      {it.cabinet.width}×{it.cabinet.height}×{it.cabinet.depth}
                    </div>
                  </div>
                  {it.builtin && <Chip>preset</Chip>}
                  <Btn
                    size="sm"
                    variant="ok"
                    title="Add from template — insert a copy of this template into the project"
                    onClick={() => addCabinet(duplicateCabinet(it.cabinet, it.cabinet.name))}
                  >
                    <Plus size={12} />
                  </Btn>
                  {!it.builtin && (
                    <Btn size="sm" variant="danger" onClick={() => setLibrary((l) => l.filter((x) => x.id !== it.id))}><Trash2 size={12} /></Btn>
                  )}
                </div>
              ))}
              </div>
            </div>
          )}
        </div>

        {/* ---- project details (collapsible) ---- */}
        <div className="card p-4">
          <button className="flex w-full items-center justify-between" onClick={() => setShowDetails((v) => !v)}>
            <span className="card-h text-[14px]"><Briefcase size={15} className="text-amber-400" /> Project details</span>
            <span className="flex items-center gap-2">
              {customer && <Chip tone="cyan">{customer.name}</Chip>}
              <ChevronDown size={15} className={`text-ink-400 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </span>
          </button>

          {showDetails && (
            <div className="mt-4 space-y-3.5">
              <Field label="Project name">
                <input className="inp" value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} placeholder="Smith Kitchen" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select className="inp" value={project.type} onChange={(e) => setProject({ ...project, type: e.target.value })}>
                    {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className="inp" value={project.status} onChange={(e) => setProject({ ...project, status: e.target.value as ProjectStatus })}>
                    {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Customer">
                <select className="inp" value={project.customerId ?? ""} onChange={(e) => setProject({ ...project, customerId: e.target.value || null })}>
                  <option value="">— no customer —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <div className="flex gap-1.5">
                <input className="inp flex-1 !py-1.5 text-[12px]" placeholder="New customer name…" value={newCust} onChange={(e) => setNewCust(e.target.value)} />
                <Btn size="sm" onClick={() => {
                  const nm = newCust.trim();
                  if (!nm) return;
                  const c: Customer = { id: uid(), name: nm, phone: "", email: "", address: "" };
                  setCustomers((cs) => [...cs, c]);
                  setProject({ ...project, customerId: c.id });
                  setNewCust("");
                }}><UserPlus size={13} /></Btn>
              </div>
              {customer && (
                <div className="space-y-2 rounded-lg border border-white/[0.06] bg-ink-900/60 p-2.5">
                  <input className="inp !py-1.5 text-[12px]" placeholder="Phone" value={customer.phone} onChange={(e) => setCustomers((cs) => cs.map((x) => (x.id === customer.id ? { ...x, phone: e.target.value } : x)))} />
                  <input className="inp !py-1.5 text-[12px]" placeholder="Email" value={customer.email} onChange={(e) => setCustomers((cs) => cs.map((x) => (x.id === customer.id ? { ...x, email: e.target.value } : x)))} />
                </div>
              )}
              <Field label="Notes">
                <textarea className="inp min-h-[56px] text-[13px]" value={project.notes} onChange={(e) => setProject({ ...project, notes: e.target.value })} />
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* ============ right: cabinet list ============ */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="card-h">
            <Boxes size={17} className="text-amber-400" /> Cabinets
            {panels.length > 0 && <Chip tone="cyan" className="ml-2">{panels.length} panel{panels.length > 1 ? "s" : ""}</Chip>}
          </h2>
          <div className="flex gap-2">
            <Btn size="sm" onClick={() => {
              const out: { cab: string; level: string; msg: string }[] = [];
              cabinets.forEach((c) => validateCabinet(c, settings).forEach((v) => out.push({ cab: c.name, level: v.level, msg: v.msg })));
              setValidation(out);
            }}>
              <ScanSearch size={14} /> Validate
            </Btn>
            <Btn size="sm" variant="danger" onClick={() => { if (confirm("Remove all cabinets?")) setCabinets(() => []); }} disabled={!cabinets.length}>
              <Trash2 size={14} /> Clear
            </Btn>
          </div>
        </div>

        <div className="flex gap-2.5 mt-4 flex-wrap">
          <Stat label="Lines" value={String(cabinets.length)} />
          <Stat label="Units" value={String(stats.units)} tone="#6ee7b7" />
          <Stat label="Parts" value={String(stats.parts)} tone="#f5b33c" />
          <Stat label="Sheet area" value={stats.area.toFixed(2)} unit="m²" tone="#38bdf8" />
        </div>

        {validation && (
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-ink-900/60 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-semibold text-ink-200">Validation</span>
              <button onClick={() => setValidation(null)} className="text-ink-400 hover:text-ink-100"><X size={14} /></button>
            </div>
            {validation.length === 0 ? (
              <div className="text-emerald-300 text-sm">All cabinets passed.</div>
            ) : (
              <ul className="space-y-1.5 max-h-44 overflow-auto pr-1">
                {validation.map((v, i) => (
                  <li key={i} className="text-xs flex gap-2">
                    <Chip tone={v.level === "err" ? "red" : "amber"}>{v.level === "err" ? "ERR" : "WARN"}</Chip>
                    <span className="text-ink-200"><b>{v.cab}:</b> {v.msg}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {cabinets.length > 4 && (
          <div className="relative mt-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="inp !pl-9" placeholder="Search cabinets…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}

        <div className="mt-4 space-y-2 max-h-[calc(100vh-330px)] overflow-y-auto pr-1">
          {cabinets.length === 0 && (
            <Empty title="No cabinets yet" sub="Pick a type and size on the left, then press Add — the editor opens automatically." />
          )}
          {filtered.map((c, i) => {
            const pc = generateCabinetParts(c, settings).reduce((a, p) => a + p.qty, 0);
            const errs = issuesByCab.get(c.id) ?? 0;
            return (
              <div
                key={c.id}
                onDoubleClick={() => onEdit(c.id)}
                className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-800/50 px-4 py-3 hover:border-amber-400/40 hover:bg-ink-800 transition-all cursor-pointer"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold ${errs ? "bg-red-400/15 text-red-300" : "bg-amber-400/10 text-amber-300"}`}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      className="bg-transparent border-0 outline-none font-semibold text-ink-100 focus:text-amber-200 min-w-0"
                      value={c.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setCabinets((cs) => cs.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                      size={Math.max(8, c.name.length)}
                    />
                    <Chip tone="cyan">{TYPE_META[c.type].label}</Chip>
                    {c.isKitchen && <Chip tone="green">kitchen</Chip>}
                    {errs > 0 && <Chip tone="red">{errs} error{errs > 1 ? "s" : ""}</Chip>}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[12px] text-ink-300 font-mono">
                    <span className="inline-flex items-center gap-1"><Ruler size={12} /> {c.width}×{c.height}×{c.depth}</span>
                    <span>{c.rows.length} sect.</span>
                    <span className="text-amber-300/90">{pc} parts</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center rounded-lg border border-white/[0.07] bg-ink-900/70">
                    <button className="px-2 py-1 text-ink-300 hover:text-ink-100" onClick={() => setCabinets((cs) => cs.map((x) => (x.id === c.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>−</button>
                    <span className="w-7 text-center font-mono text-[12px] text-ink-100">{c.qty}</span>
                    <button className="px-2 py-1 text-ink-300 hover:text-ink-100" onClick={() => setCabinets((cs) => cs.map((x) => (x.id === c.id ? { ...x, qty: x.qty + 1 } : x)))}>+</button>
                  </div>
                  <Btn size="sm" onClick={() => onEdit(c.id)}><Pencil size={13} /> Edit</Btn>
                  <Btn size="sm" title="Duplicate" onClick={() => setCabinets((cs) => [...cs, duplicateCabinet(c, nextCopyName(c.name, cs.map((x) => x.name)))])}>
                    <Copy size={13} />
                  </Btn>
                  <Btn size="sm" title="Save to library" onClick={() => setLibrary((l) => [...l, { id: uid(), name: `${c.name} — ${c.width}×${c.height}×${c.depth}`, cabinet: duplicateCabinet(c, c.name) }])}>
                    <Library size={13} />
                  </Btn>
                  <Btn size="sm" variant="danger" onClick={() => setCabinets((cs) => cs.filter((x) => x.id !== c.id))}><Trash2 size={13} /></Btn>
                </div>
              </div>
            );
          })}
          {cabinets.length > 0 && filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-ink-400">No cabinets match “{search}”.</div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

/** full raw-panel editor (Phase 8) — name, size, thk (0=auto), material,
 *  plywood pick / MDF finish, grain lock, front-view position (auto or x/y) */
function PanelEditor({
  p,
  S,
  onChange,
  onDelete,
}: {
  p: PanelItem;
  S: Settings;
  onChange: (patch: Partial<PanelItem>) => void;
  onDelete: () => void;
}) {
  const plys = plyMaterialsOf(S);
  const autoThk = p.material === "plywood" ? S.bodyThk : p.material === "back" ? S.backThk : S.mdfThk;
  return (
    <div className="rounded-lg border border-white/[0.06] bg-ink-900/60 px-2.5 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className="inp !w-[150px] !py-1 text-[12px]"
          value={p.name}
          onChange={(e) => onChange({ name: e.target.value })}
          title="Panel name"
        />
        <span className="text-[10.5px] text-ink-500">W</span>
        <Num className="!w-[74px] !py-1 !px-2" min={10} value={p.w} onChange={(v) => onChange({ w: Math.max(10, Math.round(v)) })} />
        <span className="text-[10.5px] text-ink-500">H</span>
        <Num className="!w-[74px] !py-1 !px-2" min={10} value={p.h} onChange={(v) => onChange({ h: Math.max(10, Math.round(v)) })} />
        <span className="text-[10.5px] text-ink-500">thk</span>
        <Num className="!w-[64px] !py-1 !px-2" min={0} value={p.thk ?? 0} onChange={(v) => onChange({ thk: Math.max(0, Math.round(v)) })} />
        <span className="text-[10.5px] text-ink-500">{p.thk > 0 ? "mm" : `auto (${autoThk}mm)`}</span>
        <select
          className="inp !w-[104px] !py-1 text-[11px]"
          value={p.material}
          onChange={(e) => {
            const material = e.target.value as PanelItem["material"];
            onChange({
              material,
              matId: material === "plywood" ? (p.matId ?? null) : undefined,
              finish: material === "mdf" ? (p.finish ?? "white") : undefined,
            });
          }}
        >
          <option value="plywood">Plywood</option>
          <option value="mdf">MDF</option>
          <option value="back">Veneer back</option>
        </select>
        {p.material === "plywood" && (
          <select
            className="inp !w-[160px] !py-1 text-[11px]"
            value={p.matId ?? DEFAULT_PLY_ID}
            onChange={(e) => onChange({ matId: e.target.value === DEFAULT_PLY_ID ? null : e.target.value })}
          >
            {plys.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {p.material === "mdf" && (
          <select className="inp !w-[92px] !py-1 text-[11px]" value={p.finish ?? "white"} onChange={(e) => onChange({ finish: e.target.value as "white" | "oak" })}>
            <option value="white">White</option>
            <option value="oak">Oak</option>
          </select>
        )}
        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-ink-300" title="Grain lock — no rotation during nesting">
          <input type="checkbox" className="chk !h-3 !w-3" checked={p.grain ?? false} onChange={(e) => onChange({ grain: e.target.checked })} />
          grain
        </label>
        <Btn size="sm" variant="danger" className="ml-auto" onClick={onDelete}>
          <Trash2 size={11} />
        </Btn>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-1.5 pl-1">
        <span className="text-[10px] text-ink-500">Front-view position:</span>
        <label className="flex items-center gap-1 cursor-pointer text-[10.5px] text-ink-400">
          <input
            type="checkbox"
            className="chk !h-3 !w-3"
            checked={!p.layout}
            onChange={(e) => onChange({ layout: e.target.checked ? null : { x: 0, y: 0 } })}
          />
          auto (after cabinets)
        </label>
        {p.layout && (
          <>
            <span className="text-[10px] text-ink-500">x</span>
            <Num className="!w-[64px] !py-0.5 !px-1.5" value={p.layout.x} onChange={(v) => onChange({ layout: { ...p.layout!, x: Math.round(v) } })} />
            <span className="text-[10px] text-ink-500">y</span>
            <Num className="!w-[64px] !py-0.5 !px-1.5" value={p.layout.y} onChange={(v) => onChange({ layout: { ...p.layout!, y: Math.max(0, Math.round(v)) } })} />
            <span className="text-[10px] text-ink-500">mm</span>
          </>
        )}
        <span className="text-[10px] text-ink-500">· position is display only — cut list / nesting / DXF are unaffected</span>
      </div>
    </div>
  );
}
