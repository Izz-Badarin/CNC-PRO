import type { Cabinet, PanelItem } from "../types";

/* 2D arrangement math — shared by the front-view renderer, its drag
 * hit-testing, the dimensioned elevation export and the geometry tests.
 * Pure functions only (no React). */

export interface CabPos {
  cab: Cabinet;
  x: number; // mm along the wall (left edge)
  y: number; // mm lift above the floor (cabinet floor line, incl. its kick)
}

/**
 * Assign every cabinet a position. If ANY cabinet has a manual `layout`, all
 * cabinets get a spot: manual layouts win, the rest auto-flow in a ground row
 * after the rightmost placed cabinet. Otherwise the whole set auto-flows one
 * side-by-side row (the historical behavior).
 */
export function layoutCabs(cabs: Cabinet[]): CabPos[] {
  const anyLayout = cabs.some((c) => c.layout);
  if (!anyLayout) {
    let x = 0;
    return cabs.map((cab) => {
      const p: CabPos = { cab, x, y: 0 };
      x += cab.width + 4;
      return p;
    });
  }
  const out: CabPos[] = [];
  cabs.filter((c) => c.layout).forEach((c) => out.push({ cab: c, x: c.layout!.x, y: c.layout!.y }));
  const minX = out.length ? Math.min(...out.map((p) => p.x)) : 0;
  let cursor = out.length ? Math.max(...out.map((p) => p.x + p.cab.width)) + 4 : 0;
  cabs.filter((c) => !c.layout).forEach((cab) => {
    out.push({ cab, x: Math.max(cursor, minX), y: 0 });
    cursor += cab.width + 4;
  });
  return out;
}

/**
 * Front-view positions for raw project panels: a manual `layout` wins;
 * otherwise the panels auto-flow on the floor row AFTER the rightmost
 * cabinet (display only — cut list / nesting / DXF are unaffected).
 */
export function panelPositions(cabs: Cabinet[], panels: PanelItem[]) {
  const pos = layoutCabs(cabs);
  const right = pos.length ? Math.max(...pos.map((p) => p.x + p.cab.width)) : 0;
  let cursor = right + 40;
  return panels.map((pn) => {
    if (pn.layout) return { pn, x: pn.layout.x, y: pn.layout.y ?? 0 };
    const out = { pn, x: cursor, y: 0 };
    cursor += Math.max(60, pn.w) + 30;
    return out;
  });
}
