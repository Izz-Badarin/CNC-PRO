import { DEFAULT_PLY_ID, DEFAULT_SETTINGS, doorHingeCount, makeCabinet } from "../src/lib/defaults";
import { buildDxf } from "../src/lib/dxf";
import { layoutCabs, panelPositions } from "../src/tabs/View2DTab";
import { frontElevationHtml, frontElevationDxf, frontElevationSvg } from "../src/lib/export";
import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { allParts, bandLengthMm, carcassDepth, doorDims, drillOps, generateCabinetParts, glassDoorRefs, kickH, railShelfYs, stackOn, stackedHeights, totalBandingM, validateCabinet } from "../src/lib/model";
import type { Part } from "../src/types";
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

/* 11 — raw project panels (Add-panel feature) flow into allParts like cabinet parts */
{
  const c = makeCabinet("base", 600, 720, 560, "Pn");
  const parts = allParts(
    [c],
    S,
    {},
    [
      { id: "p1", name: "Oak top", w: 600, h: 560, thk: 0, material: "mdf", finish: "oak", grain: true },
      { id: "p2", name: "Ply piece", w: 400, h: 300, thk: 0, material: "plywood" },
    ],
  );
  const oak = parts.find((p) => p.cabName === "Panel" && p.name === "Oak top");
  const ply = parts.find((p) => p.cabName === "Panel" && p.name === "Ply piece");
  check("panel: oak MDF part exists", !!oak, parts.map((p) => p.name).join(","));
  check("panel: thk 0 → MDF auto 19mm", !!oak && oak.thickness === 19, `${oak?.thickness}`);
  check("panel: oak MDF banded + grain locked", !!oak && !!oak.band.top && !!oak.grain);
  check("panel: ply thk 0 → auto 16.5mm + banded", !!ply && ply.thickness === 16.5 && !!ply.band.left, `${ply?.thickness}`);
  check("panel: allParts has no panels by default", allParts([c], S).every((p) => p.cabName !== "Panel"));
}

