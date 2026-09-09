import type { Cabinet } from "../types";

/** Positions in millimetres. Reserve manual placements before auto-flowing
 * remaining cabinets, so they don't hide inside the first placed cabinet. */
export function layout3DCabs(cabs: Cabinet[], followLayout: boolean, spacing = 0) {
  const gap = Number.isFinite(spacing) ? Math.max(0, spacing) : 0;
  const valid = cabs.filter(c => [c.width, c.height, c.depth].every(Number.isFinite));
  const quantity = (c: Cabinet) => Number.isFinite(c.qty) ? Math.max(1, Math.ceil(c.qty || 1)) : 1;
  const laid = (c: Cabinet) => followLayout && !!c.layout && Number.isFinite(c.layout.x) && Number.isFinite(c.layout.y);
  let cursor = 0;
  for (const c of valid) {
    if (laid(c)) cursor = Math.max(cursor, c.layout!.x + quantity(c) * (c.width + gap));
  }
  return valid.flatMap(cab => Array.from({ length: quantity(cab) }, (_, i) => {
    const manual = laid(cab);
    const x = manual ? cab.layout!.x + i * (cab.width + gap) : cursor;
    if (!manual) cursor += cab.width + gap;
    return { cab, x, y: manual ? cab.layout!.y : 0, z: Number.isFinite(cab.plan?.z) ? cab.plan!.z : 0 };
  }));
}
