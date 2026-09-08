import { DEFAULT_SETTINGS, makeCabinet } from "../src/lib/defaults";
import { allParts, carcassDepth, drillOps, kickH, stackOn, stackedHeights, totalBandingM, validateCabinet } from "../src/lib/model";
import { nestParts, layoutIsValid, sheetDimsFor } from "../src/lib/nesting";
import type { Settings } from "../src/types";

/* Geometry-engine regression suite — run with `npm test`. */

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) console.log("  PASS  " + label);
  else {
    failures++;
    console.log("  FAIL  " + label + (detail ? " — " + detail : ""));
  }
};

const S: Settings = { ...DEFAULT_SETTINGS };

/* 1 — toe kick: sides = carcass depth − kickDepth, front = width − 2×thk */
{
  const c = makeCabinet("base", 600, 720, 600, "KickTest");
  c.hasToeKick = true;
  const parts = allParts([c], S);
  const kick = parts.filter((p) => p.name.includes("Toe kick"));
  const front = kick.find((p) => p.name.includes("front"));
  const side = kick.find((p) => p.name.includes("side"));
  check("kick exists on base unit", kick.length >= 2, `${kick.length}`);
  check("kick height = setting", !!front && Math.min(front.w, front.h) === S.kickHeight, `${front?.w}×${front?.h}`);
  check("kick front w = 600−2×16.5", !!front && Math.max(front.w, front.h) === 567, `${front?.w}×${front?.h}`);
  check("kick side w = carcassDepth−50", !!side && Math.min(side.w, side.h) === S.kickHeight && Math.max(side.w, side.h) === Math.round(carcassDepth(c, S)) - S.kickDepth, `${side?.w}×${side?.h} (carcass=${Math.round(carcassDepth(c, S))})`);
  check("no kick on wall unit", allParts([makeCabinet("wall", 800, 720, 350, "W")], S).every((p) => !p.name.includes("Toe kick")));
  check("kickH helper", kickH(c, S) === S.kickHeight && kickH(makeCabinet("wall", 800, 720, 350, "W"), S) === 0);
}

/* 2 — stacked boxes: 2 boxes = 4 sides + 2 tops + 2 bottoms + 2 backs */
{
  const c = makeCabinet("tall", 720, 2800, 600, "Wardrobe");
  c.hasToeKick = true;
  c.stack = [2000, 800];
  c.rows = [
    { id: "r1", h: 1900, box: 0, columns: [] },
    { id: "r2", h: 800, box: 1, columns: [] },
  ];
  const parts = allParts([c], S);
  const named = (n: string) => parts.filter((p) => p.name.toLowerCase().includes(n.toLowerCase()) && !p.name.toLowerCase().includes("kick"));
  check("stacked: 4 side panels", named("Side").length === 4, `${named("Side").length}`);
  check("stacked: 2 tops", named("Top").length === 2, `${named("Top").length}`);
  check("stacked: 2 bottoms", named("Bottom").length === 2, `${named("Bottom").length}`);
  check("stacked: 2 backs", named("Back").length === 2, `${named("Back").length}`);
  check("stacked: no validation errors", validateCabinet(c, S).filter((v) => v.level === "err").length === 0);
  check("stackedHeights", JSON.stringify(stackedHeights(c)) === "[2000,800]");
  check("stackOn", stackOn(c) === true);
}

/* 3 — slide-hole pattern: 35cm drawer → 4 holes per side panel, within bounds */
{
  const c = makeCabinet("base", 600, 720, 560, "Drw");
  const z = c.rows[0].columns[0];
  z.drawers = [{ id: "d1", hidden: false, frontHeight: 220, slideDepthCm: 35, frontMdf: true }];
  z.door = null;
  const ops = drillOps([c], S).filter((o) => o.type === "slide");
  const per = S.slideHolePatterns["35"].length;
  check("slide holes = pattern × 2 side panels", ops.length === per * 2, `${ops.length} vs ${per * 2}`);
  // every hole must be inside the side panel bounds (rotation-safe check)
  const sides = allParts([c], S).filter((p) => p.name.toLowerCase().includes("side"));
  const inside = ops.every((o) => sides.some((sp) => o.x >= 0 && o.y >= 0 && o.x <= Math.max(sp.w, sp.h) && o.y <= Math.max(sp.w, sp.h)));
  check("slide holes within panel bounds", inside);
}

/* 4 — shelf pins: 2 shelves → 24 pins (2 shelves × 2 sides × 3 per row × 2) */
{
  const c = makeCabinet("base", 600, 720, 560, "Shf");
  const z = c.rows[0].columns[0];
  z.shelves = 2;
  z.drawers = [];
  const ops = drillOps([c], S).filter((o) => o.type === "shelf");
  const per = 2 * 2 * Math.max(1, Math.round(S.shelfHolesPerSide)) * 2;
  check("shelf pins count", ops.length === per, `${ops.length} vs ${per}`);
}