/* 12 — hinge rule (E): ≤1000→2 · ≤1500→3 · ≤2000→4 · ≤2400→5 · >2400→6,
   cups 140mm from top & bottom with extras evenly in between */
{
  check("hinges: 900mm → 2", doorHingeCount(900) === 2, `${doorHingeCount(900)}`);
  check("hinges: 1000mm → 2", doorHingeCount(1000) === 2, `${doorHingeCount(1000)}`);
  check("hinges: 1200mm → 3", doorHingeCount(1200) === 3, `${doorHingeCount(1200)}`);
  check("hinges: 2000mm → 4", doorHingeCount(2000) === 4, `${doorHingeCount(2000)}`);
  check("hinges: 2400mm → 5", doorHingeCount(2400) === 5, `${doorHingeCount(2400)}`);
  check("hinges: 2600mm → 6", doorHingeCount(2600) === 6, `${doorHingeCount(2600)}`);
  const c = makeCabinet("tall", 600, 2100, 560, "Hng");
  c.rows = [
    {
      id: "r1",
      h: 2000,
      columns: [
        {
          id: "c1",
          width: 0,
          shelves: 0,
          fixed: false,
          drawers: [],
          door: { type: "single", style: "overlay", swing: "left", material: "mdf", mdfThk: S.mdfThk, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", full: true, hingeCount: 4 },
        },
      ],
    },
  ];
  const door = generateCabinetParts(c, S).find((p) => p.name.startsWith("Door"));
  const cupYs = (door?.holes.filter((h) => h.kind === "hinge").map((h) => Math.round(h.y)) ?? []).sort((a, b) => a - b);
  const dh = door ? Math.max(door.w, door.h) : 0;
  check("cups: 4 hinges → 4 cups", cupYs.length === 4, `${cupYs.length}`);
  check("cups: first at 140 from bottom", cupYs[0] === 140, `${cupYs[0]}`);
  check("cups: last at 140 from top", cupYs.length === 4 && Math.abs(cupYs[3] - (dh - 140)) < 1, `${cupYs[3]} vs ${dh - 140}`);
}

/* 13 — rail bracket pilot holes (A): one Ø4 pilot per rail end at rail-center height */
{
  const c = makeCabinet("tall", 600, 2400, 560, "Rail");
  c.rows = [{ id: "r1", h: 2400, columns: [{ id: "c1", width: 0, shelves: 0, fixed: false, drawers: [], door: null, rail: "suits" as const, railHeight: 1100 }] }];
  const sideHoles = (parts: ReturnType<typeof generateCabinetParts>) =>
    parts.filter((p) => p.name.startsWith("Side panel")).flatMap((p) => p.holes);
  const single = sideHoles(generateCabinetParts(c, S)).filter((h) => h.dia === S.bitDiameter);
  check("rail: 1 rail → 2 pilots at rail center", single.length === 2 && single.every((h) => h.y === 1100), `${single.length} @ ${single.map((h) => h.y)}`);
  c.rows[0].columns[0].rail = "double";
  const dbl = sideHoles(generateCabinetParts(c, S)).filter((h) => h.dia === S.bitDiameter);
  check("rail: double → 4 pilots (2 per rail)", dbl.length === 4, `${dbl.length}`);
  check("rail: pilots at both rail heights", dbl.some((h) => h.y === 1100) && dbl.some((h) => h.y === S.railDouble2), dbl.map((h) => h.y).join(","));
}

/* 14 — cover thickness auto (P): thk 0 → MDF 19 / plywood 16.5 */
{
  const c = makeCabinet("tall", 600, 2000, 560, "CovAuto");
  c.covers = [
    { id: "c1", side: "L", mat: "mdf", w: 560, h: 2000, thk: 0 },
    { id: "c2", side: "T", mat: "plywood", w: 600, h: 560, thk: 0 },
    { id: "c3", side: "R", mat: "mdf", w: 560, h: 2000, thk: 25 },
  ];
  const parts = generateCabinetParts(c, S);
  const mdfCover = parts.find((p) => p.name === "Cover panel Left");
  const plyCover = parts.find((p) => p.name === "Cover panel Top");
  const expCover = parts.find((p) => p.name === "Cover panel Right");
  check("cover: MDF thk 0 → auto 19mm", mdfCover?.thickness === 19, `${mdfCover?.thickness}`);
  check("cover: ply thk 0 → auto 16.5mm", plyCover?.thickness === 16.5, `${plyCover?.thickness}`);
  check("cover: explicit thk wins", expCover?.thickness === 25, `${expCover?.thickness}`);
}

/* 15 — Phase 2: rail shelves auto/manual (D) + door manual height override (F) */
{
  const col = { id: "c1", width: 0, shelves: 0, fixed: false, drawers: [] as import("../src/types").DrawerSpec[], door: null, rail: "suits" as const, railHeight: 1000, railShelf: true };
  const autoYs = railShelfYs(col, S, 2000);
  check("railShelf auto: 1000mm space / 250 gap → 3 shelves", autoYs.length === 3, `${autoYs.length}`);
  check("railShelf auto: every gap ≥ 250", autoYs.every((y, i) => y - (i === 0 ? 1000 : autoYs[i - 1]) >= 249.9), autoYs.map((y) => Math.round(y)).join(","));
  const manYs = railShelfYs({ ...col, railShelfMode: "manual", shelfPositions: [1200, 1600], railShelfCount: 2 }, S, 2000);
  check("railShelf manual: exact Y positions", manYs.length === 2 && manYs[0] === 1200 && manYs[1] === 1600, manYs.map((y) => Math.round(y)).join(","));
  const baseDoor = { type: "single" as const, style: "overlay" as const, swing: "left" as const, material: "mdf" as const, mdfThk: 19, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center" as const };
  const d1 = doorDims(600, 1000, baseDoor, S);
  const d2 = doorDims(600, 1000, { ...baseDoor, hOverride: 800 }, S);
  check("doorDims: auto height from section", Math.abs(d1.h - (1000 - 2 * S.doorGap)) < 0.01, `${d1.h}`);
  check("doorDims: manual H override wins, width untouched", d2.h === 800 && d2.w === d1.w, `${d2.h}/${d2.w}`);
}

/* 16 — Phase 3: glass-door reference holes (H) — dashed, not drilled */
{
  const c = makeCabinet("tall", 600, 1000, 560, "Glass");
  c.rows[0].columns[0].door = {
    type: "single",
    style: "overlay",
    swing: "right",
    material: "glass",
    mdfThk: S.mdfThk,
    hingeBrand: "Universal 35mm",
    hasHandle: false,
    handlePos: "center",
  };
  check("glass door: no cut part in allParts", allParts([c], S).every((p) => p.material !== "glass"));
  const refs = glassDoorRefs([c], S);
  check("glass ref: exactly one reference part", refs.length === 1, `${refs.length}`);
  const r0 = refs[0];
  check("glass ref: flagged reference:true", r0?.reference === true);
  check("glass ref: 2 cups for a 614mm leaf", r0?.holes.length === 2, `${r0?.holes.length}`);
  const dw = r0?.w ?? 0;
  check("glass ref: Ø35 cups on the hinged (right) edge", r0?.holes.every((h) => h.dia === S.hingeCupDiameter && Math.abs(h.x - (dw - S.hingeCupEdge)) < 0.01), r0?.holes.map((h) => `${h.x}`).join(","));
  check("glass ref: cups at 140 / dh-140", Math.abs(r0?.holes[0]?.y - 140) < 0.01 && Math.abs((r0?.holes[1]?.y ?? 0) - (r0?.h - 140)) < 0.01, r0?.holes.map((h) => h.y).join(","));
}

/* 17 — Phase 4: DXF keeps the default plywood group (J) + glass reference text (H) */
{
  const c = makeCabinet("tall", 600, 1000, 560, "Dxf");
  c.rows[0].columns[0].door = {
    type: "single",
    style: "overlay",
    swing: "left",
    material: "glass",
    mdfThk: S.mdfThk,
    hingeBrand: "Universal 35mm",
    hasHandle: false,
    handlePos: "center",
  };
  const panel: import("../src/types").PanelItem = { id: "p1", name: "RawPanel", w: 400, h: 300, thk: 0, material: "plywood" };
  const dxfDef = buildDxf([c], S, "plywood", true, {}, DEFAULT_PLY_ID, [panel]);
  check("dxf J: default-matId panel kept in the DEFAULT plywood export", dxfDef.includes("RawPanel"));
  check("dxf H: GLASS DOOR REF label text present", dxfDef.includes("GLASS DOOR REF"));
  check("dxf H: NOT DRILLED marker present", dxfDef.includes("NOT DRILLED"));
  check("dxf: Ø35 cup CIRCLEs still excluded", !/0\nCIRCLE\n8\nHINGE_HOLES/.test(dxfDef));
}

/* 18 — Phase 5: bend length = total banded-edge length (I) */
{
  const parts = generateCabinetParts(makeCabinet("tall", 600, 1000, 560, "Bend"), S);
  const side = parts.find((p) => p.name === "Side panel L");
  check("bend: side panel banded on one edge = its length", side ? Math.abs(bandLengthMm(side) - side.h) < 0.01 : false, side ? `${bandLengthMm(side)} vs ${side.h}` : "no side");
  const shelf = parts.find((p) => p.name.startsWith("Shelf"));
  check("bend: shelf front edge = its width", shelf ? Math.abs(bandLengthMm(shelf) - shelf.w) < 0.01 : false, shelf ? `${bandLengthMm(shelf)}` : "no shelf");
  const all4 = side ? ({ ...side, band: { top: true, bottom: true, left: true, right: true } } as Part) : null;
  check("bend: 4 edges = 2w + 2h", all4 ? bandLengthMm(all4) === 2 * all4.w + 2 * all4.h : false);
}

/* 19 — C3: front-view drag persistence — manual layout wins, others reflow (plan drag uses the same commit path) */
{
  const a = makeCabinet("base", 600, 720, 560, "A");
  const b = makeCabinet("base", 600, 720, 560, "B");
  const pos = layoutCabs([a, b]);
  check("front: auto-flow side by side", pos[1].x === 604 && pos[1].y === 0, `${pos[1].x},${pos[1].y}`);
  const b2 = { ...b, layout: { x: 1000, y: 400 } };
  const pos2 = layoutCabs([a, b2]);
  const pa = pos2.find((p) => p.cab.id === a.id)!;
  const pb = pos2.find((p) => p.cab.id === b2.id)!;
  check("front: manual layout wins (dragged cabinet)", pb.x === 1000 && pb.y === 400, `${pb.x},${pb.y}`);
  check("front: unplaced cabinets reflow after the placed one", pa.x === 1604 && pa.y === 0, `${pa.x},${pa.y}`);
  // panels auto-flow after the rightmost cabinet; manual layout wins
  const pp = panelPositions([a, b2], [
    { id: "p1", name: "P1", w: 200, h: 300, thk: 0, material: "mdf" },
    { id: "p2", name: "P2", w: 150, h: 250, thk: 0, material: "mdf", layout: { x: 50, y: 0 } },
  ]);
  check("panels: manual layout first, auto after rightmost", pp[1].x === 50 && pp[0].x === 2244, `${pp[0].x},${pp[1].x}`);
}

/* 20 — D2: dimensioned front elevation export (print/HTML + DXF) */
{
  const a = makeCabinet("base", 600, 720, 560, "A");
  const b = makeCabinet("base", 600, 720, 560, "B");
  const html = frontElevationHtml([a, b]);
  check("elev html: title + mm note", html.includes("Front Elevation — Dimensioned") && html.includes("dimensions in mm"));
  check("elev html: overall width dimension", html.includes(">1204<"));
  check("elev html: chain segments (600 / 4-gap / 600)", html.includes(">600<") && html.includes(">4<"));
  const dxf = frontElevationDxf([a, b]);
  check("elev dxf: 4 layers", ["FLOOR", "ELEVATION", "DIMENSION", "LABEL"].every((l) => dxf.includes(`\n2\n${l}\n`)));
  check("elev dxf: overall text", dxf.includes("1204 OVERALL"));
  check("elev dxf: INSUNITS mm", dxf.includes("$INSUNITS\n70\n4"));
  check("elev dxf: ends with EOF", dxf.trimEnd().endsWith("EOF"));
  const svg = frontElevationSvg([a]);
  check("elev svg: per-cabinet W/H labels", svg.includes(">600<") && svg.includes(">720<"));
  check("elev svg: empty project → empty string", frontElevationSvg([]) === "");
}

/* 21 — E4: OBJ export math — flat clones with baked world matrices under a ×1000 root = millimetres */
{
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); // 1 metre cube
  box.position.set(0.5, 0.5, 0.5);
  box.updateMatrixWorld(true);
  const g = new THREE.Group();
  g.name = "cabinets_mm";
  g.scale.setScalar(1000);
  const c = box.clone();
  c.matrixAutoUpdate = false;
  c.matrix.copy(box.matrixWorld);
  g.add(c);
  g.updateWorldMatrix(true, true);
  const obj = new OBJExporter().parse(g);
  const vs = obj.split("\n").filter((l: string) => l.startsWith("v "));
  const xs = vs.map((l: string) => parseFloat(l.split(" ")[1]));
  const ys = vs.map((l: string) => parseFloat(l.split(" ")[2]));
  check("obj: 24 vertices (8 corners x 3 faces, no dedup)", vs.length === 24, `${vs.length}`);
  check("obj: 1m cube exports as 1000mm", Math.max(...xs) === 1000 && Math.max(...ys) === 1000, `x${Math.max(...xs)} y${Math.max(...ys)}`);
  check("obj: floor corner at origin", xs.includes(0) && ys.includes(0));
}

if (failures) {
  console.log(`\n${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nAll tests passed.");
}