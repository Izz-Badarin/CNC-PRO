import { modelBounds } from "../src/three/bounds";
import { layout3DCabs } from "../src/lib/layout3d";
import { DEFAULT_PLY_ID, DEFAULT_SETTINGS, doorHingeCount, makeCabinet } from "../src/lib/defaults";
import { buildDxf, buildDxfForSheet } from "../src/lib/dxf";
import { layoutCabs, overlapBoxes, panelPositions } from "../src/tabs/View2DTab";
import { bomReportHtml, frontElevationHtml, frontElevationDxf, frontElevationSvg, projectJson, readProjectFile } from "../src/lib/export";
import { explodedReportHtml } from "../src/lib/explodedReport";
import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { allParts, bandLengthMm, carcassDepth, doorDims, drillOps, fullDoorAutoDims, generateCabinetParts, glassDoorRefs, kickH, railShelfYs, stackOn, stackedHeights, totalBandingM, validateCabinet } from "../src/lib/model";
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
  // new bands (replaces the old ≤1000→2 … >2400→6 rule): <900→2 · 900-1799→3 · 1800-2399→4 · 2400-2999→5 · ≥3000→6
  check("hinges: 899mm → 2", doorHingeCount(899) === 2, `${doorHingeCount(899)}`);
  check("hinges: 900mm → 3 (was 2)", doorHingeCount(900) === 3, `${doorHingeCount(900)}`);
  check("hinges: 1000mm → 3 (was 2)", doorHingeCount(1000) === 3, `${doorHingeCount(1000)}`);
  check("hinges: 1200mm → 3", doorHingeCount(1200) === 3, `${doorHingeCount(1200)}`);
  check("hinges: 1799mm → 3", doorHingeCount(1799) === 3, `${doorHingeCount(1799)}`);
  check("hinges: 1800mm → 4", doorHingeCount(1800) === 4, `${doorHingeCount(1800)}`);
  check("hinges: 2000mm → 4", doorHingeCount(2000) === 4, `${doorHingeCount(2000)}`);
  check("hinges: 2399mm → 4", doorHingeCount(2399) === 4, `${doorHingeCount(2399)}`);
  check("hinges: 2400mm → 5", doorHingeCount(2400) === 5, `${doorHingeCount(2400)}`);
  check("hinges: 2600mm → 5 (was 6)", doorHingeCount(2600) === 5, `${doorHingeCount(2600)}`);
  check("hinges: 2999mm → 5", doorHingeCount(2999) === 5, `${doorHingeCount(2999)}`);
  check("hinges: 3000mm → 6", doorHingeCount(3000) === 6, `${doorHingeCount(3000)}`);
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
  check("dxf: no GLASS DOOR REF (BOM only)", !dxfDef.includes("GLASS DOOR") && !dxfDef.includes("NOT DRILLED"));
  check("dxf: Ø35 cup CIRCLEs still excluded", !/0\nCIRCLE\n8\nHINGE_HOLES/.test(dxfDef));
  // strict AutoCAD R12: only core R12 entities, explicit $ACADVER AC1009,
  // banding arrows as closed LINE triangles (LWPOLYLINE does not exist in R12)
  const dxfTypes = new Set<string>();
  const dLines = dxfDef.split("\n");
  for (let i = 0; i + 1 < dLines.length; i += 2) {
    // walk real code/value pairs — a VALUE "0" (layer flags, Z coords) must not
    // be mistaken for an entity marker
    if (dLines[i] === "0" && !["SECTION", "ENDSEC", "TABLE", "LAYER", "ENDTAB", "EOF"].includes(dLines[i + 1])) dxfTypes.add(dLines[i + 1]);
  }
  check("dxf: only core R12 entities (LINE/CIRCLE/TEXT)", [...dxfTypes].every((t) => t === "LINE" || t === "CIRCLE" || t === "TEXT"), [...dxfTypes].join(","));
  check("dxf: declares $ACADVER AC1009 (AutoCAD R12)", dxfDef.includes("$ACADVER\n1\nAC1009"));
  check("dxf: banding arrows drawn as BANDING LINEs", dxfDef.includes("0\nLINE\n8\nBANDING"));
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

