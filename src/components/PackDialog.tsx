import { useState } from "react";
import { Copy, Layers, Plus, Trash2, X } from "lucide-react";
import type { Cabinet, CabinetType } from "../types";
import { DEFAULT_DIMS, makeCabinet, TYPE_META, uid } from "../lib/defaults";
import { Btn, Chip, Num } from "./ui";

interface PackRow {
  id: string;
  name: string;
  type: CabinetType;
  w: number;
  h: number;
  d: number;
  qty: number;
}

const blank = (type: CabinetType = "custom"): PackRow => ({
  id: uid(),
  name: "",
  type,
  w: DEFAULT_DIMS[0],
  h: DEFAULT_DIMS[1],
  d: DEFAULT_DIMS[2],
  qty: 1,
});

/** Popup table for entering a whole pack of cabinets at once. */
export function PackDialog({
  open,
  onClose,
  onAdd,
  startIndex,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (cabs: Cabinet[]) => void;
  startIndex: number;
}) {
  const [rows, setRows] = useState<PackRow[]>([blank(), blank(), blank()]);

  if (!open) return null;

  const patch = (id: string, p: Partial<PackRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const valid = rows.filter((r) => r.w > 0 && r.h > 0 && r.d > 0 && r.qty > 0);
  const totalUnits = valid.reduce((a, r) => a + Math.round(r.qty), 0);

  const submit = () => {
    let n = startIndex;
    const cabs = valid.map((r) => {
      const nm = r.name.trim() || `${TYPE_META[r.type].label}-${String(++n).padStart(2, "0")}`;
      const c = makeCabinet(r.type, r.w, r.h, r.d, nm);
      c.qty = Math.max(1, Math.round(r.qty));
      return c;
    });
    if (cabs.length) onAdd(cabs);
    setRows([blank(), blank(), blank()]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-[880px] max-h-[88vh] flex flex-col p-5 anim-rise">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="card-h"><Layers size={17} className="text-amber-400" /> Add Pack of Cabinets</h2>
            <p className="hint mt-1">Enter the sizes and quantities — every row becomes a cabinet in the project.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-white/5 hover:text-ink-100">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-auto rounded-xl border border-white/[0.07]">
          <table className="tbl w-full min-w-[760px]">
            <thead className="sticky top-0 bg-ink-900 z-10">
              <tr>
                <th className="w-8">#</th>
                <th>Name (optional)</th>
                <th>Type</th>
                <th className="!text-right w-[92px]">W (mm)</th>
                <th className="!text-right w-[92px]">H (mm)</th>
                <th className="!text-right w-[92px]">D (mm)</th>
                <th className="!text-right w-[76px]">Qty</th>
                <th className="w-[70px]"></th>
              </tr>
            </thead>
            <tbody className="bg-ink-850/60">
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="text-ink-500">{i + 1}</td>
                  <td>
                    <input
                      className="inp !py-1 !px-2 text-[12.5px]"
                      value={r.name}
                      placeholder={`${TYPE_META[r.type].label}-${String(startIndex + i + 1).padStart(2, "0")}`}
                      onChange={(e) => patch(r.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="inp !py-1 !px-2 text-[12.5px] !w-[150px]"
                      value={r.type}
                      onChange={(e) => patch(r.id, { type: e.target.value as CabinetType })}
                    >
                      {Object.entries(TYPE_META).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </td>
                  <td><Num className="!py-1 !px-2 !text-right" value={r.w} onChange={(v) => patch(r.id, { w: v })} /></td>
                  <td><Num className="!py-1 !px-2 !text-right" value={r.h} onChange={(v) => patch(r.id, { h: v })} /></td>
                  <td><Num className="!py-1 !px-2 !text-right" value={r.d} onChange={(v) => patch(r.id, { d: v })} /></td>
                  <td><Num className="!py-1 !px-2 !text-right" value={r.qty} onChange={(v) => patch(r.id, { qty: Math.max(1, Math.round(v)) })} /></td>
                  <td>
                    <div className="flex gap-1">
                      <Btn size="sm" title="Duplicate row" onClick={() => setRows((rs) => {
                        const k = rs.findIndex((x) => x.id === r.id);
                        const copy = { ...r, id: uid(), name: "" };
                        return [...rs.slice(0, k + 1), copy, ...rs.slice(k + 1)];
                      })}>
                        <Copy size={11} />
                      </Btn>
                      <Btn size="sm" variant="danger" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))}>
                        <Trash2 size={11} />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Btn size="sm" onClick={() => setRows((rs) => [...rs, blank(rs.at(-1)?.type ?? "custom")])}>
              <Plus size={13} /> Add row
            </Btn>
            <Btn size="sm" onClick={() => setRows([blank(), blank(), blank()])}>Reset</Btn>
            <Chip tone="amber">{valid.length} lines</Chip>
            <Chip tone="green">{totalUnits} units</Chip>
          </div>
          <div className="flex gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="ok" onClick={submit} disabled={valid.length === 0}>
              <Plus size={15} /> Create {valid.length} cabinet{valid.length === 1 ? "" : "s"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
