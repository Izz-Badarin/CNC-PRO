/** Lightweight ASCII DXF reader for CNC import. It intentionally preserves the
 * source layer and text metadata while normalising common entities. */
export type DxfEntity = { type: string; layer: string; data: Record<string, string | number>; text?: string };
export type DxfPart = { id: string; layer: string; entities: DxfEntity[]; bounds: { minX: number; minY: number; maxX: number; maxY: number }; width: number; height: number };
const n = (v: string | number | undefined) => Number(v ?? 0);
export function parseDxf(source: string): { entities: DxfEntity[]; layers: string[]; parts: DxfPart[] } {
  const lines = source.replace(/\r/g, "").split("\n").map(x => x.trim());
  const entities: DxfEntity[] = []; const layers = new Set<string>(); let i = 0;
  while (i < lines.length - 1) {
    if (lines[i] !== "0") { i++; continue; } const type = lines[i + 1]; i += 2;
    if (!["LINE","ARC","CIRCLE","LWPOLYLINE","POLYLINE","TEXT","MTEXT","POINT"].includes(type)) continue;
    const data: Record<string, string | number> = {}; let layer = "0";
    while (i < lines.length && lines[i] !== "0") { const code = lines[i++]; const value = lines[i++] ?? ""; const key = `g${code}`; data[key] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value; if (code === "8") layer = value; }
    layers.add(layer); const e: DxfEntity = { type, layer, data }; if (type === "TEXT" || type === "MTEXT") e.text = String(data.g1 ?? ""); entities.push(e);
  }
  const groups = new Map<string, DxfEntity[]>(); entities.forEach(e => { const a = groups.get(e.layer) ?? []; a.push(e); groups.set(e.layer, a); });
  const parts = [...groups].map(([layer, es], ix) => { const xs: number[] = [], ys: number[] = []; es.forEach(e => { [10,11,12,13].forEach(c => { if (e.data[`g${c}`] !== undefined) xs.push(n(e.data[`g${c}`])); }); [20,21,22,23].forEach(c => { if (e.data[`g${c}`] !== undefined) ys.push(n(e.data[`g${c}`])); }); }); const minX = Math.min(0, ...xs), minY = Math.min(0, ...ys), maxX = Math.max(0, ...xs), maxY = Math.max(0, ...ys); return { id: `part-${ix + 1}`, layer, entities: es, bounds: { minX, minY, maxX, maxY }, width: maxX - minX, height: maxY - minY }; });
  return { entities, layers: [...layers], parts };
}
export function readDxfFile(file: File): Promise<ReturnType<typeof parseDxf>> { return file.text().then(parseDxf); }