/* ================= full doors, back material, slot override, reports ================= */
{
  // a second plywood in the library so "back follows material" is observable
  const S2: Settings = {
    ...S,
    plyMaterials: [...(S.plyMaterials ?? []), { id: "ply-baltic", name: "Baltic Birch", color: "#c9a06a", opacity: 1, solid: false }],
  };

  // Phase #3 — Back inherits the cabinet plywood (buildBody)
  const c = makeCabinet("base", 600, 720, 560, "BackMat");
  c.matId = "ply-baltic";
  const back = allParts([c], S2).find((p) => p.name === "Back");
  check("back: carries the cabinet matId", back?.matId === "ply-baltic", `${back?.matId}`);
  check("back: material stays 'back' (banding/grain rules untouched)", back?.material === "back", `${back?.material}`);
  const group = nestParts(allParts([c], S2), S2).find((g) => g.material === "back");
  check("back: nesting groups per plywood, not back@def", group?.matId === "ply-baltic", `${group?.matId}`);

  // Phase #3 — same for stacked boxes (buildStackedBody)
  const st = makeCabinet("base", 600, 1440, 560, "BackMatStack");
  st.matId = "ply-baltic";
  st.stack = [720, 720];
  const backs = allParts([st], S2).filter((p) => p.name.startsWith("Back"));
  check("back stacked: one back per box", backs.length === 2, `${backs.length}`);
  check("back stacked: every box back follows the plywood", backs.every((p) => p.matId === "ply-baltic"), backs.map((p) => String(p.matId)).join(","));

  // default plywood still resolves when the cabinet has no matId
  const dflt = allParts([makeCabinet("base", 600, 720, 560, "BackDef")], S2).find((p) => p.name === "Back");
  check("back: no matId → project default plywood", dflt?.matId === DEFAULT_PLY_ID, `${dflt?.matId}`);
}

