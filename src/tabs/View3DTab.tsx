import { useRef, useState } from "react";
import { Camera, DoorClosed, DoorOpen, Download, Layers, Link2, Maximize2, Move3d, RotateCcw, SquareMousePointer } from "lucide-react";
import type { Cabinet, PanelItem, Settings } from "../types";
import { Btn, Empty, Field, Num } from "../components/ui";
import { ThreeCanvas } from "../components/ThreeCanvas";
import { LayerToggles } from "../components/LayerToggles";
import type { CabinetViewer, ViewStyle } from "../three/scene";

const STYLE_BTN: { id: ViewStyle; label: string; hint: string }[] = [
  { id: "realistic", label: "Realistic", hint: "Textured boards, soft shadows" },
  { id: "technical", label: "Technical", hint: "Panel outlines + grid" },
  { id: "blueprint", label: "Blueprint", hint: "Cyan x-ray line drawing" },
];

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
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [drawersOpen, setDrawersOpen] = useState(false);
  const [showDims, setShowDims] = useState(false);
  const [layers, setLayers] = useState<Record<string, boolean>>({});
  const [followLayout, setFollowLayout] = useState(true);
  const [viewStyle, setViewStyle] = useState<ViewStyle>("technical");
  const [showEdges, setShowEdges] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showRoom, setShowRoom] = useState(false);
  const [framing, setFraming] = useState(1);

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

  if (cabinets.length === 0) {
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
            <Btn size="sm" onClick={() => viewer.current?.setView("fit")}><Maximize2 size={13} /> Fit</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("reset")}><RotateCcw size={13} /> Reset</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("iso")}>Iso</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("front")}>Front</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("side")}>Side</Btn>
            <Btn size="sm" onClick={() => viewer.current?.setView("top")}>Top</Btn>
          </div>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px] text-ink-300">
              <span>Zoom</span>
              <span className="font-mono text-amber-300">{Math.round(framing * 100)}%</span>
            </div>
            <input
              type="range"
              min={40}
              max={220}
              step={5}
              value={Math.round(framing * 100)}
              onChange={(e) => setFraming(parseInt(e.target.value) / 100)}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-ink-500">
            The whole run is framed automatically — drag to orbit, hit <b className="text-ink-300">Fit</b> to re-frame,
            or pull <b className="text-ink-300">Zoom</b> back for a wider shot.
          </p>
        </div>
        <div>
          <div className="field-label !mb-2">Display style</div>
          <div className="grid grid-cols-3 gap-1.5">
            {STYLE_BTN.map((s) => (
              <Btn key={s.id} size="sm" title={s.hint} variant={viewStyle === s.id ? "ok" : "default"} onClick={() => setViewStyle(s.id)}>
                {s.label}
              </Btn>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            <label className="flex items-center gap-2 text-[12px] text-ink-200 cursor-pointer">
              <input type="checkbox" className="chk" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} />
              Dims
            </label>
            <label className="flex items-center gap-2 text-[12px] text-ink-200 cursor-pointer">
              <input type="checkbox" className="chk" checked={showEdges} onChange={(e) => setShowEdges(e.target.checked)} />
              Edges
            </label>
            <label className="flex items-center gap-2 text-[12px] text-ink-200 cursor-pointer">
              <input type="checkbox" className="chk" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
              Labels
            </label>
            <label className="flex items-center gap-2 text-[12px] text-ink-200 cursor-pointer">
              <input type="checkbox" className="chk" checked={showRoom} onChange={(e) => setShowRoom(e.target.checked)} />
              Room
            </label>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn size="sm" variant={doorsOpen ? "ok" : "default"} onClick={() => setDoorsOpen(!doorsOpen)}>
            {doorsOpen ? <DoorOpen size={14} /> : <DoorClosed size={14} />} Doors
          </Btn>
          <Btn size="sm" variant={drawersOpen ? "ok" : "default"} onClick={() => setDrawersOpen(!drawersOpen)}>
            <SquareMousePointer size={14} /> Drawers
          </Btn>
          <Btn size="sm" variant={followLayout ? "ok" : "default"} onClick={() => setFollowLayout(!followLayout)}>
            <Link2 size={14} /> Follow 2D
          </Btn>
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
          <div className="flex items-center gap-2">
            <Btn
              size="sm"
              onClick={() => {
                const url = viewer.current?.snapshot();
                if (!url) return;
                const a = document.createElement("a");
                a.href = url;
                a.download = "cnc-3d-view.png";
                a.click();
              }}
            >
              <Download size={13} /> Save PNG
            </Btn>
            <span className="font-mono text-[11px] text-ink-400">
              run {totalRun}mm
              <span className={`ml-2 ${followLayout && anyLaid ? "text-cyan-300/90" : "text-ink-500"}`}>
                {followLayout && anyLaid ? "📍 from 2D arrange" : "auto row"}
              </span>
            </span>
          </div>
        </div>
        <div className="mt-3 h-[calc(100vh-260px)] min-h-[480px] rounded-xl overflow-hidden border border-white/[0.07] bg-[#0a0f18]">
          <ThreeCanvas
            cabinets={cabinets}
            settings={settings}
            spacing={spacing}
            showDims={showDims}
            doorsOpen={doorsOpen}
            drawersOpen={drawersOpen}
            followLayout={followLayout}
            panels={panels}
            viewStyle={viewStyle}
            showEdges={showEdges}
            showLabels={showLabels}
            showRoom={showRoom}
            framing={framing}
            onReady={(v) => (viewer.current = v)}
          />
        </div>
      </div>
    </div>
  );
}
