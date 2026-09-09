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
          <h3 className="card-h text-[14px]">All cabinets — 360°</h3>
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
