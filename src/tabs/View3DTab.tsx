import { useRef, useState } from "react";
import { Box, Camera, DoorOpen, Layers, Link2, Move3d, RotateCcw, SquareMousePointer } from "lucide-react";
import type { Cabinet, PanelItem, Settings } from "../types";
import { Btn, Empty, Field, Num } from "../components/ui";
import { ThreeCanvas } from "../components/ThreeCanvas";
import { LayerToggles } from "../components/LayerToggles";
import type { CabinetViewer } from "../three/scene";

export function View3DTab({
  cabinets,
  settings,
  setSettings,
  panels = [],
}: {
  cabinets: Cabinet[];
  settings: Settings;
  setSettings?: (s: Settings) => void;
  panels?: PanelItem[];
}) {
  const viewer = useRef<CabinetViewer | null>(null);
  const [spacing, setSpacing] = useState(0);
  const [drawersOpen, setDrawersOpen] = useState(false);
  const [showDims, setShowDims] = useState(false);
  const [room, setRoomOn] = useState(true);
  const [doorPct, setDoorPct] = useState(0); // E2: 0..1

  /* E1/E4 exports — PNG screenshot · GLB · OBJ (all in the current camera view) */
  const saveAs = (url: string, name: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  };
  const shotPng = () => {
    const url = viewer.current?.snapshot();
    if (!url) return;
    try {
      // O needs E1 — save last screenshot for the BOM report (localStorage)
      localStorage.setItem("cnc-last-3d-png", url);
      localStorage.setItem("cnc-last-3d-time", new Date().toISOString());
    } catch {}
    saveAs(url, "cnc-3d-view.png");
  };
  const shotGlb = async () => {
    const blob = await viewer.current?.exportGlb();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    saveAs(url, "cabinets.glb");
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const shotObj = () => {
    const text = viewer.current?.exportObj();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "model/obj" }));
    saveAs(url, "cabinets.obj");
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const [layers, setLayers] = useState<Record<string, boolean>>({});
  const [followLayout, setFollowLayout] = useState(true);
  const [spinId, setSpinId] = useState<string | null>(null);

  const anyLaid = cabinets.some((c) => c.layout);
  // true run footprint when following the 2D arrangement (stacked units count
  // their width once along the wall, not their height)
  const totalRun =
    followLayout && anyLaid
      ? (() => {
          const xs = cabinets.flatMap((c) => (c.layout ? [c.layout.x, c.layout.x + c.width] : []));
          return xs.length ? Math.max(...xs) - Math.min(0, ...xs) : cabinets.reduce((a, c) => a + c.width, 0);
        })()
      : cabinets.reduce((a, c) => a + c.width, 0) + spacing * Math.max(0, cabinets.length - 1);

  if (cabinets.length === 0 && panels.length === 0) {
    return (
      <div className="card p-4 anim-rise">
        <Empty title="Nothing to render" sub="Add cabinets in the Project tab, then return here for the full 360° run." icon={<Move3d size={26} />} />
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_1fr] anim-rise">
      <div className="card p-4 h-fit space-y-4">
        <div>
          <h3 className="card-h text-[14px]"><Move3d size={15} className="text-amber-400" /> View Controls</h3>
        </div>
        <Field label={`Cabinet spacing mm${followLayout && anyLaid ? " (unplaced only)" : ""}`}>
          <Num value={spacing} min={0} max={2000} onChange={(v) => setSpacing(Math.max(0, v))} />
        </Field>
        <div>
          <div className="field-label !mb-2 flex items-center gap-1.5"><Camera size={12} /> Camera</div>
          <div className="grid grid-cols-3 gap-1.5">
            <Btn size="sm" onClick={() => viewer.current?.setView("reset")}><RotateCcw size={13} /> Reset</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("top")}>Top</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("front")}>Front</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("side")}>Side</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("iso")}>Iso</Btn>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] text-ink-300 mb-1">
            <span className="flex items-center gap-1.5"><DoorOpen size={12} /> Door openness <span className="text-ink-500">(hinge pivot)</span></span>
            <span className="font-mono text-amber-300">{Math.round(doorPct * 108)}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(doorPct * 100)}
            onChange={(e) => {
              const f = parseInt(e.target.value) / 100;
              setDoorPct(f);
              viewer.current?.setDoorOpen(f);
            }}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn size="sm" variant={drawersOpen ? "ok" : "default"} onClick={() => setDrawersOpen(!drawersOpen)}>
            <SquareMousePointer size={14} /> Drawers
          </Btn>
          <Btn size="sm" variant={followLayout ? "ok" : "default"} onClick={() => setFollowLayout(!followLayout)}>
            <Link2 size={14} /> Follow 2D
          </Btn>
          <label className="flex items-center gap-2 text-[12px] text-ink-200 cursor-pointer">
            <input type="checkbox" className="chk" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} />
            Dims
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-200 cursor-pointer">
            <input
              type="checkbox"
              className="chk"
              checked={room}
              onChange={(e) => {
                setRoomOn(e.target.checked);
                viewer.current?.setRoom(e.target.checked);
              }}
            />
            Room
          </label>
        </div>
        {setSettings && (
          <div>
            <div className="field-label !mb-2">Material opacity</div>
            <div className="space-y-2">
              {([
                ["opacityPlywood", "Plywood"],
                ["opacityMdf", "MDF"],
                ["opacityBack", "Back"],
                ["opacityKick", "Kick"],
              ] as const).map(([k, label]) => (
                <div key={k}>
                  <div className="flex items-center justify-between text-[11px] text-ink-300">
                    <span>{label}</span>
                    <span className="font-mono text-amber-300">{Math.round(((settings[k] as number) ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round(((settings[k] as number) ?? 1) * 100)}
                    onChange={(e) => setSettings({ ...settings, [k]: parseInt(e.target.value) / 100 })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="field-label !mb-2 flex items-center gap-1.5"><Camera size={12} /> Export view</div>
          <div className="grid grid-cols-3 gap-1.5">
            <Btn size="sm" title="One-click PNG screenshot of the 3D view" onClick={shotPng}><Camera size={13} /> PNG</Btn>
            <Btn size="sm" title="Model as GLB (glTF binary), millimetres" onClick={shotGlb}><Box size={13} /> GLB</Btn>
            <Btn size="sm" title="Model as OBJ, millimetres" onClick={shotObj}><Box size={13} /> OBJ</Btn>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <Btn size="sm" variant="ok" title="Exploded 3D view (per-part) – side L −150 X · side R +150 X · top +120 Y · bottom −40 Y · back −120 Z · door +250 Z (45° open) · drawer +300 Z – saved as cnc-exploded overall and used in Exploded Report" onClick={()=>{
              const url = (viewer.current as any)?.snapshotExploded?.();
              if (!url) return;
              try{
                localStorage.setItem('cnc-exploded-overall', url);
                localStorage.setItem('cnc-last-3d-png', url);
              }catch{}
              const a=document.createElement('a'); a.href=url; a.download='cnc-exploded-3d.png'; a.click();
            }}><Layers size={13} /> Exploded PNG</Btn>
            <Btn size="sm" title="Save per-cab iso + exploded for Exploded Report – each cabinet gets its own PNG (localStorage cnc-cab-iso-* and cnc-exploded-*)" onClick={()=>{
              cabinets.forEach(c=>{
                try{
                  const iso = (viewer.current as any)?.snapshotCabinet?.(c.id);
                  if (iso) localStorage.setItem(`cnc-cab-iso-${c.id}`, iso);
                  const exp = (viewer.current as any)?.snapshotExplodedCabinet?.(c.id);
                  if (exp) localStorage.setItem(`cnc-exploded-${c.id}`, exp);
                }catch{}
              });
              alert(`Saved ${cabinets.length} cabinets – iso + exploded PNGs to localStorage. Now go to BOM → Save Exploded Report.`);
            }}><Box size={13} /> Save All Cab PNGs</Btn>
          </div>
          {cabinets.length>0 && (
            <div className="mt-2 max-h-[200px] overflow-auto rounded border border-white/[0.06] p-1 space-y-1">
              {cabinets.map(c=>(
                <div key={c.id} className="flex items-center justify-between gap-1 text-[10px]">
                  <span className="truncate text-ink-300">{c.name}</span>
                  <span className="flex gap-1">
                    <button
                      className={`px-1.5 py-0.5 rounded ${spinId===c.id ? "bg-amber-700 text-amber-100" : "bg-ink-800 hover:bg-ink-700 text-fuchsia-300"}`}
                      title={`${c.name} — 360° orbit`}
                      onClick={()=>{
                        const next = spinId === c.id ? null : c.id;
                        setSpinId(next);
                        viewer.current?.isolateCabinet(next);
                        viewer.current?.setAutoRotate(!!next);
                      }}
                    >360°</button>
                    <button className="px-1.5 py-0.5 rounded bg-ink-800 hover:bg-ink-700 text-cyan-300" onClick={()=>{
                      const url=(viewer.current as any)?.snapshotCabinet?.(c.id);
                      if(!url) return;
                      try{ localStorage.setItem(`cnc-cab-iso-${c.id}`, url);}catch{}
                      const a=document.createElement('a'); a.href=url; a.download=`${c.name}-iso.png`; a.click();
                    }}>Iso</button>
                    <button className="px-1.5 py-0.5 rounded bg-ink-800 hover:bg-amber-900/40 text-amber-300" onClick={()=>{
                      const url=(viewer.current as any)?.snapshotExplodedCabinet?.(c.id);
                      if(!url) return;
                      try{ localStorage.setItem(`cnc-exploded-${c.id}`, url);}catch{}
                      const a=document.createElement('a'); a.href=url; a.download=`${c.name}-exploded.png`; a.click();
                    }}>Expl</button>
                    <button className="px-1.5 py-0.5 rounded bg-ink-800 hover:bg-emerald-900/50 text-emerald-300" title="Export this cabinet alone as a GLB (millimetres)" onClick={async()=>{
                      const blob = await (viewer.current as any)?.exportGlbCabinet?.(c.id, c.name);
                      if(!blob) return;
                      const url=URL.createObjectURL(blob);
                      const a=document.createElement('a'); a.href=url; a.download=`${c.name.replace(/[^a-z0-9_\-]+/gi,"_")}.glb`; a.click();
                      setTimeout(()=>URL.revokeObjectURL(url), 2000);
                    }}>GLB</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="field-label !mb-2 flex items-center gap-1.5"><Layers size={12} /> Part visibility</div>
          <LayerToggles
            vis={layers}
            onChange={(k, v) => {
              setLayers((s) => ({ ...s, [k]: v }));
              viewer.current?.setLayer(k, v);
            }}
          />
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="card-h text-[14px]">{spinId ? `${cabinets.find((c) => c.id === spinId)?.name ?? "Cabinet"} — 360°` : "All cabinets — 360°"}</h3>
          <span className="font-mono text-[11px] text-ink-400">
            run {totalRun}mm
            <span className={`ml-2 ${followLayout && anyLaid ? "text-cyan-300/90" : "text-ink-500"}`}>
              {followLayout && anyLaid ? "📍 from 2D arrange" : "auto row"}
            </span>
          </span>
        </div>
        <div className="mt-3 h-[calc(100vh-260px)] min-h-[480px] rounded-xl overflow-hidden border border-white/[0.07] bg-[#0a0f18]">
          <ThreeCanvas
            cabinets={cabinets}
            settings={settings}
            spacing={spacing}
            showDims={showDims}
            drawersOpen={drawersOpen}
            followLayout={followLayout}
            panels={panels}
            onReady={(v) => (viewer.current = v)}
          />
        </div>
      </div>
    </div>
  );
}
