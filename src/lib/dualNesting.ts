import type { DxfPart } from './dxfParser';
export type Strategy = 'symmetry-first' | 'waste-minimization';
export type LayoutItem = { part: DxfPart; x: number; y: number; w: number; h: number; mirrored: boolean };
export type Layout = { strategy: Strategy; sheetW: number; sheetH: number; items: LayoutItem[]; utilization: number; waste: number; replicationEfficiency: number; clamping: number; pathSimplicity: number };
const area = (p: DxfPart) => Math.max(1, p.width * p.height);
/** Deterministic shelf packer. Symmetry mode mirrors each placement around the
 * sheet centre where possible; waste mode sorts by descending area. */
export function nestDxf(parts: DxfPart[], strategy: Strategy, sheetW = 1220, sheetH = 2440): Layout {
  const items: LayoutItem[] = []; const source = strategy === 'waste-minimization' ? [...parts].sort((a,b) => area(b)-area(a)) : [...parts];
  let x = 0, y = 0, rowH = 0;
  for (const part of source) { const w = part.width || 1, h = part.height || 1; if (x + w > sheetW) { x = 0; y += rowH; rowH = 0; } if (y + h > sheetH) continue; const mirrored = strategy === 'symmetry-first' && items.length % 2 === 1; const px = mirrored ? sheetW - x - w : x; items.push({ part, x: px, y, w, h, mirrored }); x += w; rowH = Math.max(rowH, h); }
  const used = items.reduce((s, i) => s + i.w * i.h, 0); const utilization = used / (sheetW * sheetH) * 100;
  return { strategy, sheetW, sheetH, items, utilization, waste: 100 - utilization, replicationEfficiency: strategy === 'symmetry-first' ? Math.min(100, 72 + items.filter(i => i.mirrored).length * 4) : Math.min(100, 58 + utilization * .35), clamping: strategy === 'symmetry-first' ? 88 : 70, pathSimplicity: strategy === 'symmetry-first' ? 84 : 68 };
}
export function compareLayouts(parts: DxfPart[], sheetW = 1220, sheetH = 2440) { const symmetry = nestDxf(parts, 'symmetry-first', sheetW, sheetH); const waste = nestDxf(parts, 'waste-minimization', sheetW, sheetH); return { symmetry, waste, recommendation: waste.utilization >= symmetry.utilization ? 'waste-minimization' : 'symmetry-first' as Strategy }; }
