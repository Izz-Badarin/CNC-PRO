import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Download, FileOutput, RotateCcw } from "lucide-react";
import type { Cabinet, PanelItem, Settings } from "../types";
import { isCorner } from "../lib/model";
import { Btn, Chip } from "../components/ui";

/* Plan View — top-down footprints, dimension-accurate, draggable. */
const SCALE = 0.12;
const GRID = 5;

/** small controlled mm input for the per-cabinet X / Z (depth) fields */
function PlanPosInput({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-ink-400">{label}</span>
      <input
        className="inp !w-[64px] !py-0.5 !px-1.5 font-mono text-[10.5px]"
        value={txt}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parseFloat(e.target.value);
          if (isFinite(n)) onCommit(n);
        }}
      />
      <span className="text-ink-500">mm</span>
    </span>
  );
}

export function PlanTab({
  cabinets,
  settings,
  setCabinets,
  panels = [],
}: {
  cabinets: Cabinet[];
  settings: Settings;
  setCabinets: (fn: (cs: Cabinet[]) => Cabinet[]) => void;
  panels?: PanelItem[];
}) {
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ id: string; dx: number; dz: number; ox: number; oz: number } | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  void settings;

  const planPos = useMemo(() => {
    let auto = 0;
    return cabinets.map((c) => {
      const x = c.plan ? c.plan.x : c.layout ? c.layout.x : auto;
      auto += c.width + 40;
      return { cab: c, x, z: c.plan ? c.plan.z : 0, w: c.width, d: c.depth };
    });
  }, [cabinets]);

  // raw project panels — standing w × thk footprints (auto-flow after the
  // rightmost cabinet, or manual layout.x), against the front wall (z = 0)
  const panelPlan = useMemo(() => {
    const right = planPos.length ? Math.max(...planPos.map((p) => p.x + p.w)) : 0;
    let cursor = right + 40;
    return panels.map((pn) => {
      const x = pn.layout ? pn.layout.x : cursor;
      if (!pn.layout) cursor += Math.max(60, pn.w) + 40;
      const thk = pn.thk > 0 ? pn.thk : pn.material === "plywood" ? settings.bodyThk : pn.material === "back" ? settings.backThk : settings.mdfThk;
      return { pn, x, z: 0, w: pn.w, d: Math.max(thk, 10), h: pn.h };
    });
  }, [planPos, panels, settings]);

  const commit = (id: string, x: number, z: number) =>
    setCabinets((cs) => cs.map((c) => (c.id === id ? { ...c, plan: { x: Math.round(x), z: Math.round(z) } } : c)));

  const snapX = (x: number, id: string, w: number): number => {
    let best = Math.round(x / GRID) * GRID;
    let bd = Math.abs(best - x);
    planPos.forEach((p) => {
      if (p.cab.id === id) return;
      [p.x, p.x + p.w, p.x - w].forEach((cx) => {
        const dd = Math.abs(cx - x);
        if (dd < bd && dd < 12) { bd = dd; best = cx; }
      });
    });
    return best;
  };
  const snapZ = (z: number, id: string, d: number): number => {
    let best = Math.round(z / GRID) * GRID;
    let bd = Math.abs(best - z);
    planPos.forEach((p) => {
      if (p.cab.id === id) return;
      [p.z, p.z + p.d, p.z - d].forEach((cz) => {
        const dd = Math.abs(cz - z);
        if (dd < bd && dd < 12) { bd = dd; best = cz; }
      });
    });
    return best;
  };

  const onPointerDown = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    setSelId(id);
    const pos = planPos.find((p) => p.cab.id === id);
    if (!pos) return;
    const sx = e.clientX, sy = e.clientY, ox = pos.x, oz = pos.z;
    const live: { cur: { dx: number; dz: number } | null } = { cur: null };
    const move = (ev: PointerEvent) => {
      const dx = snapX(ox + (ev.clientX - sx) / SCALE / zoom, id, pos.w) - ox;
      const dz = snapZ(oz + (ev.clientY - sy) / SCALE / zoom, id, pos.d) - oz;
      live.cur = { dx, dz };
      setDrag({ id, dx, dz, ox, oz });
    };
    const up = () => {
      const d = live.cur;
      if (d) commit(id, ox + d.dx, oz + d.dz);
      setDrag(null);
      wrapRef.current?.removeEventListener("pointermove", move);
      wrapRef.current?.removeEventListener("pointerup", up);
      wrapRef.current?.removeEventListener("pointercancel", up);
};
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    wrapRef.current?.addEventListener("pointermove", move);
    wrapRef.current?.addEventListener("pointerup", up);
    wrapRef.current?.addEventListener("pointercancel", up);
  };