/* door W×H auto + override (rule F) */
{
  const mk = (over: Record<string, number>) =>
    ({ type: "single", style: "overlay", swing: "left", material: "mdf", mdfThk: S.mdfThk, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center", ...over }) as any;
  const auto = doorDims(600, 720, mk({}), S);
  check("doorDims: auto h = row − 2×gap", auto.h === 720 - 2 * S.doorGap, `${auto.h}`);
  check("doorDims: auto w = face − 2×gap", auto.w === 600 - 2 * S.doorGap, `${auto.w}`);
  check("doorDims: wAuto/hAuto reported", auto.wAuto === auto.w && auto.hAuto === auto.h, `${auto.wAuto}/${auto.hAuto}`);
  const ovr = doorDims(600, 720, mk({ hOverride: 700, wOverride: 640 }), S);
  check("doorDims: height override wins", ovr.h === 700 && ovr.hAuto === 720 - 2 * S.doorGap, `${ovr.h}`);
  check("doorDims: width override wins", ovr.w === 640 && ovr.wAuto === 600 - 2 * S.doorGap, `${ovr.w}`);
  const dbl = doorDims(600, 720, mk({ type: "double" }), S);
  check("doorDims: double leaf splits the opening", dbl.count === 2 && Math.abs(dbl.wAuto * 2 + S.doorGap - (600 - 2 * S.doorGap)) < 0.51, `${dbl.wAuto}`);
  const fd = fullDoorAutoDims(makeCabinet("base", 600, 1440, 560, "FD"), S);
  check("fullDoor auto dims span the carcass, not the cabinet", fd.hAuto < 1440 && fd.hAuto > 1440 - S.bodyThk * 2 - 2 * S.doorGap - S.kickHeight - 1, `${fd.wAuto}×${fd.hAuto}`);
}

/* per-cabinet slot-from-front override */
{
  const global80 = makeCabinet("base", 600, 720, 560, "SlotG");
  global80.slot = "left";
  const g = allParts([global80], S).find((p) => p.name.startsWith("Side panel L"));
  check("slot: global slotFromFront used by default", !!g && g.note.includes(`${S.slotFromFront}mm from front`), g?.note.slice(-60));

  const c = makeCabinet("base", 600, 720, 560, "SlotC");
  c.slot = "left";
  c.slotFromFront = 120;
  const p = allParts([c], S).find((x) => x.name.startsWith("Side panel L"));
  check("slot: per-cabinet override wins over global", !!p && p.note.includes("120mm from front") && !p.note.includes("80mm from front"), p?.note.slice(-60));
  const gr = p?.grooves.find((x: any) => x.kind === "slot");
  const D = carcassDepth(c, S);
  // allParts rotates every piece once (L↔W), so the depth axis may read on x OR y —
  // what must hold either way: the groove is slotFromFront away from a panel end
  const along = gr ? [Math.abs(gr!.x1 + gr!.x2) / 2, Math.abs(gr!.y1 + gr!.y2) / 2] : [-1];
  const distFromEnd = Math.min(...[along[0], along[1], D - along[0], D - along[1]].map(Math.abs));
  check("slot: groove sits 120mm from the front end of the depth axis", !!gr && Math.abs(distFromEnd - 120) < 0.6, `${Math.round(distFromEnd * 10) / 10} (D=${D})`);
  check("slot: groove width = settings.slotWidth", !!gr && Math.abs(gr!.y2 - gr!.y1 - S.slotWidth) < 0.01, `${gr ? gr!.y2 - gr!.y1 : "-"}`);
}

/* full-door variants (L/R/Double) are parsed, not just "mdf"/"glass" */
{
  const c = makeCabinet("base", 900, 1440, 560, "FullDoor");
  c.stack = [720, 720];
  for (const v of ["mdf-left", "mdf-right", "mdf-double"] as const) {
    c.fullDoor = v;
    const doors = generateCabinetParts(c, S).filter((p) => p.name.startsWith("Door"));
    check(`fullDoor ${v}: one full-height MDF door part per leaf on a stacked box`, doors.length >= 1, `${doors.length}`);
    if (v === "mdf-double") check("fullDoor mdf-double: two leaves", doors.length === 2, `${doors.length}`);
    if (v === "mdf-left") check("fullDoor mdf-left: single leaf", doors.length === 1, `${doors.length}`);
    // the door must span the whole carcass (both boxes), not one box
    if (v === "mdf-left") {
      const full = 720 + 720 - kickH(c, S) - 2 * S.doorGap;
      check("fullDoor leaf covers the stacked boxes", Math.abs(Math.max(doors[0].w, doors[0].h) - full) < 1.5, `${Math.max(doors[0].w, doors[0].h)} vs ${full}`);
    }
  }
  // glass fronts are REFERENCE ONLY — hardware counted, no cut part drilled
  c.fullDoor = "glass-double";
  check("fullDoor glass-*: no plywood/MDF cut part (reference only)", generateCabinetParts(c, S).filter((p) => p.name.startsWith("Door")).length === 0);
  c.fullDoor = "off";
  check("fullDoor off: no cabinet-level door parts", generateCabinetParts(c, S).filter((p) => p.name.startsWith("Door")).length === 0);
}

/* BOM report — drawer boxes gone, shelf pins counted as shelves ×4 */
{
  const c = makeCabinet("base", 600, 720, 560, "BomReport");
  c.rows = [{ id: "r1", h: 720, columns: [{ id: "c1", width: 0, shelves: 2, fixed: false, drawers: [], door: null }] }] as any;
  const parts = allParts([c], S);
  const shelves = parts.filter((p) => p.name.startsWith("Shelf")).reduce((a, p) => a + p.qty, 0);
  check("shelf parts exist for the pin math", shelves === 2, `${shelves}`);
  const html = bomReportHtml([c], S);
  check("report: no 'Drawer boxes' hardware row", !/Drawer boxes/i.test(html));
  check("report: shelf pins use the ×4 rule", html.includes(`${shelves * 4}`) && html.includes("shelves x4"), "");
  check("report: hinge note carries the NEW bands", html.includes("<900-&gt;2") || html.includes("900-1799-&gt;3") || html.includes("900-1799->3"), "");
}

/* exploded per-cabinet report — renders offline, one section per cabinet */
{
  const a = makeCabinet("base", 600, 720, 560, "EXP-A");
  a.rows = [{ id: "r1", h: 720, columns: [{ id: "c1", width: 0, shelves: 1, fixed: false, drawers: [], door: { type: "single", style: "overlay", swing: "left", material: "mdf", mdfThk: S.mdfThk, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center" } as any }] }] as any;
  const b = makeCabinet("wall", 800, 600, 320, "EXP-B");
  const html = explodedReportHtml([a, b], S, [], {}, { name: "Smoke Project" } as any, null, {});
  check("exploded report: non-trivial html", html.length > 20000, `${Math.round(html.length / 1024)} KB`);
  check("exploded report: one section per cabinet", html.includes("Cabinet 1/2") && html.includes("Cabinet 2/2"), "");
  check("exploded report: exploded + open-door pages", html.includes("Exploded View") && html.includes("Open Door View"), "");
  check("exploded report: per-cabinet panel size table", html.includes("Panel Size Table"), "");
  check("exploded report: drilling map page", html.includes("Drilling Map"), "");
  check("exploded report: vectors only, no external assets", html.includes("<svg") && !/<(script|link)\s+[^>]*src=["']?(https?:)?\/\//i.test(html));
  check("exploded report: table names the plywood, not 'plywood'", html.includes("Plywood") , "");
}

/* 22 — 2D front view: Z is taken from the Plan View; DIFFERENT Z = no overlap */
{
  const a = makeCabinet("base", 600, 720, 560, "ZA");
  const b = makeCabinet("base", 600, 720, 560, "ZB");
  const box = (c: typeof a, x: number, y: number, z: number) => ({
    id: c.id,
    name: c.name,
    x,
    y,
    w: c.width,
    h: c.height,
    z,
  });
  // same depth plane → the X/Y intersection is a real overlap
  check("2D overlap: same Z → overlap flagged", overlapBoxes([box(a, 0, 0, 0), box(b, 200, 0, 0)]).length === 1);
  // different plan Z → different depth planes → NO overlap in the 2D view
  check("2D overlap: different Z (500mm) → NO overlap", overlapBoxes([box(a, 0, 0, 0), box(b, 200, 0, 500)]).length === 0);
  // touching edges on the same plane are NOT overlap (unchanged rule)
  check("2D overlap: touching edges (same Z) → NOT overlap", overlapBoxes([box(a, 0, 0, 0), box(b, 600, 0, 0)]).length === 0);
  // a ≤1mm Z difference is the same plane (floating-point tolerance)
  check("2D overlap: 1mm Z diff = same plane", overlapBoxes([box(a, 0, 0, 0), box(b, 200, 0, 1)]).length === 1);
  // raw panels carry their plan Z through the same rule
  check("2D overlap: panel with different Z → NO overlap", overlapBoxes([box(a, 0, 0, 0), { id: "p1", name: "P", x: 100, y: 0, w: 300, h: 400, z: 80 }]).length === 0);
}

/* 23 — glass doors live in the BOM only (table rows AND the full report),
   while the CNC DXF stays completely glass-free */
{
  // neutral cabinet name — the word "glass" in the DXF is ONLY acceptable if
  // the user named their own cabinet that way
  const c = makeCabinet("tall", 600, 1000, 560, "GdCab");
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
  c.qty = 2; // BOM counts both copies
  const html = bomReportHtml([c], S);
  check("bom report: glass door line present with size", /Glass door - \d+x\d+/.test(html), "no 'Glass door' BOM row");
  check("bom report: glass door qty = cabinet qty (2)", /Glass door - \d+x\d+<\/td><td class="num">2<\/td><td>pcs<\/td>/.test(html), "qty 2 not found");
  check("bom report: glass row notes NOT in DXF", html.includes("NOT in DXF"));
  // and the DXF must not contain the word glass at all (no text, no layer, no label)
  const dxfAll = buildDxf([c], S, null, true);
  check("dxf: zero mentions of glass in every flat export", !/glass/i.test(dxfAll), dxfAll.match(/glass/gi)?.length?.toString() ?? "");
}

/* 24 — banding edges land on the TRUE front edge after auto-rotation.
   Drawer cabinets exposed the bug: the slide holes hug the front edge, but the
   banding marker was drawn on the opposite edge (the remap was inverted). */
{
  const c = makeCabinet("base", 600, 720, 560, "BandEdge");
  const z = c.rows[0].columns[0];
  z.drawers = [{ id: "d1", hidden: false, frontHeight: 220, slideDepthCm: 35, frontMdf: true }];
  z.door = null;
  const parts = allParts([c], S);
  const L = parts.find((p) => p.name === "Side panel L")!;
  const R = parts.find((p) => p.name === "Side panel R")!;
  // rotated L: front edge (x=D) maps to y'=0 = BOTTOM; mirrored R: front (x=0) maps to y'=D = TOP
  check("band L: front edge = bottom after rotation", L.band.bottom === true && !L.band.top, JSON.stringify(L.band));
  check("band R: front edge = top after rotation (mirrored)", R.band.top === true && !R.band.bottom, JSON.stringify(R.band));
  const slideY = L.holes.filter((h) => h.kind === "slide").map((h) => h.y);
  check("band L: slide holes hug the same (front) edge as the banding", slideY.length > 0 && Math.min(...slideY) < 60 && Math.max(...slideY) < L.h / 2, slideY.slice(0, 4).join(","));
  const slideYR = R.holes.filter((h) => h.kind === "slide").map((h) => h.y);
  check("band R: slide holes hug the banded top edge", slideYR.length > 0 && Math.max(...slideYR) > R.h - 60 && Math.min(...slideYR) > R.h / 2, slideYR.slice(0, 4).join(","));
}

/* 25 — span panels keep grain along the span (no auto-rotation); oak backs lock
   their grain and orient long-side-first so the nester never rotates them wrong */
{
  const c = makeCabinet("base", 900, 720, 560, "SpanGrain");
  const parts = allParts([c], S);
  const top = parts.find((p) => p.name === "Top")!;
  check("Top keeps w=span (not rotated)", Math.abs(top.w - (900 - 2 * S.bodyThk)) < 0.01 && top.w > top.h, `${top.w}x${top.h}`);
  const shelf = parts.find((p) => p.name.startsWith("Shelf"))!;
  check("Shelf keeps w=span", shelf.w > shelf.h, `${shelf.w}x${shelf.h}`);
  const S2: Settings = { ...S, plyMaterials: [...(S.plyMaterials ?? []), { id: "ply-oak", name: "Oak", color: "#c9a06a", opacity: 1, solid: false }] };
  const oak = makeCabinet("base", 600, 720, 560, "OakBack");
  oak.matId = "ply-oak";
  const backOak = allParts([oak], S2).find((p) => p.name === "Back")!;
  check("oak back: grain locked (follows the oak rule)", backOak.grain === true);
  check("oak back: long side along Length", backOak.w >= backOak.h, `${backOak.w}x${backOak.h}`);
  const backWhite = allParts([makeCabinet("base", 600, 720, 560, "WBack")], S2).find((p) => p.name === "Back")!;
  check("white back: grain free (unchanged)", backWhite.grain === false);
}

/* 26 — drawer box parts: NO edge markers in the DXF, but the BOM still counts
   every meter of their tape (band data stays on the part) */
{
  const c = makeCabinet("base", 600, 720, 560, "DrwBand");
  c.rows[0].columns[0].drawers = [{ id: "d1", hidden: false, frontHeight: 220, slideDepthCm: 35, frontMdf: false }];
  c.rows[0].columns[0].door = null;
  const parts = allParts([c], S);
  const side = parts.find((p) => p.name.startsWith("Drawer side"))!;
  check("drawer side still carries band data (BOM counts it)", !!(side.band.top || side.band.bottom || side.band.left || side.band.right), JSON.stringify(side.band));
  const onlyDrawer = { placed: [{ part: side, x: 0, y: 0, w: side.w, h: side.h, rotated: false }] } as unknown as import("../src/lib/nesting").Sheet;
  check("drawer side: zero BANDING markers in DXF", !buildDxfForSheet(onlyDrawer, false, { bandMarkers: true }).includes("BANDING"));
  const sideL = parts.find((p) => p.name === "Side panel L")!;
  const onlySide = { placed: [{ part: sideL, x: 0, y: 0, w: sideL.w, h: sideL.h, rotated: false }] } as unknown as import("../src/lib/nesting").Sheet;
  check("cabinet side: BANDING markers kept", buildDxfForSheet(onlySide, false, { bandMarkers: true }).includes("BANDING"));
}

/* 27 — MDF auto sheet: tall doors nest on 3050×1220 instead of going unplaced */
{
  const c = makeCabinet("tall", 600, 2500, 560, "AutoMdf");
  c.hasFronts = true;
  (c as unknown as { rows: unknown }).rows = [
    { id: "r1", h: 2500, columns: [{ id: "c1", width: 0, shelves: 0, fixed: false, drawers: [], door: { type: "single", style: "overlay", swing: "left", material: "mdf", mdfThk: S.mdfThk, hingeBrand: "Universal 35mm", hasHandle: false, handlePos: "center" } }] },
  ];
  const SAuto: Settings = { ...S, mdfSheet: "auto" };
  const mdf = nestParts(allParts([c], SAuto), SAuto).filter((g) => g.material === "mdf");
  check("mdf auto: tall door nested (not unplaced)", mdf.length > 0 && mdf.every((g) => g.unplaced === 0), mdf.map((g) => g.unplaced).join(","));
  check("mdf auto: tall door lands on a 3050 sheet", mdf.some((g) => g.sheets.some((s) => s.sheetW === 3050)), mdf.map((g) => g.sheets.map((s) => s.sheetW).join("/")).join(" "));
}

// 3D mixed layouts must not stack auto cabinets inside manually placed ones.
{
  const placed = makeCabinet("base", 600, 720, 600, "Placed");
  placed.layout = { x: 0, y: 900 };
  placed.qty = 2;
  const auto = makeCabinet("base", 500, 720, 600, "Auto");
  const pos = layout3DCabs([auto, placed], true, 20);
  check("3D includes every quantity instance", pos.length === 3);
  check("3D auto row starts after ALL placed copies regardless of order", pos[0].x === 1240);
  check("3D preserves manual elevation and copy spacing", pos[1].y === 900 && pos[2].x === 620);
  const row = layout3DCabs([auto, placed], false, 20);
  check("3D auto mode lays out all copies side by side", row.map(p => p.x).join() === "0,520,1140" && row.every(p => p.y === 0));
  placed.layout = { x: NaN, y: 0 };
  check("3D invalid layout falls back to auto row", layout3DCabs([placed, auto], true)[2].x === 1200);
}

// Physical bounds must ignore dimension decorations, including hidden sprites.
{
  const root = new THREE.Group();
  root.scale.setScalar(0.001);
  root.position.x = 2;
  const board = new THREE.Mesh(new THREE.BoxGeometry(600, 720, 560));
  board.position.set(300, 360, -280);
  root.add(board);
  const labels = new THREE.Group();
  labels.visible = false;
  const label = new THREE.Sprite();
  label.position.set(-5000, 9000, 4000);
  label.scale.set(10000, 2000, 1);
  labels.add(label);
  root.add(labels);
  const size = modelBounds(root).getSize(new THREE.Vector3());
  check("3D measurements ignore labels and preserve world scale", Math.abs(size.x - 0.6) < 1e-9 && Math.abs(size.y - 0.72) < 1e-9 && Math.abs(size.z - 0.56) < 1e-9);
  const before = modelBounds(root);
  label.scale.multiplyScalar(100);
  board.visible = false;
  check("3D fit stays stable after label scaling and layer toggles", before.equals(modelBounds(root)));
  check("3D bounds include placement", Math.abs(before.min.x - 2) < 1e-9);
  check("empty 3D bounds remain empty", modelBounds(new THREE.Group()).isEmpty());
}

/* 22 — saved project round-trip must keep raw panels (Save .json → reopen) */
const roundTripPanels = (async () => {
  const cabs = [makeCabinet("base", 600, 720, 560, "Saved-01")];
  const project = {
    name: "RoundTrip",
    type: "kitchen",
    customerId: null,
    status: "draft",
    notes: "",
    panels: [
      { id: "p1", name: "Oak Panel", side: "L", w: 1200, h: 600, thk: 0, mat: "mdf", finish: "oak" },
    ],
  } as any;
  const json = projectJson(cabs, S, project);
  const data = JSON.parse(json);
  check("save json includes project.panels", Array.isArray(data.project?.panels) && data.project.panels.length === 1);
  const loaded = await readProjectFile(new File([json], "project.json", { type: "application/json" }));
  check("load returns project with panels", loaded.project?.panels?.length === 1 && loaded.project.panels[0].name === "Oak Panel");
  check("load still returns cabinets", loaded.cabinets.length === 1 && loaded.cabinets[0].id === cabs[0].id);
})();

roundTripPanels.then(() => {
  if (failures) {
    console.log(`\n${failures} test(s) FAILED`);
    process.exit(1);
  } else {
    console.log("\nAll tests passed.");
  }
});