/* 5 — manual shelf Y: holes land at the given Y */
{
  const c = makeCabinet("base", 600, 720, 560, "ManY");
  const z = c.rows[0].columns[0];
  z.shelves = 1;
  z.drawers = [];
  z.shelfMode = "manual";
  z.shelfPositions = [240];
  const ops = drillOps([c], S).filter((o) => o.type === "shelf");
  // side panels are rotated in the cut list (rotPoint swaps x/y), so the shelf's
  // original Y can appear as either the op's x or y — check both.
  const coords = [...ops.map((o) => Math.round(o.x)), ...ops.map((o) => Math.round(o.y))];
  check("manual shelf Y places pins at 240", coords.includes(240), coords.join(","));
}

/* 6 — banding totals: > 0 for a base cabinet */
{
  const c = makeCabinet("base", 600, 720, 560, "Band");
  const m = totalBandingM([c], S);
  check("banding > 0", m > 0, `${m.toFixed(1)}m`);
}

/* 7 — nesting: MDF uses 3050 sheet, plywood 2440; layouts valid */
{
  const S3050: Settings = { ...S, mdfSheet: "3050x1220" };
  check("mdf sheet 3050×1220", sheetDimsFor("mdf", S3050).w === 3050 && sheetDimsFor("mdf", S3050).h === 1220);
  check("plywood sheet 2440×1220", sheetDimsFor("plywood", S).w === 2440 && sheetDimsFor("plywood", S).h === 1220);
  const c = makeCabinet("tall", 720, 2500, 600, "NestMdf");
  c.hasFronts = true;
  const g = nestParts(allParts([c], S3050), S3050);
  const mdfG = g.find((x) => x.material === "mdf");
  check("long MDF door nests on 3050 sheet", !mdfG || mdfG.sheets.every((s) => s.sheetW === 3050), `sheets=${mdfG?.sheets.length}`);
  if (mdfG) {
    const dims = sheetDimsFor("mdf", S3050);
    const ok = mdfG.sheets.every((s) => layoutIsValid([s], dims.w - 2 * S.sheetMargin, dims.h - 2 * S.sheetMargin));
    check("all MDF sheets overlap-free", ok);
  }
}

/* 8 — cover panels are real parts */
{
  const c = makeCabinet("tall", 720, 2000, 600, "Cov");
  c.covers = [{ id: "c1", side: "L", mat: "mdf" }];
  const parts = allParts([c], S);
  const cover = parts.find((p) => p.name.includes("Cover") || p.name.includes("cover"));
  check("cover panel becomes a part", !!cover, parts.map((p) => p.name).slice(0, 6).join(","));
}

/* 9 — full-height door on stacked boxes yields ONE MDF door */
{
  const c = makeCabinet("tall", 720, 2800, 600, "FullDoor");
  c.hasToeKick = true;
  c.stack = [2000, 800];
  c.hasFronts = true;
  c.rows = [
    {
      id: "r1",
      h: 1900,
      box: 0,
      columns: [
        { id: "c1", width: 720, shelves: 0, drawers: [], door: { type: "single", overlay: "semi", material: "mdf", mdfThk: 18, hingeBrand: "Blum Clip Top", hasHandle: true, handlePos: "center", full: true } },
      ],
    },
    { id: "r2", h: 800, box: 1, columns: [] },
  ];
  const doors = allParts([c], S).filter((p) => p.name.startsWith("Door"));
  check("exactly one full-height door", doors.length === 1, `${doors.length}`);
  if (doors[0]) check("door spans full height", Math.max(doors[0].w, doors[0].h) > 2690, `${doors[0].w}×${doors[0].h}`);
}

/* 10 — universal 35mm hinge: Ø35 cups bored ONLY in the DOOR — the plywood
   side panels carry ZERO hinge holes, and door cups are never exported to DXF */
{
  const c = makeCabinet("base", 600, 720, 560, "Hinge");
  const z = c.rows[0].columns[0];
  z.drawers = [];
  z.door = { type: "single", overlay: "semi", material: "mdf", mdfThk: 18, hingeBrand: "Blum Clip Top", hasHandle: true, handlePos: "center", full: false };
  const parts = allParts([c], S);
  const door = parts.find((p) => p.name.startsWith("Door"));
  const cups = door ? door.holes.filter((h) => h.kind === "hinge") : [];
  check("door has 2× Ø35 hinge cups (auto)", cups.length === 2 && cups.every((h) => h.dia === 35), `${cups.length} cups`);
  const sideCups = parts.filter((p) => p.name.toLowerCase().includes("side")).flatMap((p) => p.holes.filter((h) => h.kind === "hinge"));
  check("plywood side panels have ZERO hinge holes", sideCups.length === 0, `${sideCups.length}`);
  // hinge-count override is respected on the door
  z.door = { ...z.door!, hingeCount: 4 };
  const parts4 = allParts([c], S);
  const door4 = parts4.find((p) => p.name.startsWith("Door"));
  check("hinge-count override → 4 cups", (door4?.holes.filter((h) => h.kind === "hinge").length ?? 0) === 4, `${door4?.holes.filter((h) => h.kind === "hinge").length}`);
}

if (failures) {
  console.log(`\n${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nAll tests passed.");
}