const active = planPos.map((p) => ({
    ...p,
    x: p.cab.id === drag?.id ? drag.ox + drag.dx : p.x,
    z: p.cab.id === drag?.id ? drag.oz + drag.dz : p.z,
  }));

  const maxX = Math.max(5, ...active.map((p) => p.x + p.w), ...panelPlan.map((p) => p.x + p.w)) + 200;
  const minZ = Math.min(0, ...active.map((p) => p.z - 60));
  const maxZ = Math.max(60, ...active.map((p) => p.z + p.d)) + 200;
  const W = maxX * SCALE * zoom;
  const H = (maxZ - minZ) * SCALE * zoom;
  const OFZ = -minZ * SCALE * zoom;
  const esc = (s: string) => s.replace(/[<>&"]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[m]!);

  const exportSvg = () => {
    const body = active.map((p) => {
      const px = p.x * SCALE, py = (p.z - minZ) * SCALE;
      const w = p.w * SCALE, d = p.d * SCALE;
      const rect = `M${px},${py} L${px + w},${py} L${px + w},${py + d} L${px},${py + d} Z`;
      const shape = isCorner(p.cab.type) ? rect + ` M${px},${py} L${px + w},${py + d}` : rect;
      return `<path d="${shape}" fill="none" stroke="#22314a" stroke-width="1.2"/><text x="${px + 6}" y="${py + 16}" font-size="9">${esc(p.cab.name)}</text><text x="${px + 6}" y="${py + 28}" font-size="8">${Math.round(p.w)} x ${Math.round(p.d)}</text>`;
    }).join("");
    const bodyPanels = panelPlan.map((p) => {
      const px = p.x * SCALE, py = (p.z - minZ) * SCALE;
      const w = p.w * SCALE, d = Math.max(p.d * SCALE, 2.5);
      return `<rect x="${px}" y="${py}" width="${w}" height="${d}" fill="none" stroke="#0e7490" stroke-width="1.4" stroke-dasharray="5 3"/><text x="${px + 4}" y="${py - 4}" font-size="8" fill="#0e7490">${esc(p.pn.name)} ${Math.round(p.w)}x${Math.round(p.h)}</text>`;
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><g transform="translate(0,${OFZ}) scale(${SCALE * zoom})">${body}${bodyPanels}</g></svg>`;
    const a = document.createElement("a");
    a.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    a.download = "plan-view.svg";
    a.click();
  };
return (
    <div className="card p-5 anim-rise">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="card-h"><ArrowDownUp size={17} className="text-amber-400" /> Plan View — Top-Down Footprints</h2>
          <p className="hint mt-1">Drag any cabinet to position it · 5 mm grid + edge snap · saved to the project · dimension-accurate.</p>
        </div>
        <div className="flex gap-2">
          <Btn size="sm" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>+</Btn>
          <Btn size="sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>−</Btn>
          <Chip>{(zoom * 100).toFixed(0)}%</Chip>
          <Btn size="sm" onClick={() => setCabinets((cs) => cs.map((c) => ({ ...c, plan: null as null })))} title="Clear all manual plan positions">
            <RotateCcw size={14} /> Reset
          </Btn>
          <Btn size="sm" variant="ok" onClick={exportSvg}>
            <Download size={14} /> Export SVG
          </Btn>
        </div>
      </div>

      <div ref={wrapRef} className="mt-4 overflow-auto rounded-lg border border-white/[0.07] bg-[#0b1220]" style={{ height: "520px" }}>
        <svg width={W} height={H} style={{ display: "block" }} onPointerDown={() => setSelId(null)}>
          {active.map((p) => {
            const px = p.x * SCALE * zoom;
            const py = OFZ + (p.z - minZ) * SCALE * zoom;
            const w = p.w * SCALE * zoom;
            const d = p.d * SCALE * zoom;
            const selected = p.cab.id === selId || p.cab.id === drag?.id;
            const fill = p.cab.type === "wall" || p.cab.type === "cornerWall" ? "#16324a" : "#1d3b57";
            return (
              <g key={p.cab.id} data-pid={p.cab.id} onPointerDown={(e) => { e.stopPropagation(); onPointerDown(p.cab.id, e); }} style={{ cursor: "grab" }}>
                <rect x={px} y={py} width={Math.max(2, w)} height={Math.max(2, d)} rx={2} fill={fill} stroke={selected ? "#f59e0b" : "#3f6c99"} strokeWidth={selected ? 2 : 1.1} />
                {isCorner(p.cab.type) && <line x1={px} y1={py} x2={px + w} y2={py + d} stroke="#f59e0b" strokeWidth={1.4} strokeDasharray="4 2" />}
                <text x={px + 5} y={py + 14} fill={selected ? "#fde68a" : "#c9d7ea"} fontSize={11}>{p.cab.name}</text>
                <text x={px + 5} y={py + 26} fill="#8fa8c8" fontSize={9.5}>
                  {Math.round(p.w)}×{Math.round(p.d)} · h {p.cab.height}
                </text>
                <line x1={px + w / 2 - 12} y1={py} x2={px + w / 2 + 12} y2={py} stroke="#7dd3fc" strokeWidth={1.4} />
              </g>
            );
          })}
          {/* raw project panels — standing w×thk footprints */}
          {panelPlan.map((p) => {
            const px = p.x * SCALE * zoom;
            const py = OFZ + (p.z - minZ) * SCALE * zoom;
            const w = Math.max(2, p.w * SCALE * zoom);
            const d = Math.max(2.5, p.d * SCALE * zoom);
            return (
              <g key={p.pn.id}>
                <rect x={px} y={py} width={w} height={d} rx={1.5} fill="#0b2f3f" stroke="#22d3ee" strokeWidth={1.3} strokeDasharray="5 3" />
                <text x={px + 4} y={py - 5} fill="#22d3ee" fontSize={10}>
                  {p.pn.name}
                </text>
                <text x={px + 4} y={py + 14} fill="#7dd3fc" fontSize={9}>
                  {Math.round(p.w)}×{Math.round(p.h)} (standing)
                </text>
              </g>
            );
          })}
          <g stroke="#22314a" strokeWidth={0.8} fill="none">
            {Array.from({ length: Math.floor(maxX / 250) }).map((_, i) => (
              <line key={i} x1={(i + 1) * 250 * SCALE * zoom} y1={0} x2={(i + 1) * 250 * SCALE * zoom} y2={10} />
            ))}
          </g>
        </svg>
      </div>
      {/* per-cabinet numeric X / Z (depth) inputs — same values as the drag */}
      <div className="mt-3 flex flex-wrap gap-2">
        {planPos.map((p) => (
          <span key={p.cab.id} className="font-mono text-[10.5px] px-2 py-1 rounded bg-ink-900/60 border border-white/[0.06] inline-flex items-center gap-2">
            <span className="text-amber-300">{p.cab.name}</span>
            <PlanPosInput label="X" value={p.x} onCommit={(n) => commit(p.cab.id, n, p.z)} />
            <PlanPosInput label="Z" value={p.z} onCommit={(n) => commit(p.cab.id, p.x, n)} />
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-ink-400">
        <Chip>wall / corner-wall = blue</Chip>
        <Chip tone="amber">base / tall / custom = brown</Chip>
        <Chip tone="cyan">amber outline = selected · cyan tick = front</Chip>
      </div>
      <div className="mt-1 text-[11px] text-ink-500">
        <FileOutput size={12} className="text-ink-400" /> Plan positions are display-only — they never change the cut list, nesting or DXF.
      </div>
    </div>
  );
}