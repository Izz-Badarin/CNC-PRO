import { Plus, RotateCcw, Save, Settings2, Palette, Trash2, MoveVertical, Sparkles, HardDrive, ShieldCheck, WifiOff, Download, Trash } from "lucide-react";
import { useState, useEffect } from "react";
import type { PlywoodMaterial, Settings } from "../types";
import { DEFAULT_SETTINGS, AVAILABLE_DRAWER_DEPTHS, SETTINGS_META, normalizeSlidePatterns, plyMaterialsOf, uid, SETTINGS_VERSION } from "../lib/defaults";
import { Btn, Field, Num } from "../components/ui";
import { storageInfo, listBackups, loadRaw } from "../lib/storage";

const MATERIALS: { color: keyof Settings; opacity: keyof Settings; label: string }[] = [
  { color: "colorPlywood", opacity: "opacityPlywood", label: "Plywood / carcass" },
  { color: "colorMdf", opacity: "opacityMdf", label: "MDF fronts" },
  { color: "colorBack", opacity: "opacityBack", label: "Back panel" },
  { color: "colorKick", opacity: "opacityKick", label: "Toe kick" },
];

export function SettingsTab({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const [saved, setSaved] = useState(false);
  const [patDepth, setPatDepth] = useState("50");
  const groups = [...new Set(SETTINGS_META.map((m) => m.group))];

  const save = () => {
    setSettings({ ...settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const num = (k: keyof Settings) => (typeof settings[k] === "number" ? (settings[k] as number) : 0);
  const pct = (k: keyof Settings) => Math.round(((settings[k] as number) ?? 1) * 100);

  /* ---- plywood material library ---- */
  const patchPly = (id: string, p: Partial<PlywoodMaterial>) =>
    setSettings({ ...settings, plyMaterials: plyMaterialsOf(settings).map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const addPly = () => {
    const lib = plyMaterialsOf(settings);
    setSettings({
      ...settings,
      plyMaterials: [
        ...lib,
        { id: uid(), name: `Plywood ${lib.length + 1}`, color: lib[0]?.color ?? "#b78a58", opacity: 1 },
      ],
    });
  };
  const removePly = (id: string) => {
    const lib = plyMaterialsOf(settings).filter((m) => m.id !== id);
    if (!lib.length) return;
    const defaultPlyId = settings.defaultPlyId === id ? lib[0].id : settings.defaultPlyId;
    setSettings({ ...settings, plyMaterials: lib, defaultPlyId });
  };

  return (
    <div className="anim-rise max-w-[1100px] space-y-5">
      <div className="card p-5">
        <h2 className="card-h"><Settings2 size={17} className="text-amber-400" /> Settings</h2>
        <p className="hint mt-1">Auto-saved. Every cabinet updates immediately when you change a setting.</p>

        {/* ---- plywood material library ---- */}
        <div className="mt-6 rounded-xl border border-white/[0.07] p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-amber-300/90 mb-1">
            Plywood materials
          </div>
          <p className="hint">
            All {num("bodyThk")}mm plywood — same thickness, different name/color. Pick one per cabinet in Edit Cabinet;
            the <b>Default</b> is used for new cabinets and any drawer boxes / kicks. <b>Solid</b> renders as a flat
            laminated color (e.g. white melamine) · <b>Grain</b> shows the wood-grain texture.
          </p>
          <div className="mt-3 space-y-2">
            {plyMaterialsOf(settings).map((m) => (
              <div key={m.id} className="flex items-center gap-2 flex-wrap rounded-lg border border-white/[0.06] bg-ink-900/50 px-2 py-1.5">
                <label className="flex items-center gap-1.5 text-[11.5px] text-ink-300 cursor-pointer" title="New / unspecified cabinets use this plywood">
                  <input type="radio" className="chk" checked={settings.defaultPlyId === m.id} onChange={() => setSettings({ ...settings, defaultPlyId: m.id })} />
                  Default
                </label>
                <input
                  className="inp !w-[170px] !py-1 !px-2 text-[12px]"
                  value={m.name}
                  onChange={(e) => patchPly(m.id, { name: e.target.value })}
                />
                <input
                  type="color"
                  className="h-6 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                  value={m.color}
                  title="3D render color"
                  onChange={(e) => patchPly(m.id, { color: e.target.value })}
                />
                <span className="flex overflow-hidden rounded-md border border-white/10" title="Solid = flat laminated color · Grain = wood texture">
                  <button
                    type="button"
                    className={`px-2 py-0.5 text-[10.5px] font-medium ${!m.solid ? "bg-amber-400/90 text-ink-950" : "bg-ink-900 text-ink-400 hover:text-ink-200"}`}
                    onClick={() => patchPly(m.id, { solid: false })}
                  >
                    Grain
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 text-[10.5px] font-medium ${m.solid ? "bg-amber-400/90 text-ink-950" : "bg-ink-900 text-ink-400 hover:text-ink-200"}`}
                    onClick={() => patchPly(m.id, { solid: true })}
                  >
                    Solid
                  </button>
                </span>
                {!m.solid && (
                  <span className="flex overflow-hidden rounded-md border border-white/10" title="Wood grain direction in the 3D view">
                    <button
                      type="button"
                      className={`px-2 py-0.5 text-[10.5px] font-medium ${m.grainRot !== 90 ? "bg-cyan-400/90 text-ink-950" : "bg-ink-900 text-ink-400 hover:text-ink-200"}`}
                      onClick={() => patchPly(m.id, { grainRot: 0 })}
                    >
                      0°
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 text-[10.5px] font-medium ${m.grainRot === 90 ? "bg-cyan-400/90 text-ink-950" : "bg-ink-900 text-ink-400 hover:text-ink-200"}`}
                      onClick={() => patchPly(m.id, { grainRot: 90 })}
                    >
                      90°
                    </button>
                  </span>
                )}
                <Num
                  className="!w-[62px] !py-1 !px-2"
                  value={m.opacity * 100}
                  min={5}
                  max={100}
                  step={5}
                  onChange={(v) => patchPly(m.id, { opacity: Math.min(1, Math.max(0.05, v / 100)) })}
                />
                <span className="text-[11px] text-ink-400">% opacity</span>
                {plyMaterialsOf(settings).length > 1 && (
                  <Btn size="sm" variant="danger" className="ml-auto" onClick={() => removePly(m.id)}>
                    <Trash2 size={11} /> Remove
                  </Btn>
                )}
              </div>
            ))}
          </div>
          <Btn size="sm" onClick={addPly} className="mt-2">
            <Plus size={13} /> Add plywood material
          </Btn>
        </div>

        {groups.map((g) => (
          <div key={g} className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-amber-300/90 mb-3">{g}</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {SETTINGS_META.filter((m) => m.group === g).map((m) => (
                <Field key={m.key} label={`${m.label} (${m.unit})`}>
                  <Num value={num(m.key)} onChange={(v) => setSettings({ ...settings, [m.key]: v })} />
                </Field>
              ))}
              {g === "Nesting" && (
                <>
                  <Field label="Grain lock">
                    <label className="flex items-center gap-2 inp !py-2 cursor-pointer text-[13px] text-ink-200">
                      <input type="checkbox" className="chk" checked={settings.grainLock} onChange={(e) => setSettings({ ...settings, grainLock: e.target.checked })} />
                      No rotation
                    </label>
                  </Field>
                  <Field label="Toe kick in nesting">
                    <label className="flex items-center gap-2 inp !py-2 cursor-pointer text-[13px] text-ink-200">
                      <input type="checkbox" className="chk" checked={settings.kickInNesting !== false} onChange={(e) => setSettings({ ...settings, kickInNesting: e.target.checked })} />
                      Include toe kick parts
                    </label>
                  </Field>
                  <Field label="Nesting from">
                    <select className="inp" value={settings.nestFrom} onChange={(e) => setSettings({ ...settings, nestFrom: e.target.value as Settings["nestFrom"] })}>
                      {["bottom left", "top left", "bottom right", "top right"].map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Nesting direction">
                    <select className="inp" value={settings.nestDirection} onChange={(e) => setSettings({ ...settings, nestDirection: e.target.value as Settings["nestDirection"] })}>
                      <option value="X">X (horizontal shelves)</option>
                      <option value="Y">Y (transposed, vertical sheets)</option>
                    </select>
                  </Field>
                  <Field label="MDF sheet size">
                    <select className="inp" value={settings.mdfSheet} onChange={(e) => setSettings({ ...settings, mdfSheet: e.target.value as Settings["mdfSheet"] })}>
                      <option value="3050x1220">3050 × 1220 (long doors fit)</option>
                      <option value="2440x1220">2440 × 1220</option>
                    </select>
                  </Field>
                  <Field label="Banding markers in DXF">
                    <label className="flex items-center gap-2 inp !py-2 cursor-pointer text-[13px] text-ink-200">
                      <input type="checkbox" className="chk" checked={settings.bandMarkers !== false} onChange={(e) => setSettings({ ...settings, bandMarkers: e.target.checked })} />
                      Draw on BANDING layer
                    </label>
                  </Field>
                </>
              )}
              {g === "Drilling" && (
                <Field label={`Drawer slide-hole X pattern — ${patDepth === "kitchen" ? "Kitchen" : patDepth + "cm"} (mm from front)`}>
                  <div className="flex gap-2">
                    <select
                      className="inp !w-[104px] shrink-0"
                      value={patDepth}
                      onChange={(e) => setPatDepth(e.target.value)}
                      title="Slide depth to edit"
                    >
                      {AVAILABLE_DRAWER_DEPTHS.map((d) => (
                        <option key={d} value={d}>{d} cm</option>
                      ))}
                      <option value="kitchen">Kitchen</option>
                    </select>
                    <input
                      className="inp flex-1"
                      value={(settings.slideHolePatterns?.[patDepth] ?? []).join(", ")}
                      onChange={(e) => {
                        const nums = (e.target.value.match(/\d+(\.\d+)?/g) ?? []).map((n) => parseFloat(n));
                        setSettings({
                          ...settings,
                          slideHolePatterns: normalizeSlidePatterns({ ...settings.slideHolePatterns, [patDepth]: nums }),
                        });
                      }}
                      placeholder="39, 71, 167, 231"
                    />
                  </div>
                </Field>
              )}
              {g === "Drilling" && (
                <p className="hint mt-1 text-[12px] bg-white/[0.03] rounded-md px-3 py-2">
                  Hinges: universal 35mm — the Ø35 cup is bored in the DOOR, never in the plywood, and is never exported to DXF.
                  Shelf pins Ø{settings.holeDiameter}mm · slide holes Ø{settings.slideHoleDiameter}mm · linear slot Ø{settings.slotWidth}mm
                  from the front edge.
                </p>
              )}
              {g === "Materials" && (
                <Field label="Default MDF finish (doors & covers)">
                  <div className="flex gap-2">
                    {(["white", "oak"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold capitalize transition-colors ${
                          (settings.mdfFinish ?? "white") === f ? (f === "oak" ? "bg-amber-400 text-ink-950" : "bg-slate-300 text-ink-950") : "bg-ink-900 text-ink-300 hover:text-ink-100"
                        }`}
                        onClick={() => setSettings({ ...settings, mdfFinish: f })}
                      >
                        {f === "oak" ? "Oak (banded)" : "White (no banding)"}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </div>
          </div>
        ))}

        <hr className="sep" />
        <div className="flex gap-2">
          <Btn variant="ok" onClick={save}><Save size={15} /> {saved ? "Saved" : "Save"}</Btn>
          <Btn variant="danger" onClick={() => setSettings({ ...DEFAULT_SETTINGS })}><RotateCcw size={15} /> Reset to defaults</Btn>
        </div>
      </div>

      {/* per-material colour + opacity */}
      <div className="card p-5">
        <h2 className="card-h"><Palette size={17} className="text-amber-400" /> Material colours &amp; opacity</h2>
        <p className="hint mt-1">
          Each material has its own colour and opacity. Lower the opacity of a material to look inside the cabinet.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 mt-5">
          {MATERIALS.map((m) => (
            <div key={m.color} className="rounded-xl border border-white/[0.07] bg-ink-900/60 p-3.5">
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  value={String(settings[m.color])}
                  onChange={(e) => setSettings({ ...settings, [m.color]: e.target.value })}
                  className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink-100">{m.label}</div>
                  <input
                    className="w-full bg-transparent border-0 outline-none font-mono text-[11px] text-ink-400"
                    value={String(settings[m.color])}
                    onChange={(e) => setSettings({ ...settings, [m.color]: e.target.value })}
                  />
                </div>
                <span className="font-mono text-[12px] text-amber-300">{pct(m.opacity)}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={pct(m.opacity)}
                onChange={(e) => setSettings({ ...settings, [m.opacity]: parseInt(e.target.value) / 100 })}
                className="w-full accent-amber-500 cursor-pointer mt-2.5"
              />
              <div className="flex gap-1.5 mt-2">
                {[100, 60, 30].map((p) => (
                  <Btn key={p} size="sm" onClick={() => setSettings({ ...settings, [m.opacity]: p / 100 })}>{p}%</Btn>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <Btn
            size="sm"
            onClick={() => setSettings({ ...settings, opacityPlywood: 1, opacityMdf: 1, opacityBack: 1, opacityKick: 1 })}
          >
            All solid
          </Btn>
          <Btn
            size="sm"
            onClick={() => setSettings({ ...settings, opacityPlywood: 0.35, opacityMdf: 0.25, opacityBack: 0.3, opacityKick: 0.35 })}
          >
            X-ray view
          </Btn>
          <Btn
            size="sm"
            title="Hide the fronts so the interior is visible"
            onClick={() => setSettings({ ...settings, opacityPlywood: 1, opacityMdf: 0.15, opacityBack: 1, opacityKick: 1 })}
          >
            See through fronts
          </Btn>
        </div>

        <div className="mt-4">
          <Field label="Edge banding colour">
            <div className="flex items-center gap-2 inp !py-1.5 max-w-[260px]">
              <input
                type="color"
                value={settings.colorEdge}
                onChange={(e) => setSettings({ ...settings, colorEdge: e.target.value })}
                className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                className="flex-1 bg-transparent border-0 outline-none font-mono text-[12px] text-ink-100"
                value={settings.colorEdge}
                onChange={(e) => setSettings({ ...settings, colorEdge: e.target.value })}
              />
            </div>
          </Field>
        </div>
      </div>

      {/* ---- hanging rail heights (suits / dresses) ---- */}
      <div className="card p-5">
        <h2 className="card-h"><MoveVertical size={17} className="text-amber-400" /> Hanging rail heights</h2>
        <p className="hint mt-1">
          Center height of the rail measured from the <b>section bottom</b> (the row the rail lives in). The rail is hardware — no cut part is generated.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 mt-4">
          <Field label="Suits rail height (mm)">
            <Num className="!w-full" value={settings.railSuitsH} onChange={(v) => setSettings({ ...settings, railSuitsH: Math.max(0, Math.round(v)) })} />
          </Field>
          <Field label="Dresses rail height (mm)">
            <Num className="!w-full" value={settings.railDressesH} onChange={(v) => setSettings({ ...settings, railDressesH: Math.max(0, Math.round(v)) })} />
          </Field>
          <Field label="Double rail — lower (mm)">
            <Num className="!w-full" value={settings.railDouble1} onChange={(v) => setSettings({ ...settings, railDouble1: Math.max(0, Math.round(v)) })} />
          </Field>
          <Field label="Double rail — upper (mm)">
            <Num className="!w-full" value={settings.railDouble2} onChange={(v) => setSettings({ ...settings, railDouble2: Math.max(0, Math.round(v)) })} />
          </Field>
          <Field label="Auto shelves above rail — min gap (mm)">
            <Num className="!w-full" value={settings.railShelfMinGap} onChange={(v) => setSettings({ ...settings, railShelfMinGap: Math.max(50, Math.round(v)) })} />
          </Field>
        </div>
        <p className="hint mt-3">
          AUTO mode (default) fits as many shelves above the rail as possible while keeping EVERY gap — rail → shelf, shelf → shelf and shelf → top — at
          least this value, then spaces them evenly. MANUAL mode in a column's editor sets exact Y positions.
        </p>
      </div>

      {/* ---- glass door appearance ---- */}
      <div className="card p-5">
        <h2 className="card-h"><Sparkles size={17} className="text-amber-400" /> Glass door appearance</h2>
        <p className="hint mt-1">
          Used by the 3D view and 2D front view for Glass / Alu doors (which produce no cut part).
        </p>
        <div className="grid gap-4 sm:grid-cols-3 mt-4">
          <Field label="Glass colour">
            <div className="flex items-center gap-2 inp !py-1.5">
              <input type="color" value={settings.glassColor} onChange={(e) => setSettings({ ...settings, glassColor: e.target.value })} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
              <input className="flex-1 bg-transparent border-0 outline-none font-mono text-[12px] text-ink-100" value={settings.glassColor} onChange={(e) => setSettings({ ...settings, glassColor: e.target.value })} />
            </div>
          </Field>
          <Field label="Glass opacity">
            <Num className="!w-full" value={Math.round(settings.glassOpacity * 100)} min={5} max={100} step={5} onChange={(v) => setSettings({ ...settings, glassOpacity: Math.min(1, Math.max(0.05, v / 100)) })} />
            <span className="text-[11px] text-ink-400">%</span>
          </Field>
          <Field label="Aluminium frame colour">
            <div className="flex items-center gap-2 inp !py-1.5">
              <input type="color" value={settings.frameColor} onChange={(e) => setSettings({ ...settings, frameColor: e.target.value })} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
              <input className="flex-1 bg-transparent border-0 outline-none font-mono text-[12px] text-ink-100" value={settings.frameColor} onChange={(e) => setSettings({ ...settings, frameColor: e.target.value })} />
            </div>
          </Field>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="card-h text-[14px]">📐 Panel size rules</h2>
        <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-300 font-mono">
          <li>• Carcass depth <span className="text-amber-300">D = depth − front thk − back thk</span></li>
          <li>• Side panel L / R <span className="text-amber-300">D × box height</span> (mirrored)</li>
          <li>• Top / Bottom / Row section <span className="text-amber-300">(width − 2×{settings.bodyThk}) × D</span></li>
          <li>• Shelf <span className="text-amber-300">column width − {settings.shelfIncrease} × (D − {settings.shelfFrontSetback})</span></li>
          <li>• Vertical divider <span className="text-amber-300">D × (row height − {settings.dividerDeduct})</span></li>
          <li>• Hidden drawer front <span className="text-amber-300">section width − {settings.hiddenFrontDeduct}</span>, inlaid {settings.hiddenFrontInset}mm</li>
          <li>• Drawer box (standard) <span className="text-amber-300">outer W − 33 − 49</span> · (hidden) <span className="text-amber-300">− 50 more</span></li>
          <li>• Drawer groove <span className="text-amber-300">{settings.grooveWidth}mm × (slider − {settings.grooveShorter}mm), {settings.grooveFromBottom}mm from bottom</span></li>
          <li>• Shelf pins <span className="text-amber-300">Ø{settings.holeDiameter}</span> · slide holes <span className="text-amber-300">Ø{settings.slideHoleDiameter}</span></li>
          <li>• Hanging rail: <span className="text-amber-300">2× Ø{settings.bitDiameter} pilot</span> per rail (one per rail end, at rail center height)</li>
          <li>• Hinge auto: <span className="text-amber-300">≤1000→2 · ≤1500→3 · ≤2000→4 · ≤2400→5 · &gt;2400→6</span> · cups 140mm from top &amp; bottom</li>
          <li>• Cover thickness: <span className="text-amber-300">0 = auto</span> (plywood {settings.bodyThk}mm / MDF {settings.mdfThk}mm)</li>
          <li>• New cabinets: <span className="text-amber-300">600 × 720 × 560</span>, toe kick OFF, MDF fronts OFF</li>
          <li>• Cut list: every piece is <span className="text-amber-300">rotated once (L↔W)</span>, then grain lock applies</li>
        </ul>
      </div>

      <OfflineStoragePanel />
    </div>
  );
}

function OfflineStoragePanel() {
  const [info, setInfo] = useState(() => storageInfo());
  const [backs, setBacks] = useState(() => listBackups(SETTINGS_VERSION));
  const [log, setLog] = useState(() => {
    try {
      return localStorage.getItem("cnc-error-log") || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    const id = setInterval(() => {
      setInfo(storageInfo());
      setBacks(listBackups(SETTINGS_VERSION));
      try {
        setLog(localStorage.getItem("cnc-error-log") || "");
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="card p-5 border-amber-400/20">
      <h2 className="card-h"><HardDrive size={17} className="text-amber-400" /> Offline & Plane Mode — Storage Diagnostics</h2>
      <p className="hint mt-1">100% offline — no CDN, no fonts, no cloud. Works file://, PWA, plane mode. Auto-migration, quota handling, IndexedDB fallback, backup rotation.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-ink-900/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-400">LocalStorage used</div>
          <div className="mt-1 font-mono text-[18px] font-bold text-amber-300">{Math.round(info.used / 1024)} KB</div>
          <div className="text-[11px] text-ink-400">{info.percent}% of ~5MB • {info.count} keys</div>
          <div className="mt-2 h-1.5 rounded-full bg-ink-700 overflow-hidden"><div className={`h-full ${info.percent > 85 ? "bg-red-400" : info.percent > 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(100, info.percent)}%` }} /></div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-ink-900/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-400">Offline mode</div>
          <div className="mt-1 flex items-center gap-2">
            {typeof navigator !== "undefined" && !navigator.onLine ? <WifiOff size={16} className="text-amber-300" /> : <ShieldCheck size={16} className="text-emerald-400" />}
            <span className="font-mono text-[13px] text-ink-100">{location.protocol === "file:" ? "FILE:// SINGLE-FILE" : typeof navigator !== "undefined" && navigator.onLine ? "ONLINE (but offline-ready)" : "OFFLINE / PLANE MODE"}</span>
          </div>
          <div className="text-[11px] text-ink-400 mt-1">SW: {"serviceWorker" in navigator ? (location.protocol === "file:" ? "N/A file:// (single-file works)" : "supported — v2 cache-first") : "not supported"}</div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-ink-900/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-400">Backups (last 5 kept)</div>
          <div className="mt-1 font-mono text-[13px] text-ink-100">{backs.length} backups</div>
          <div className="text-[11px] text-ink-400">Auto every 60s • rotation • IndexedDB fallback</div>
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {backs.slice(0, 3).map((b) => (
              <span key={b.key} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-ink-400">{b.date.slice(0, 19)} {Math.round(b.size / 1024)}KB</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2 flex-wrap">
        <Btn size="sm" onClick={() => { setInfo(storageInfo()); setBacks(listBackups(SETTINGS_VERSION)); }}><HardDrive size={12} /> Refresh</Btn>
        <Btn size="sm" variant="danger" onClick={() => {
          if (!confirm("Clear ALL backups? Current project stays.")) return;
          backs.forEach((b) => { try { localStorage.removeItem(b.key); } catch {} });
          setBacks(listBackups(SETTINGS_VERSION));
        }}><Trash size={12} /> Clear backups</Btn>
        <Btn size="sm" onClick={() => {
          try {
            const data = loadRaw(`cnc-cabinet-designer-pro-v${SETTINGS_VERSION}`);
            if (!data) { alert("No saved project found"); return; }
            const blob = new Blob([data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `cnc-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          } catch {}
        }}><Download size={12} /> Export raw storage</Btn>
        <Btn size="sm" onClick={() => {
          try {
            localStorage.removeItem("cnc-error-log");
            setLog("");
          } catch {}
        }}>Clear error log</Btn>
      </div>

      {log && (
        <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.04] p-3">
          <div className="text-[11px] uppercase tracking-wide text-red-300 mb-1">Error log (last 20KB, plane-mode debug)</div>
          <pre className="max-h-[120px] overflow-auto text-[10px] font-mono text-red-200/80 whitespace-pre-wrap">{log.slice(-3000)}</pre>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-ink-400 leading-relaxed">
        <b className="text-ink-200">Plane mode checklist:</b> No external URLs in build (verified) • Worker inline blob works file:// • Textures procedural canvas • Downloads via Blob+fallback • Hash share links offline • 3D PNG screenshot in localStorage for BOM report • Drag-drop .json works offline • PWA manifest v2 with shortcuts • SW v2 cache-first + navigation fallback • Beforeunload dirty guard • Backup rotation + IndexedDB fallback when quota full.
      </div>
    </div>
  );
}
