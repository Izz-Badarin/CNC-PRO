"use strict";

// src/lib/defaults.ts
var uid = () => Math.random().toString(36).slice(2, 10);
var DEFAULT_PLY_ID = "ply-default";
var DEFAULT_PLY_COLOR = "#b78a58";
var PLY_WHITE = "#f2f1ed";
var defaultPlyMaterials = () => [
  { id: DEFAULT_PLY_ID, name: "Plywood White", color: PLY_WHITE, opacity: 1, solid: true },
  { id: "ply-grain", name: "Plywood (grain)", color: DEFAULT_PLY_COLOR, opacity: 1 }
];
function plyMaterialsOf(S2) {
  return Array.isArray(S2.plyMaterials) && S2.plyMaterials.length ? S2.plyMaterials : defaultPlyMaterials();
}
function defaultPlyId(S2) {
  return plyMaterialById(S2, S2.defaultPlyId).id;
}
function plyMaterialById(S2, id) {
  const lib = plyMaterialsOf(S2);
  if (id) {
    const hit = lib.find((m) => m.id === id);
    if (hit) return hit;
  }
  const def = lib.find((m) => m.id === S2.defaultPlyId);
  return def ?? lib[0];
}
var plyMaterialOf = (S2, cab) => plyMaterialById(S2, cab.matId);
var DEFAULT_SLIDE_HOLE_PATTERNS = {
  "25": [39, 71, 167, 231],
  "30": [39, 71, 167, 231],
  "35": [39, 71, 167, 231],
  "40": [39, 71, 167, 263],
  "45": [39, 71, 167, 263],
  "50": [39, 71, 263, 341],
  // kitchen-mode drawers use a dedicated industry pattern (always 50cm slide)
  kitchen: [38, 61, 261.5, 294.5]
};
function normalizeSlidePatterns(p) {
  const out = {};
  for (const k of [...AVAILABLE_DRAWER_DEPTHS.map(String), "kitchen"]) {
    const arr = p?.[k];
    out[k] = Array.isArray(arr) && arr.length ? arr.map(Number) : [...DEFAULT_SLIDE_HOLE_PATTERNS[k]];
  }
  return out;
}
var DEFAULT_SETTINGS = {
  bodyThk: 16.5,
  mdfThk: 19,
  backThk: 5,
  drawerThk: 16.5,
  bitDiameter: 4,
  holeDiameter: 4.9,
  slideHoleDiameter: 4.9,
  shelfGapMin: 300,
  shelfGapMax: 350,
  shelfGapTarget: 325,
  shelfIncrease: 0.5,
  shelfFrontSetback: 5,
  shelfHoleCenter: 39,
  shelfHoleSpacing: 32,
  shelfHolesPerSide: 3,
  kickHeight: 100,
  kickDepth: 50,
  doorGap: 3,
  dividerDeduct: 33,
  grooveWidth: 5.7,
  grooveFromBottom: 12,
  grooveShorter: 20,
  slotWidth: 18,
  slotFromFront: 80,
  sheetW: 2440,
  // locked: plywood / veneer-back sheets are always 2440 × 1220
  sheetH: 1220,
  mdfSheet: "auto",
  bandMarkers: true,
  railSuitsH: 1100,
  railDressesH: 1750,
  railDouble1: 1e3,
  railDouble2: 2e3,
  railShelfGap: 60,
  /* ---- hinge boring (universal 35mm hinge — cups bored in the DOOR) ---- */
  hingeCupDiameter: 35,
  // universal hinge — 35mm cup bored in the DOOR (never the side panels)
  hingeCupDepth: 12.5,
  // standard cup depth
  hingeCupEdge: 21.5,
  // cup CENTER distance from the hinge-side door edge
  mdfFinish: "white",
  // MDF doors/covers default to white (no edge banding)
  glassColor: "#bcd8e8",
  glassOpacity: 0.32,
  frameColor: "#c9ccd4",
  sheetMargin: 10,
  partClearance: 4.1,
  maxSheets: 50,
  timeBudget: 8,
  sheetFullThreshold: 0.9,
  grainLock: false,
  nestFrom: "bottom left",
  nestDirection: "X",
  minOffcut: 300,
  colorPlywood: DEFAULT_PLY_COLOR,
  colorMdf: "#d8d4ca",
  colorBack: "#a08a6a",
  colorKick: "#b78a58",
  // matches plywood by default
  colorEdge: "#f5b33c",
  opacityPlywood: 1,
  opacityMdf: 1,
  opacityBack: 1,
  opacityKick: 1,
  hiddenFrontDeduct: 57,
  hiddenFrontInset: 30,
  kickInNesting: true,
  clampHoles: true,
  plyMaterials: defaultPlyMaterials(),
  defaultPlyId: DEFAULT_PLY_ID,
  // drawer drilling & box (formerly hardcoded)
  slideHolePatterns: DEFAULT_SLIDE_HOLE_PATTERNS,
  drawerHoleYStart: 60,
  drawerHoleYStep: 55,
  drawerBoxFrontDeduct: 33,
  drawerBoxBackDeduct: 49,
  drawerBoxHiddenExtra: 50,
  drawerBoxDepthFix: 7
};
var AVAILABLE_DRAWER_DEPTHS = [25, 30, 35, 40, 45, 50];
var DRAWER_HOLE_PATTERNS = {
  25: [39, 71, 167, 231],
  30: [39, 71, 167, 231],
  35: [39, 71, 167, 231],
  40: [39, 71, 167, 263],
  45: [39, 71, 167, 263],
  50: [39, 71, 263, 341]
};
var FIRST_DRAWER_HOLE_HEIGHT = 60;
var DRAWER_HEIGHT_INCREMENT = 55;
function getDrawerHolePattern(slideDepthCm) {
  const d = Math.round(slideDepthCm);
  if (DRAWER_HOLE_PATTERNS[d]) return DRAWER_HOLE_PATTERNS[d];
  const lower = [...AVAILABLE_DRAWER_DEPTHS].reverse().find((x) => x <= d);
  return DRAWER_HOLE_PATTERNS[lower ?? AVAILABLE_DRAWER_DEPTHS[0]];
}
function findNearestDrawerDepth(depthMm) {
  const cm = depthMm / 10;
  for (let i = AVAILABLE_DRAWER_DEPTHS.length - 1; i >= 0; i--) if (AVAILABLE_DRAWER_DEPTHS[i] <= cm) return AVAILABLE_DRAWER_DEPTHS[i];
  return AVAILABLE_DRAWER_DEPTHS[0];
}
var KITCHEN_SLIDE_CM = 50;
var KITCHEN_SLIDE_PATTERN = [38, 61, 261.5, 294.5];
var KITCHEN_FIRST_HOLE_Y = 75;
var KITCHEN_LAST_DRAWER_OFFSET = 55;
var DOOR_GAP_BETWEEN_DOUBLE = 3;
var DOOR_THIRD_HINGE_THRESHOLD = 900;
var doorHingeCount = (doorH) => doorH >= DOOR_THIRD_HINGE_THRESHOLD ? 3 : 2;
var mkColumn = (p) => ({
  id: uid(),
  width: 0,
  shelves: 0,
  door: null,
  drawers: [],
  drawerAlign: "bottom",
  // drawer bank sits at the section bottom unless changed
  ...p
});
var TYPE_META = {
  custom: { label: "Custom Cabinet", desc: "Blank cabinet \u2014 configure everything", dims: [600, 720, 560], kick: true, kitchen: false },
  base: { label: "Base Unit", desc: "Floor unit with toe kick", dims: [600, 720, 560], kick: true, kitchen: true },
  wall: { label: "Wall Unit", desc: "No kick, wall hung", dims: [600, 720, 350], kick: false, kitchen: true },
  tall: { label: "Tall Unit", desc: "Pantry / oven housing", dims: [600, 2100, 560], kick: true, kitchen: true },
  cornerBase: { label: "Corner Base", desc: "5-sided pentagon footprint", dims: [900, 720, 900], kick: true, kitchen: true },
  cornerWall: { label: "Corner Wall", desc: "5-sided, wall hung", dims: [700, 720, 700], kick: false, kitchen: true },
  baseDoorFixed: { label: "Base + Door & Fixed", desc: "Door over fixed panel", dims: [600, 720, 560], kick: true, kitchen: false },
  L: { label: "L Cabinet", desc: "Side panels notched at top-front corner", dims: [600, 720, 560], kick: true, kitchen: true },
  C: { label: "C Cabinet", desc: "Side panels with top + mid notches", dims: [600, 720, 560], kick: true, kitchen: true }
};
var DEFAULT_CUTS = {
  lCutW: 27,
  lCutH: 58,
  cCutW: 27,
  cCutTopH: 58,
  cCutMidH: 75,
  cCutOffsetFromBottom: 290
};
function shelfGap(H, n, S2) {
  return (H - n * S2.bodyThk) / (n + 1);
}
function recommendedShelves(H, S2) {
  let bestN = -1;
  let bestScore = Infinity;
  for (let n = 0; n < 30; n++) {
    const gap = shelfGap(H, n, S2);
    if (gap >= S2.shelfGapMin && gap <= S2.shelfGapMax) {
      const sc = Math.abs(gap - S2.shelfGapTarget);
      if (sc < bestScore) {
        bestScore = sc;
        bestN = n;
      }
    }
  }
  if (bestN >= 0) return bestN;
  for (let n = 0; n < 30; n++) {
    const gap = shelfGap(H, n, S2);
    if (gap >= S2.shelfGapMin - 25 && gap <= S2.shelfGapMax + 25) {
      const sc = Math.abs(gap - S2.shelfGapTarget) * 2;
      if (sc < bestScore) {
        bestScore = sc;
        bestN = n;
      }
    }
  }
  if (bestN >= 0) return bestN;
  if (H >= 400) {
    let fb = 1, fbScore = Infinity;
    for (let n = 1; n < 30; n++) {
      const sc = Math.abs(shelfGap(H, n, S2) - S2.shelfGapTarget);
      if (sc < fbScore) {
        fbScore = sc;
        fb = n;
      }
    }
    return fb;
  }
  return 0;
}
var row = (h, cols) => ({ id: uid(), h, columns: cols });
function defaultRows(type, height, width, S2 = DEFAULT_SETTINGS) {
  void width;
  const kick = TYPE_META[type].kick ? S2.kickHeight : 0;
  const BH = height - kick;
  const shel = (H) => recommendedShelves(H, S2);
  if (BH < 300) return [row(Math.max(80, BH), [mkColumn()])];
  switch (type) {
    case "custom":
      return [row(BH, [mkColumn({ shelves: Math.max(1, shel(BH)) })])];
    case "wall":
      return [row(BH, [mkColumn({ shelves: Math.max(1, shel(BH)) })])];
    case "base":
    case "L":
    case "C":
      return [row(BH, [mkColumn({ shelves: Math.max(1, shel(BH)) })])];
    case "tall": {
      const lower = Math.round(BH * 0.62);
      return [
        row(lower, [mkColumn({ shelves: shel(lower) })]),
        row(BH - lower, [mkColumn({ shelves: shel(BH - lower) })])
      ];
    }
    case "cornerBase":
    case "cornerWall":
      return [row(BH, [mkColumn({ shelves: Math.max(1, shel(BH)) })])];
    case "baseDoorFixed": {
      const fixed = Math.min(200, Math.round(BH * 0.24));
      return [row(fixed, [mkColumn()]), row(BH - fixed, [mkColumn({ shelves: Math.max(1, shel(BH - fixed)) })])];
    }
  }
}
function makeCabinet(type, w, h, d, name) {
  const meta = TYPE_META[type];
  void meta;
  const W = Math.max(120, Math.round(w));
  const H = Math.max(120, Math.round(h));
  const D = Math.max(100, Math.round(d));
  return {
    id: uid(),
    name: name.trim() || meta.label,
    type,
    width: W,
    height: H,
    depth: D,
    qty: 1,
    isKitchen: false,
    // kitchen mode is OFF until the user turns it on
    hasToeKick: false,
    // toe kick is OFF until the user enables it
    hasFronts: false,
    // MDF fronts are OFF until the user adds a door / enables a front
    hasBack: true,
    rows: defaultRows(type, H, W),
    ...DEFAULT_CUTS
  };
}

// src/lib/model.ts
var hasKick = (c, S2) => {
  if (typeof c === "string") return TYPE_META[c].kick;
  void S2;
  return c.hasToeKick === true && TYPE_META[c.type].kick;
};
var kickH = (c, S2) => hasKick(c) ? S2.kickHeight : 0;
var boxHeight = (c, S2) => c.height - kickH(c, S2);
var carcassDepth = (c, S2) => Math.max(40, c.depth - (c.hasFronts !== false ? frontThk(c, S2) : 0) - (c.hasBack !== false ? S2.backThk : 0));
function frontThk(c, S2) {
  for (const r of c.rows) for (const col of r.columns) if (col.door) {
    const d = col.door;
    if (d.material === "glass") return 10;
    return d.material === "mdf" ? d.mdfThk || S2.mdfThk : S2.bodyThk;
  }
  return S2.mdfThk;
}
var isCorner = (t) => t === "cornerBase" || t === "cornerWall";
var isNotched = (t) => t === "L" || t === "C";
var stackOn = (c) => Array.isArray(c.stack) && c.stack.length >= 2 && c.stack.every((h) => h > 0);
var stackedHeights = (c) => stackOn(c) ? c.stack : [];
var stackTotal = (c) => stackedHeights(c).reduce((a, h) => a + h, 0);
function partId(p) {
  return `${p.cabId}|${p.name}|${Math.round(p.w * 10)}x${Math.round(p.h * 10)}|${p.material}|${p.thickness}`;
}
function sidePanelOutline(cab, BH, depth) {
  const D = depth ?? cab.depth;
  if (cab.type === "L") {
    const cw = Math.min(Math.max(0, cab.lCutW), D - 10);
    const ch = Math.min(Math.max(0, cab.lCutH), BH - 10);
    if (cw <= 0 || ch <= 0) return rectOutline(D, BH);
    return [
      [0, 0],
      [D, 0],
      [D, BH - ch],
      [D - cw, BH - ch],
      [D - cw, BH],
      [0, BH]
    ];
  }
  if (cab.type === "C") {
    const cw = Math.min(Math.max(0, cab.cCutW), D - 10);
    const th = Math.min(Math.max(0, cab.cCutTopH), BH - 10);
    const mh = Math.max(0, cab.cCutMidH);
    const m0 = Math.max(0, cab.cCutOffsetFromBottom);
    const m1 = Math.min(m0 + mh, BH - th - 10);
    if (cw <= 0) return rectOutline(D, BH);
    const pts = [[0, 0], [D, 0]];
    if (mh > 0 && m1 > m0) pts.push([D, m0], [D - cw, m0], [D - cw, m1], [D, m1]);
    if (th > 0) pts.push([D, BH - th], [D - cw, BH - th], [D - cw, BH]);
    else pts.push([D, BH]);
    pts.push([0, BH]);
    return pts;
  }
  return rectOutline(D, BH);
}
var rectOutline = (w, h) => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h]
];
var pentagonOutline = (w, h, K) => [
  [0, 0],
  [w, 0],
  [w, K],
  [K, h],
  [0, h]
];
var mirrorOutline = (pts, w) => pts.map(([x, y]) => [w - x, y]).reverse();
function columnLayoutIn(innerW, cols, S2) {
  const T = S2.bodyThk;
  const n = cols.length;
  if (n === 0) return [];
  const dividers = (n - 1) * T;
  const avail = Math.max(40, innerW - dividers);
  const fixed = cols.reduce((a, c) => a + (c.width > 0 ? c.width : 0), 0);
  const flexCount = cols.filter((c) => c.width <= 0).length;
  const flexW = flexCount > 0 ? Math.max(40, (avail - fixed) / flexCount) : 0;
  let x = 0;
  return cols.map((c, i) => {
    const w = c.width > 0 ? c.width : flexW;
    const item = { col: c, x, w, first: i === 0, last: i === n - 1 };
    x += w + T;
    return item;
  });
}
function columnLayout(cab, row2, S2) {
  return columnLayoutIn(cab.width - 2 * S2.bodyThk, row2.columns ?? [], S2);
}
function columnFaceWidth(_cab, lay, S2) {
  const T = S2.bodyThk;
  return lay.w + (lay.first ? T : T / 2) + (lay.last ? T : T / 2);
}
function drawerBoxDims(faceW, drawer, S2) {
  const slideMm = drawer.slideDepthCm * 10;
  const boxW = Math.max(100, faceW - S2.bodyThk - S2.drawerBoxBackDeduct - (drawer.hidden ? S2.drawerBoxHiddenExtra : 0));
  const boxD = slideMm - S2.drawerBoxDepthFix;
  const sideH = Math.max(60, drawer.frontHeight - 50);
  const fbH = Math.max(40, sideH - 25);
  return { slideMm, boxW, boxD, sideH, fbH };
}
function drawerHoleHeights(drawers, S2) {
  const yStart = S2.drawerHoleYStart ?? FIRST_DRAWER_HOLE_HEIGHT;
  const yStep = S2.drawerHoleYStep ?? DRAWER_HEIGHT_INCREMENT;
  let cum = 0;
  return drawers.map((d, i) => {
    const y = i === 0 ? yStart : yStep + cum;
    cum += d.frontHeight;
    return y;
  });
}
function kitchenHoleHeights(drawers) {
  const n = drawers.length;
  let cum = 0;
  return drawers.map((d, i) => {
    const y = i === 0 ? KITCHEN_FIRST_HOLE_Y : i === n - 1 ? cum + KITCHEN_LAST_DRAWER_OFFSET : KITCHEN_FIRST_HOLE_Y + cum;
    cum += d.frontHeight;
    return y;
  });
}
function autoDrawerHoleY(drawers, isKitchen, i, S2) {
  const ys = isKitchen ? kitchenHoleHeights(drawers) : drawerHoleHeights(drawers, S2);
  return ys[Math.min(i, Math.max(0, ys.length - 1))];
}
function effectiveDrawerHoleY(dr, drawers, isKitchen, i, S2) {
  return typeof dr.yOffset === "number" && Number.isFinite(dr.yOffset) ? dr.yOffset : autoDrawerHoleY(drawers, isKitchen, i, S2);
}
function drawerBank(col, rowH, S2) {
  const h = col.drawers.reduce((a, d) => a + d.frontHeight, 0);
  if (h <= 0) return { y: 0, h: 0 };
  void S2;
  const align = col.drawerAlign ?? "bottom";
  const maxY = Math.max(0, rowH - h);
  const y = align === "top" ? maxY : align === "custom" ? Math.min(Math.max(0, col.drawerOffsetY ?? 0), maxY) : 0;
  return { y, h };
}
function doorDims(faceW, rowH, door, S2) {
  if (door.style === "inset") {
    const total2 = faceW - 2 * (S2.bodyThk + S2.doorGap);
    const h2 = rowH - 2 * (S2.bodyThk + S2.doorGap);
    if (door.type === "double" || door.type === "sliding") return { w: (total2 - DOOR_GAP_BETWEEN_DOUBLE) / 2, h: h2, count: 2 };
    return { w: total2, h: h2, count: 1 };
  }
  const total = faceW - 2 * S2.doorGap;
  const h = rowH - 2 * S2.doorGap;
  if (door.type === "double") return { w: (total - DOOR_GAP_BETWEEN_DOUBLE) / 2, h, count: 2 };
  if (door.type === "sliding") return { w: (total - DOOR_GAP_BETWEEN_DOUBLE) / 2 + 20, h, count: 2 };
  return { w: total, h, count: 1 };
}
function doorMaterial(door, S2) {
  if (door.material === "glass") return { mat: "mdf", thk: 10 };
  return door.material === "mdf" ? { mat: "mdf", thk: S2.mdfThk } : { mat: "plywood", thk: S2.bodyThk };
}
function effectiveHingeCount(door, leafH) {
  return door.type === "sliding" ? 0 : Math.max(1, Math.min(6, door.hingeCount ?? doorHingeCount(leafH)));
}
var mdfBanded = (S2, finish) => (finish ?? S2.mdfFinish) === "oak";
var mdfBand = (S2, finish) => mdfBanded(S2, finish) ? { top: true, bottom: true, left: true, right: true } : {};
var columnHasDrawers = (c) => c.drawers.length > 0;
function generateCabinetParts(cab, S2) {
  const T = S2.bodyThk;
  const parts = [];
  const cabinetPly = plyMaterialOf(S2, cab);
  const mk = (p) => {
    const part = {
      cabId: cab.id,
      // cut list shows the cabinet size appended to the name (e.g. Base-01_600x720)
      cabName: `${cab.name}_${Math.round(cab.width)}x${Math.round(cab.height)}`,
      qty: 1,
      band: {},
      holes: [],
      grooves: [],
      shape: "rect",
      outline: [],
      grain: p.material === "plywood",
      note: "",
      ...p,
      // every plywood part carries the cabinet's plywood material id (same
      // thickness — the material only differs in name/color) so the cut list,
      // nesting and DXF can group them per material. An explicit p.matId wins
      // (the toe kick uses it to always come from the DEFAULT plywood).
      matId: p.matId !== void 0 ? p.matId : p.material === "plywood" ? cabinetPly.id : void 0,
      w: Math.max(5, Math.round(p.w * 10) / 10),
      h: Math.max(5, Math.round(p.h * 10) / 10)
    };
    parts.push(part);
    return part;
  };
  if (isCorner(cab.type)) buildCorner(cab, S2, mk, T);
  else if (stackOn(cab)) buildStackedBody(cab, S2, mk, T);
  else buildBody(cab, S2, mk, T);
  (cab.covers ?? []).forEach((cv) => {
    const mat = cv.mat ?? "mdf";
    const thk = cv.thk || (mat === "mdf" ? S2.mdfThk : T);
    const w = Math.max(5, Math.round(cv.w * 10) / 10);
    const h = Math.max(5, Math.round(cv.h * 10) / 10);
    const label = cv.side === "L" ? "Left" : cv.side === "R" ? "Right" : cv.side === "T" ? "Top" : "Bottom";
    const finish = mat === "mdf" ? cv.finish ?? S2.mdfFinish : "white";
    const matId = mat === "plywood" ? cv.matId ?? plyMaterialOf(S2, cab).id : void 0;
    const matName = mat === "mdf" ? finish === "oak" ? `MDF oak ${thk}mm` : `MDF white ${thk}mm` : `plywood ${thk}mm`;
    mk({
      name: `Cover panel ${label}`,
      w,
      h,
      material: mat,
      thickness: thk,
      matId,
      band: mat === "plywood" ? { top: true, bottom: true, left: true, right: true } : mdfBand(S2, finish),
      grain: mat === "plywood" || finish === "oak",
      note: `cover ${label.toLowerCase()} \xB7 ${matName} \xB7 ${mat === "plywood" || finish === "oak" ? "banding: LWLW" : "white MDF \xB7 no banding"}`
    });
  });
  if (cab.qty > 1) parts.forEach((p) => p.qty *= cab.qty);
  return parts;
}
function fullDoorColumns(cab) {
  const cols = /* @__PURE__ */ new Set();
  cab.rows.forEach((r) => {
    r.columns.forEach((c, ci) => {
      if (c.door && c.door.full) cols.add(ci);
    });
  });
  return cols;
}
function buildBody(cab, S2, mk, T) {
  const kick = kickH(cab, S2);
  const BH = cab.height - kick;
  const W = cab.width;
  const D = carcassDepth(cab, S2);
  const insideW = W - 2 * T;
  const notch = isNotched(cab.type);
  const outline = sidePanelOutline(cab, BH, D);
  const sideL = mk({
    name: "Side panel L",
    w: D,
    h: BH,
    material: "plywood",
    thickness: T,
    band: { right: true },
    note: notch ? `${cab.type} notched \xB7 banding: front` : "banding: front"
  });
  const sideR = mk({
    name: "Side panel R",
    w: D,
    h: BH,
    material: "plywood",
    thickness: T,
    band: { left: true },
    note: notch ? `${cab.type} notched \xB7 mirrored \xB7 banding: front` : "mirrored \xB7 banding: front"
  });
  if (notch) {
    sideL.shape = "poly";
    sideL.outline = outline;
    sideR.shape = "poly";
    sideR.outline = mirrorOutline(outline, D);
  }
  const slot = cab.slot ?? "none";
  if (slot !== "none" && !notch) {
    const sw = Math.max(6, S2.slotWidth);
    const cx = D - Math.max(sw, S2.slotFromFront);
    const x1 = cx - sw / 2;
    const x2 = cx + sw / 2;
    if (x1 > 8 && x2 < D - 8) {
      const targets = slot === "left" ? [sideL] : slot === "right" ? [sideR] : [sideL, sideR];
      targets.forEach((sp) => {
        const isR = sp === sideR;
        sp.grooves.push({ x1: isR ? D - x2 : x1, y1: 0, x2: isR ? D - x1 : x2, y2: sp.h, width: sw, kind: "slot" });
        sp.note = `${sp.note} \xB7 slot ${sw}mm @ ${Math.round(S2.slotFromFront)}mm from front${isR ? " (mirrored)" : ""}`;
      });
    }
  }
  mk({ name: "Top", w: insideW, h: D, material: "plywood", thickness: T, band: { top: true }, note: "banding: front" });
  mk({ name: "Bottom", w: insideW, h: D, material: "plywood", thickness: T, band: { top: true }, note: "banding: front" });
  if (kick > 0 && S2.kickInNesting !== false) {
    mk({ name: "Toe kick front", w: insideW, h: S2.kickHeight, material: "plywood", thickness: T, matId: defaultPlyId(S2) });
    mk({
      name: "Toe kick side",
      w: Math.max(20, D - S2.kickDepth),
      h: S2.kickHeight,
      qty: 2,
      material: "plywood",
      thickness: T,
      matId: defaultPlyId(S2),
      note: "full-depth side"
    });
  }
  if (cab.hasBack !== false)
    mk({
      name: "Back",
      w: W - 2,
      h: BH - 2,
      material: "back",
      thickness: S2.backThk,
      grain: false,
      note: "full cabinet back"
    });
  const fullDoorCols = fullDoorColumns(cab);
  let y0 = 0;
  cab.rows.forEach((row2, ri) => {
    const lays = columnLayout(cab, row2, S2);
    if (ri > 0)
      mk({
        name: `Row section R${ri}/R${ri + 1}`,
        w: insideW,
        h: D,
        material: "plywood",
        thickness: T,
        band: { top: true },
        note: "row divider \xB7 banding: front"
      });
    lays.forEach((lay, ci) => {
      if (lay.last) return;
      const dv = mk({
        name: `Vertical divider R${ri + 1}C${ci + 1}`,
        w: D,
        h: Math.max(20, row2.h - S2.dividerDeduct),
        material: "plywood",
        thickness: T,
        band: { right: true },
        note: `side depth \xD7 row \u2212 ${S2.dividerDeduct}mm \xB7 banding: front`
      });
      lay.divider = dv;
    });
    lays.forEach((lay, ci) => {
      const faceW = lays.length === 1 ? W : columnFaceWidth(cab, lay, S2);
      const tag = lays.length > 1 ? ` R${ri + 1}C${ci + 1}` : ` R${ri + 1}`;
      buildColumn(cab, S2, mk, lay, faceW, row2.h, y0, tag, {
        L: sideL,
        R: sideR,
        first: lay.first,
        last: lay.last,
        dividerL: ci > 0 ? lays[ci - 1].divider ?? null : null,
        dividerR: lay.divider ?? null,
        rowY: y0,
        fullH: BH,
        suppressDoor: fullDoorCols.has(ci)
      });
    });
    y0 += row2.h;
  });
}
function buildStackedBody(cab, S2, mk, T) {
  const kick = kickH(cab, S2);
  const W = cab.width;
  const D = carcassDepth(cab, S2);
  const insideW = W - 2 * T;
  const heights = stackedHeights(cab);
  const fullH = heights.reduce((a, h) => a + h, 0) - kick;
  const slot = cab.slot ?? "none";
  const fullDoorCols = fullDoorColumns(cab);
  const cabDoor = cab.fullDoor && cab.fullDoor !== "off";
  heights.forEach((bh, bi) => {
    const bKick = bi === 0 ? kick : 0;
    const bH = Math.max(40, bh - bKick);
    const bTag = ` B${bi + 1}`;
    const sideL = mk({
      name: `Side panel L${bTag}`,
      w: D,
      h: bH,
      material: "plywood",
      thickness: T,
      band: { right: true },
      note: `box ${bi + 1} \xB7 banding: front`
    });
    const sideR = mk({
      name: `Side panel R${bTag}`,
      w: D,
      h: bH,
      material: "plywood",
      thickness: T,
      band: { left: true },
      note: `box ${bi + 1} \xB7 mirrored \xB7 banding: front`
    });
    if (slot !== "none") {
      const sw = Math.max(6, S2.slotWidth);
      const cx = D - Math.max(sw, S2.slotFromFront);
      const x1 = cx - sw / 2;
      const x2 = cx + sw / 2;
      if (x1 > 8 && x2 < D - 8) {
        const targets = slot === "left" ? [sideL] : slot === "right" ? [sideR] : [sideL, sideR];
        targets.forEach((sp) => {
          const isR = sp === sideR;
          sp.grooves.push({ x1: isR ? D - x2 : x1, y1: 0, x2: isR ? D - x1 : x2, y2: sp.h, width: sw, kind: "slot" });
          sp.note = `${sp.note} \xB7 slot ${sw}mm @ ${Math.round(S2.slotFromFront)}mm from front${isR ? " (mirrored)" : ""}`;
        });
      }
    }
    mk({ name: `Top${bTag}`, w: insideW, h: D, material: "plywood", thickness: T, band: { top: true }, note: `box ${bi + 1} \xB7 banding: front` });
    mk({ name: `Bottom${bTag}`, w: insideW, h: D, material: "plywood", thickness: T, band: { top: true }, note: `box ${bi + 1} \xB7 banding: front` });
    if (bi === 0 && bKick > 0 && S2.kickInNesting !== false) {
      mk({ name: "Toe kick front", w: insideW, h: S2.kickHeight, material: "plywood", thickness: T, matId: defaultPlyId(S2) });
      mk({
        name: "Toe kick side",
        w: Math.max(20, D - S2.kickDepth),
        h: S2.kickHeight,
        qty: 2,
        material: "plywood",
        thickness: T,
        matId: defaultPlyId(S2),
        note: "full-depth side"
      });
    }
    if (cab.hasBack !== false)
      mk({
        name: `Back${bTag}`,
        w: W - 2,
        h: bH - 2,
        material: "back",
        thickness: S2.backThk,
        grain: false,
        note: `box ${bi + 1} back`
      });
    const rows = cab.rows.map((r, i) => ({ r, i })).filter(({ r }) => (r.box ?? 0) === bi);
    let y0 = 0;
    rows.forEach(({ r, i }, idx) => {
      const lays = columnLayout(cab, r, S2);
      if (idx > 0)
        mk({
          name: `Row section R${i + 1}/R${i + 2}`,
          w: insideW,
          h: D,
          material: "plywood",
          thickness: T,
          band: { top: true },
          note: `box ${bi + 1} row divider \xB7 banding: front`
        });
      lays.forEach((lay, ci) => {
        if (lay.last) return;
        const dv = mk({
          name: `Vertical divider R${i + 1}C${ci + 1}${bTag}`,
          w: D,
          h: Math.max(20, r.h - S2.dividerDeduct),
          material: "plywood",
          thickness: T,
          band: { right: true },
          note: `side depth \xD7 row \u2212 ${S2.dividerDeduct}mm \xB7 banding: front`
        });
        lay.divider = dv;
      });
      lays.forEach((lay, ci) => {
        const faceW = lays.length === 1 ? W : columnFaceWidth(cab, lay, S2);
        const tag = `${bTag} R${i + 1}${lays.length > 1 ? `C${ci + 1}` : ""}`;
        buildColumn(cab, S2, mk, lay, faceW, r.h, y0, tag, {
          L: sideL,
          R: sideR,
          first: lay.first,
          last: lay.last,
          dividerL: ci > 0 ? lays[ci - 1].divider ?? null : null,
          dividerR: lay.divider ?? null,
          rowY: y0,
          fullH,
          suppressDoor: fullDoorCols.has(ci),
          suppressAllDoors: cabDoor ? true : void 0
        });
      });
      y0 += r.h;
    });
  });
  if (cabDoor) genCabinetFullDoor(S2, mk, cab);
}
function buildColumn(cab, S2, mk, lay, faceW, rowH, y0, tag, sides) {
  const T = S2.bodyThk;
  const col = lay.col;
  const D = carcassDepth(cab, S2);
  const hasDr = columnHasDrawers(col);
  const rowY = sides.rowY ?? 0;
  const nested = col.rows ?? [];
  if (nested.length > 0) {
    const total = nested.reduce((a, r) => a + r.h, 0) || 1;
    let sy = y0;
    nested.forEach((sub, si) => {
      const subH = sub.h / total * rowH;
      if (si > 0)
        mk({
          name: `Sub row divider${tag}.${si}`,
          w: lay.w,
          h: D,
          material: "plywood",
          thickness: T,
          band: { top: true },
          note: "column \u2192 row divider \xB7 banding: front",
          grain: true
        });
      const subLays = columnLayoutIn(lay.w, sub.columns, S2);
      subLays.forEach((sl, sci) => {
        if (!sl.last)
          mk({
            name: `Sub col divider${tag}.${si + 1}C${sci + 1}`,
            w: D,
            h: Math.max(20, subH - S2.dividerDeduct),
            material: "plywood",
            thickness: T,
            band: { right: true },
            note: "row \u2192 column divider \xB7 banding: front",
            grain: true
          });
        const subFaceW = subLays.length === 1 ? lay.w : sl.w + T;
        buildColumn(cab, S2, mk, sl, subFaceW, subH, sy, `${tag}.${si + 1}${subLays.length > 1 ? `C${sci + 1}` : ""}`, {
          L: sides.L,
          R: sides.R,
          first: sides.first && sl.first,
          last: sides.last && sl.last,
          dividerL: sides.dividerL,
          dividerR: sides.dividerR,
          rowY: sy
        });
      });
      sy += subH;
    });
    return;
  }
  const drillLeft = (x, y, dia, kind) => {
    if (sides.first) sides.L.holes.push({ x, y, dia, depth: 12, kind });
    else if (sides.dividerL) sides.dividerL.holes.push({ x, y: clamp(y - rowY, 8, sides.dividerL.h - 8), dia, depth: 12, kind });
  };
  const drillRight = (x, y, dia, kind) => {
    if (sides.last) sides.R.holes.push({ x: D - x, y, dia, depth: 12, kind });
    else if (sides.dividerR) sides.dividerR.holes.push({ x: D - x, y: clamp(y - rowY, 8, sides.dividerR.h - 8), dia, depth: 12, kind });
  };
  const bank = hasDr ? drawerBank(col, rowH, S2) : { y: 0, h: 0 };
  const aboveBank = col.drawerAlign !== "top";
  const shelfZoneY = y0 + (aboveBank ? bank.y + bank.h : 0);
  const shelfZoneH = Math.max(0, aboveBank ? rowH - bank.y - bank.h : bank.y);
  if (col.shelves > 0 && shelfZoneH > 20) {
    const manual = col.shelfMode === "manual" && (col.shelfPositions?.length ?? 0) > 0;
    const positions = manual ? (col.shelfPositions ?? []).slice(0, col.shelves).map((y) => clamp(y, 4, shelfZoneH - 4)) : Array.from({ length: col.shelves }, (_, k) => shelfZoneH * (k + 1) / (col.shelves + 1));
    const gap = manual ? 0 : shelfGap(shelfZoneH, col.shelves, S2);
    mk({
      name: `Shelf${tag}`,
      w: lay.w - S2.shelfIncrease,
      h: D - S2.shelfFrontSetback,
      qty: col.shelves,
      material: "plywood",
      thickness: T,
      band: { top: true },
      note: manual ? `manual Y: ${positions.map((y) => Math.round(y)).join(", ")}mm${hasDr ? aboveBank ? " \xB7 above drawers" : " \xB7 below drawers" : ""} \xB7 banding: front` : `gap ~${Math.round(gap)}mm${hasDr ? aboveBank ? " \xB7 above drawers" : " \xB7 below drawers" : ""} \xB7 banding: front`,
      grain: true
    });
    const n = Math.max(1, Math.round(S2.shelfHolesPerSide));
    for (let k = 0; k < col.shelves; k++) {
      const sy = shelfZoneY + positions[k];
      for (let j = 0; j < n; j++) {
        const yy = clamp(sy + (j - (n - 1) / 2) * S2.shelfHoleSpacing, S2.bodyThk + 4, sides.L.h - S2.bodyThk - 4);
        [S2.shelfHoleCenter, D - S2.shelfHoleCenter].forEach((x) => {
          drillLeft(x, yy, S2.holeDiameter, "shelf");
          drillRight(x, yy, S2.holeDiameter, "shelf");
        });
      }
    }
  }
  if (hasDr && shelfZoneH > 20 && (col.shelves > 0 || col.splitter))
    mk({
      name: `Drawer splitter${tag}`,
      w: lay.w,
      h: D,
      material: "plywood",
      thickness: T,
      band: { top: true },
      note: `${aboveBank ? "separates the drawers from the space above" : "separates the drawers from the space below"} \xB7 banding: front`,
      grain: true
    });
  if (hasDr && col.splitter && (col.splitterShelves ?? 0) > 0 && shelfZoneH > 20) {
    const n = Math.max(1, Math.round(col.splitterShelves ?? 0));
    const manual = col.shelfMode === "manual" && (col.shelfPositions?.length ?? 0) > 0;
    const positions = manual ? (col.shelfPositions ?? []).slice(0, n).map((y) => clamp(y, 4, shelfZoneH - 4)) : Array.from({ length: n }, (_, k) => shelfZoneH * (k + 1) / (n + 1));
    mk({
      name: `Shelf above splitter${tag}`,
      w: lay.w - S2.shelfIncrease,
      h: D - S2.shelfFrontSetback,
      qty: n,
      material: "plywood",
      thickness: T,
      band: { top: true },
      note: manual ? `above drawer splitter \xB7 manual Y: ${positions.map((y) => Math.round(y)).join(", ")}mm \xB7 banding: front` : `above the drawer splitter \xB7 gap ~${Math.round(shelfGap(shelfZoneH, n, S2))}mm \xB7 banding: front`,
      grain: true
    });
    const per = Math.max(1, Math.round(S2.shelfHolesPerSide));
    for (let k = 0; k < n; k++) {
      const sy = shelfZoneY + positions[k];
      for (let j = 0; j < per; j++) {
        const yy = clamp(sy + (j - (per - 1) / 2) * S2.shelfHoleSpacing, S2.bodyThk + 4, sides.L.h - S2.bodyThk - 4);
        [S2.shelfHoleCenter, D - S2.shelfHoleCenter].forEach((x) => {
          drillLeft(x, yy, S2.holeDiameter, "shelf");
          drillRight(x, yy, S2.holeDiameter, "shelf");
        });
      }
    }
  }
  if (hasDr) {
    col.drawers.forEach((dr0, i) => {
      const dr = cab.isKitchen ? { ...dr0, hidden: false } : dr0;
      const pattern = cab.isKitchen ? normalizeSlidePatterns(S2.slideHolePatterns)["kitchen"] ?? KITCHEN_SLIDE_PATTERN : normalizeSlidePatterns(S2.slideHolePatterns)[String(Math.round(dr.slideDepthCm))] ?? getDrawerHolePattern(dr.slideDepthCm);
      const y = clamp(y0 + bank.y + effectiveDrawerHoleY(dr, col.drawers, cab.isKitchen, i, S2), 12, sides.L.h - 12);
      pattern.forEach((p) => {
        const xL = D - p;
        drillLeft(xL, y, S2.slideHoleDiameter, "slide");
        drillRight(xL, y, S2.slideHoleDiameter, "slide");
      });
      if (cab.isKitchen) genKitchenDrawer(S2, mk, dr, faceW, tag, i);
      else genStandardDrawer(S2, mk, dr, faceW, tag, i, cab.width, lay.w);
    });
  }
  const subs = col.sub ?? [];
  if (subs.length > 0) {
    const subH = rowH / subs.length;
    subs.forEach((sub, si) => {
      const stag = `${tag}.${si + 1}`;
      if (sub.drawers.length > 0) {
        sub.drawers.forEach((dr, di) => {
          const d2 = cab.isKitchen ? { ...dr, hidden: false } : dr;
          if (cab.isKitchen) genKitchenDrawer(S2, mk, d2, lay.w, stag, di);
          else genStandardDrawer(S2, mk, d2, lay.w, stag, di);
        });
      } else if (sub.fixed) {
        mk({
          name: `Fixed panel${stag}`,
          w: lay.w - 2 * S2.doorGap,
          h: subH - S2.doorGap,
          material: "mdf",
          thickness: S2.mdfThk,
          band: mdfBand(S2),
          grain: false,
          note: mdfBanded(S2) ? "sub-section MDF oak \xB7 banding: LWLW" : "sub-section MDF white \xB7 no banding"
        });
      } else if (sub.shelves > 0) {
        mk({
          name: `Shelf${stag}`,
          w: lay.w - S2.shelfIncrease,
          h: D - S2.shelfFrontSetback,
          qty: sub.shelves,
          material: "plywood",
          thickness: T,
          band: { top: true },
          grain: true,
          note: "sub-section shelf \xB7 banding: front"
        });
      }
      if (si < subs.length - 1)
        mk({
          name: `Sub divider${stag}`,
          w: lay.w,
          h: D,
          material: "plywood",
          thickness: T,
          band: { top: true },
          note: "sub-section divider \xB7 banding: front"
        });
    });
  }
  const allHidden = hasDr && col.drawers.every((d) => d.hidden);
  const suppressed = sides.suppressAllDoors === true || !!sides.suppressDoor && col.door && !col.door.full;
  if (col.door && !col.fixed && (!hasDr || allHidden) && !suppressed)
    genDoor(S2, mk, col.door, faceW, col.door.full && sides.fullH ? sides.fullH : rowH, tag);
  if (col.fixed)
    mk({
      name: `Fixed panel${tag}`,
      w: faceW - 2 * S2.doorGap,
      h: rowH - S2.doorGap,
      material: "mdf",
      thickness: S2.mdfThk,
      band: mdfBand(S2),
      grain: false,
      note: mdfBanded(S2) ? "MDF oak \xB7 banding: LWLW" : "MDF white \xB7 no banding"
    });
  if (col.mdfBack) {
    const thk = Math.max(6, col.mdfBackThk || S2.mdfThk);
    mk({
      name: `MDF back panel${tag}`,
      w: faceW,
      h: rowH,
      material: "mdf",
      thickness: thk,
      band: {},
      grain: false,
      note: `niche back \xB7 ${thk}mm \xB7 mounted in front of the back panel (no banding)`
    });
  }
  const rail = col.rail ?? "off";
  if (rail !== "off" && col.railShelf) {
    const rh = col.railHeight ?? (rail === "suits" ? S2.railSuitsH : rail === "dresses" ? S2.railDressesH : S2.railDouble1);
    const count = Math.max(1, Math.round(col.railShelfCount ?? 1));
    const firstY = rh + (S2.railShelfGap || 60);
    if (firstY < rowH - 10) {
      const ys = [firstY];
      const above = Math.max(0, rowH - firstY);
      for (let k = 1; k < count; k++) ys.push(firstY + above * k / Math.max(1, count));
      mk({
        name: `Shelf above rail${tag}`,
        w: lay.w - S2.shelfIncrease,
        h: D - S2.shelfFrontSetback,
        qty: count,
        material: "plywood",
        thickness: T,
        band: { top: true },
        note: `above ${rail} rail \xB7 #1 at ${Math.round(firstY)}mm + ${count - 1} more above \xB7 banding: front`,
        grain: true
      });
      const n = Math.max(1, Math.round(S2.shelfHolesPerSide));
      for (let k = 0; k < count; k++) {
        for (let j = 0; j < n; j++) {
          const yy = clamp(y0 + ys[k] + (j - (n - 1) / 2) * S2.shelfHoleSpacing, S2.bodyThk + 4, y0 + rowH - S2.bodyThk - 4);
          [S2.shelfHoleCenter, D - S2.shelfHoleCenter].forEach((x) => {
            drillLeft(x, yy, S2.holeDiameter, "shelf");
            drillRight(x, yy, S2.holeDiameter, "shelf");
          });
        }
      }
    }
  }
}
var clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
function genStandardDrawer(S2, mk, dr, faceW, tag, i, cabOuterW, sectionW) {
  const { boxD, sideH, fbH, slideMm } = drawerBoxDims(faceW, dr, S2);
  const dt = S2.drawerThk;
  const label = dr.hidden ? "Hidden drawer" : "Drawer";
  const secW = sectionW ?? faceW;
  const outerW = cabOuterW ?? faceW;
  if (dr.frontMdf) {
    if (dr.hidden) {
      mk({
        name: `${label} front${tag} #${i + 1}`,
        w: Math.max(60, secW - S2.hiddenFrontDeduct),
        h: dr.frontHeight - S2.doorGap,
        material: "mdf",
        thickness: S2.mdfThk,
        band: mdfBand(S2),
        grain: false,
        note: `inlaid ${S2.hiddenFrontInset}mm inside \xB7 section width \u2212 ${S2.hiddenFrontDeduct} \xB7 ${mdfBanded(S2) ? "MDF oak \xB7 banding: LWLW" : "MDF white \xB7 no banding"}`
      });
    } else {
      mk({
        name: `${label} front${tag} #${i + 1}`,
        w: faceW - 2 * S2.doorGap,
        h: dr.frontHeight - S2.doorGap,
        material: "mdf",
        thickness: S2.mdfThk,
        band: mdfBand(S2),
        grain: false,
        note: `inlaid ${S2.hiddenFrontInset}mm inside \xB7 ${slideMm}mm slide \xB7 ${mdfBanded(S2) ? "MDF oak \xB7 banding: LWLW" : "MDF white \xB7 no banding"}`
      });
    }
  }
  const grooveLen = Math.max(20, boxD - S2.grooveShorter);
  const gInset = (boxD - grooveLen) / 2;
  const side = mk({
    name: `${label} side${tag} #${i + 1}`,
    w: boxD,
    h: sideH,
    qty: 2,
    material: "plywood",
    thickness: dt,
    band: { top: true },
    note: `groove ${S2.grooveWidth}mm \xD7 ${Math.round(grooveLen)}mm (slider ${Math.round(boxD)}mm \u2212 ${S2.grooveShorter}) @ ${S2.grooveFromBottom}mm from bottom`
  });
  const gy = S2.grooveFromBottom;
  side.grooves.push({ x1: gInset, y1: gy, x2: gInset + grooveLen, y2: gy + S2.grooveWidth, width: S2.grooveWidth });
  const fbW = Math.max(60, outerW - S2.drawerBoxFrontDeduct - S2.drawerBoxBackDeduct - (dr.hidden ? S2.drawerBoxHiddenExtra : 0));
  const back = mk({
    name: `${label} box back${tag} #${i + 1}`,
    w: fbW,
    h: fbH,
    material: "plywood",
    thickness: dt,
    note: `outer width \u2212 ${S2.drawerBoxFrontDeduct} \u2212 ${S2.drawerBoxBackDeduct}${dr.hidden ? ` \u2212 ${S2.drawerBoxHiddenExtra} (hidden)` : ""}`
  });
  back.holes.push({ x: 7, y: 7, dia: 6, depth: dt, kind: "shelf" });
  back.holes.push({ x: fbW - 7, y: 7, dia: 6, depth: dt, kind: "shelf" });
  mk({
    name: `${label} box front${tag} #${i + 1}`,
    w: fbW,
    h: fbH,
    material: "plywood",
    thickness: dt,
    note: `outer width \u2212 33 \u2212 49${dr.hidden ? " \u2212 50 (hidden)" : ""}`
  });
  const botW = fbW + 18;
  mk({ name: `${label} bottom${tag} #${i + 1}`, w: botW, h: boxD, material: "back", thickness: S2.backThk, grain: false });
}
function genKitchenDrawer(S2, mk, dr, faceW, tag, i) {
  const label = dr.hidden ? "Hidden kitchen drawer" : "Kitchen drawer";
  if (dr.frontMdf)
    mk({
      name: `${label} front${tag} #${i + 1}`,
      w: faceW - 2 * S2.doorGap,
      h: dr.frontHeight - S2.doorGap,
      material: "mdf",
      thickness: S2.mdfThk,
      band: mdfBand(S2),
      grain: false,
      note: `inlaid ${S2.hiddenFrontInset}mm inside \xB7 kitchen \xB7 ${mdfBanded(S2) ? "MDF oak \xB7 banding: LWLW" : "MDF white \xB7 no banding"}`
    });
  mk({
    name: `${label} bottom${tag} #${i + 1}`,
    w: Math.max(120, faceW - 108 - (dr.hidden ? 50 : 0)),
    h: 495,
    material: "plywood",
    thickness: S2.bodyThk,
    grain: false,
    note: `forced ${KITCHEN_SLIDE_CM * 10}mm slide`
  });
  mk({
    name: `${label} back${tag} #${i + 1}`,
    w: Math.max(120, faceW - 120 - (dr.hidden ? 50 : 0)),
    h: dr.frontHeight <= 200 ? 68 : 183,
    material: "plywood",
    thickness: S2.bodyThk
  });
}
function genCabinetFullDoor(S2, mk, cab) {
  const fd = cab.fullDoor;
  if (!fd || fd === "off") return;
  const kick = kickH(cab, S2);
  const BH = cab.height - kick;
  const door = {
    type: cab.width > 620 ? "double" : "single",
    style: "overlay",
    swing: "left",
    material: fd === "mdf" ? "mdf" : "glass",
    finish: S2.mdfFinish,
    mdfThk: S2.mdfThk,
    hingeBrand: "Universal 35mm",
    hasHandle: true,
    handlePos: "center",
    full: true,
    hingeCount: cab.fullDoorHinges
  };
  genDoor(S2, mk, door, cab.width, BH, " CABINET");
}
function genDoor(S2, mk, door, faceW, rowH, tag) {
  if (door.material === "glass") return;
  const { w: dw, h: dh, count } = doorDims(faceW, rowH, door, S2);
  const { mat, thk } = doorMaterial(door, S2);
  const matNote = door.material === "mdf" ? `MDF ${thk}mm` : `Plywood ${thk}mm`;
  const fullNote = door.full ? " \xB7 FULL HEIGHT (spans all boxes)" : "";
  const finish = door.material === "mdf" ? door.finish ?? S2.mdfFinish : "white";
  const band = door.material === "mdf" ? mdfBand(S2, finish) : { top: true, bottom: true, left: true, right: true };
  const finishNote = door.material === "mdf" ? finish === "oak" ? " \xB7 MDF oak \xB7 banding: LWLW" : " \xB7 MDF white \xB7 no banding" : " \xB7 banding: LWLW";
  const nHinges = effectiveHingeCount(door, dh);
  const cupYs = [];
  for (let k = 0; k < nHinges; k++) cupYs.push(nHinges === 1 ? dh / 2 : 70 + k * (dh - 140) / (nHinges - 1));
  const cupX = (j) => {
    const hingedLeft = count === 1 ? door.swing === "left" : j === 0;
    return hingedLeft ? S2.hingeCupEdge : dw - S2.hingeCupEdge;
  };
  const grain = mat === "plywood" || mat === "mdf" && finish === "oak";
  for (let j = 0; j < count; j++) {
    const nm = door.type === "sliding" ? `Sliding door${tag} #${j + 1}` : `Door${tag}${count === 2 ? j === 0 ? " L" : " R" : ""}`;
    const holes = cupYs.map((y) => ({ x: cupX(j), y, dia: S2.hingeCupDiameter, depth: S2.hingeCupDepth, kind: "hinge" }));
    mk({
      name: nm,
      w: dw,
      h: dh,
      material: mat,
      thickness: thk,
      band,
      grain,
      holes,
      note: `${door.style} \xB7 ${matNote}${nHinges ? ` \xB7 ${nHinges}\xD7 Universal 35mm hinge \xD8${S2.hingeCupDiameter} cup` : " \xB7 sliding track"}${door.hasHandle ? " \xB7 handle" : ""}${finishNote}${fullNote}`
    });
  }
}
function buildCorner(cab, S2, mk, T) {
  const kick = kickH(cab, S2);
  const BH = cab.height - kick;
  const W = cab.width;
  const D = cab.depth;
  const K = Math.min(220, Math.round(Math.min(W, D) * 0.32));
  const Ld = Math.round(Math.hypot(W - K, D - K));
  mk({ name: "Back panel R (wall)", w: W, h: BH, material: "plywood", thickness: T, band: { top: true } });
  mk({ name: "Back panel L (wall)", w: D, h: BH, material: "plywood", thickness: T, band: { top: true } });
  const bot = mk({ name: "Bottom (pentagon)", w: W, h: D, material: "plywood", thickness: T, grain: false, note: "5-sided" });
  bot.shape = "poly";
  bot.outline = pentagonOutline(W, D, K);
  if (cab.type === "cornerWall") {
    const top = mk({ name: "Top (pentagon)", w: W, h: D, material: "plywood", thickness: T, grain: false, note: "5-sided" });
    top.shape = "poly";
    top.outline = pentagonOutline(W, D, K);
  }
  if (kick) {
    mk({
      name: "Toe kick front",
      w: Ld - 20,
      h: S2.kickHeight,
      material: "plywood",
      thickness: T,
      matId: defaultPlyId(S2),
      note: "no banding \u2014 matches standard kick"
    });
    mk({
      name: "Toe kick side",
      w: Math.max(20, D - S2.kickDepth),
      h: S2.kickHeight,
      qty: 2,
      material: "plywood",
      thickness: T,
      matId: defaultPlyId(S2),
      note: "full-depth side"
    });
  }
  cab.rows.forEach((row2, ri) => {
    const col = row2.columns[0];
    if (!col) return;
    if (col.shelves > 0 && !columnHasDrawers(col)) {
      const sh = mk({
        name: `Corner shelf R${ri + 1}`,
        w: W - 2 * T - 4,
        h: D - 2 * T - 4,
        qty: col.shelves,
        material: "plywood",
        thickness: T,
        grain: false,
        note: "5-sided"
      });
      sh.shape = "poly";
      sh.outline = pentagonOutline(sh.w, sh.h, K);
    }
    if (col.door) genDoor(S2, mk, col.door, Ld, row2.h, ` R${ri + 1}`);
    if (columnHasDrawers(col)) col.drawers.forEach((dr, i) => genStandardDrawer(S2, mk, dr, Ld, ` R${ri + 1}`, i));
  });
}
function rotatePartOnce(p) {
  const w = p.w;
  const rot = ([x, y]) => [y, w - x];
  return {
    ...p,
    w: p.h,
    h: p.w,
    // band edges are physical — remap them through the 90° rotation so the cut
    // list labels (and the DXF banding markers) stay on the true edges:
    // Top→Right, Right→Bottom, Bottom→Left, Left→Top
    band: { top: p.band.right, right: p.band.bottom, bottom: p.band.left, left: p.band.top },
    holes: p.holes.map((h) => {
      const [x, y] = rot([h.x, h.y]);
      return { ...h, x, y };
    }),
    grooves: p.grooves.map((g) => {
      const [x1, y1] = rot([g.x1, g.y1]);
      const [x2, y2] = rot([g.x2, g.y2]);
      return { ...g, x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
    }),
    outline: p.outline.length > 2 ? p.outline.map(rot) : p.outline,
    note: p.note ? `${p.note} \xB7 rotated 90\xB0` : "rotated 90\xB0"
  };
}
function applyGrain(parts, S2, ov = {}) {
  return parts.map((p) => {
    const id = partId(p);
    const locked = id in ov ? ov[id] : S2.grainLock ? true : p.grain;
    return { ...p, grain: locked };
  });
}
function allParts(cabs, S2, ov = {}) {
  const panelParts = generatePanelParts(S2).map(rotatePartOnce);
  const rotated = cabs.flatMap((c) => generateCabinetParts(c, S2)).map(rotatePartOnce);
  return applyGrain([...panelParts, ...rotated], S2, ov);
}
function drillOps(cabs, S2) {
  const ops = [];
  allParts(cabs, S2).forEach((p) => {
    for (let i = 0; i < p.qty; i++) {
      p.holes.forEach(
        (h) => ops.push({ cabName: p.cabName, part: p.name, material: p.material, instance: i + 1, x: h.x, y: h.y, dia: h.dia, depth: h.depth, type: h.kind })
      );
      p.grooves.forEach(
        (g) => ops.push({ cabName: p.cabName, part: p.name, material: p.material, instance: i + 1, x: -1, y: g.y1, dia: g.width, depth: 8, type: g.kind === "slot" ? "slot" : "groove" })
      );
    }
  });
  return ops;
}
function totalBandingM(cabs, S2) {
  let band = 0;
  allParts(cabs, S2).forEach((p) => {
    band += ((p.band.top ? p.w : 0) + (p.band.bottom ? p.w : 0) + (p.band.left ? p.h : 0) + (p.band.right ? p.h : 0)) * p.qty;
  });
  return band / 1e3;
}
function validateCabinet(c, S2) {
  const out = [];
  const BH = boxHeight(c, S2);
  const sum = c.rows.reduce((a, r) => a + r.h, 0);
  if (stackOn(c)) {
    const heights = stackedHeights(c);
    if (Math.abs(stackTotal(c) - c.height) > 0.5)
      out.push({ level: "err", msg: `Boxes \u03A3 ${Math.round(stackTotal(c))}mm \u2260 cabinet height ${Math.round(c.height)}mm` });
    heights.forEach((bh, bi) => {
      const bsum = c.rows.filter((r) => (r.box ?? 0) === bi).reduce((a, r) => a + r.h, 0);
      const target = bi === 0 ? bh - kickH(c, S2) : bh;
      if (Math.abs(bsum - target) > 0.5)
        out.push({
          level: "err",
          msg: `Box ${bi + 1}: rows \u03A3 ${Math.round(bsum)}mm \u2260 box ${Math.round(target)}mm = ${Math.round(Math.abs(target - bsum))}mm ${bsum < target ? "missing" : "over"}`
        });
    });
    if (c.rows.some((r) => (r.box ?? 0) >= heights.length))
      out.push({ level: "err", msg: "A row is assigned to a box that no longer exists" });
  } else if (Math.abs(sum - BH) > 0.5) {
    const diff = Math.round(Math.abs(BH - sum));
    const dir = sum < BH ? "missing" : "over";
    out.push({ level: "err", msg: `Row heights \u03A3 ${Math.round(sum)}mm \u2260 box height ${Math.round(BH)}mm = ${diff}mm ${dir}` });
  }
  if (c.width <= 0 || c.height <= 0 || c.depth <= 0) out.push({ level: "err", msg: "Dimensions must be greater than zero" });
  if (c.rows.length === 0) out.push({ level: "warn", msg: "No rows defined \u2014 empty carcass" });
  if (isNotched(c.type)) {
    if (c.type === "L" && (c.lCutW <= 0 || c.lCutH <= 0)) out.push({ level: "warn", msg: "L notch is zero \u2014 panel will be a plain rectangle" });
    if (c.type === "C" && c.cCutOffsetFromBottom + c.cCutMidH > BH - c.cCutTopH)
      out.push({ level: "warn", msg: "C mid notch overlaps the top notch \u2014 it will be clipped" });
  }
  if ((c.slot ?? "none") !== "none" && (isCorner(c.type) || isNotched(c.type)))
    out.push({ level: "warn", msg: "Linear slot is skipped on corner / notched side panels" });
  c.rows.forEach((r, i) => {
    const lays = columnLayout(c, r, S2);
    const used = lays.reduce((a, l) => a + l.w, 0) + Math.max(0, lays.length - 1) * S2.bodyThk;
    if (lays.length > 1 && used > c.width - 2 * S2.bodyThk + 1)
      out.push({ level: "err", msg: `Row ${i + 1}: columns \u03A3 ${Math.round(used)}mm exceed inner width ${Math.round(c.width - 2 * S2.bodyThk)}mm` });
    lays.forEach((lay, ci) => {
      const col = lay.col;
      const label = lays.length > 1 ? `Row ${i + 1} col ${ci + 1}` : `Row ${i + 1}`;
      const faceW = lays.length === 1 ? c.width : columnFaceWidth(c, lay, S2);
      if (columnHasDrawers(col)) {
        const fh = col.drawers.reduce((a, d) => a + d.frontHeight, 0);
        if (Math.abs(fh - r.h) > 20) out.push({ level: "warn", msg: `${label}: drawer fronts \u03A3${Math.round(fh)}mm vs row ${Math.round(r.h)}mm` });
        col.drawers.forEach((d) => {
          if (!c.isKitchen && d.slideDepthCm * 10 > c.depth) out.push({ level: "warn", msg: `${label}: ${d.slideDepthCm * 10}mm slide deeper than cabinet (${c.depth}mm)` });
        });
        if (findNearestDrawerDepth(c.depth) < 25) out.push({ level: "warn", msg: `${label}: too shallow for any slide` });
      } else if (col.door && !col.fixed) {
        const { w: dw, h: dh } = doorDims(faceW, r.h, col.door, S2);
        if (dw < 130) out.push({ level: "warn", msg: `${label}: door leaf ${Math.round(dw)}mm wide (too narrow)` });
        if (dw > 620) out.push({ level: "warn", msg: `${label}: door leaf ${Math.round(dw)}mm wide (consider double)` });
        if (dh >= 900 && doorHingeCount(dh) < 3) out.push({ level: "warn", msg: `${label}: tall door needs 3 hinges` });
      }
      if (!columnHasDrawers(col) && col.shelves > 0) {
        const gap = shelfGap(r.h, col.shelves, S2);
        if (gap < S2.shelfGapMin - 25 || gap > S2.shelfGapMax + 25)
          out.push({ level: "warn", msg: `${label}: shelf gap ${Math.round(gap)}mm outside ${S2.shelfGapMin}\u2013${S2.shelfGapMax}mm` });
      }
    });
  });
  return out;
}

// src/lib/nesting.ts
function sheetDimsFor(material, S2) {
  if (material === "mdf" && S2.mdfSheet === "3050x1220") return { w: 3050, h: 1220 };
  return { w: S2.sheetW, h: S2.sheetH };
}
function scoreOf(unplaced, sheets, sheetArea) {
  const used = sheets.reduce((a, s) => a + s.usedArea, 0);
  return [unplaced, sheets.length, sheets.length * sheetArea - used];
}
function layoutIsValid(sheets, SW, SH) {
  const EPS = 0.01;
  for (const s of sheets) {
    const p = s.placed;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      if (a.x < -EPS || a.y < -EPS || a.x + a.w > SW + EPS || a.y + a.h > SH + EPS) return false;
      for (let j = i + 1; j < p.length; j++) {
        const b = p[j];
        if (a.x + a.w > b.x + EPS && b.x + b.w > a.x + EPS && a.y + a.h > b.y + EPS && b.y + b.h > a.y + EPS) return false;
      }
    }
  }
  return true;
}
var better = (a, b) => a[0] < b[0] || a[0] === b[0] && (a[1] < b[1] || a[1] === b[1] && a[2] < b[2]);
var SORTS = {
  height_desc: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  height_width: (a, b) => b.h - a.h || b.w - a.w,
  area_desc: (a, b) => b.w * b.h - a.w * a.h,
  width_desc: (a, b) => b.w - a.w || b.h - a.h,
  max_side: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
  perimeter: (a, b) => 2 * (b.w + b.h) - 2 * (a.w + a.h)
};
var SHELF_SORTS = ["height_desc", "height_width", "area_desc", "width_desc", "max_side", "perimeter"];
var MR_SORTS = ["area_desc", "height_desc", "width_desc", "perimeter"];
var MR_HEUR = ["BAF", "BSSF", "BLSF"];
var GUILLOTINE_SPLITS = ["SAS", "SLAS"];
function shelfPack(itemsIn, SW, SH, sortKey, allowRot, clr, maxSheets, fullThreshold, minOff) {
  const items = [...itemsIn].sort(SORTS[sortKey]);
  const sheets = [];
  let sheet = newShell(sheets.length);
  let cursorX = 0;
  let cursorY = 0;
  let shelfH = 0;
  let shelfRightMin = Infinity;
  let usedY = 0;
  const unplaced = [];
  const newSheet = () => {
    finalizeShelfSheet(sheet, SW, SH, shelfRightMin, usedY, clr, fullThreshold, minOff);
    sheets.push(sheet);
    sheet = newShell(sheets.length);
    cursorX = 0;
    cursorY = 0;
    shelfH = 0;
    shelfRightMin = Infinity;
    usedY = 0;
  };
  const flushShelf = () => {
    if (cursorX > 0) {
      shelfRightMin = Math.min(shelfRightMin, cursorX - clr);
      cursorY += shelfH + clr;
      usedY = Math.max(usedY, cursorY);
      cursorX = 0;
      shelfH = 0;
    }
  };
  for (const it of items) {
    const canRot = allowRot && !it.part.grain;
    const opts = [];
    if (it.w <= SW && it.h <= SH) opts.push({ w: it.w, h: it.h, rot: false });
    if (canRot && it.h <= SW && it.w <= SH && it.w !== it.h) opts.push({ w: it.h, h: it.w, rot: true });
    opts.sort((a, b) => a.h - b.h);
    let placed = false;
    for (let guard = 0; guard < 400 && !placed; guard++) {
      for (const o of opts) {
        if (cursorX + o.w <= SW && (shelfH === 0 || o.h <= shelfH)) {
          sheet.placed.push({ part: it.part, x: cursorX, y: cursorY, w: o.w, h: o.h, rotated: o.rot });
          sheet.usedArea += it.w * it.h;
          cursorX += o.w + clr;
          shelfH = Math.max(shelfH, o.h);
          placed = true;
          break;
        }
      }
      if (placed) break;
      flushShelf();
      if (usedY > SH || cursorX === 0 && shelfH === 0 && sheet.placed.length > 0) {
        if (sheets.length + 1 >= maxSheets) {
          unplaced.push(it);
          placed = true;
          break;
        }
        newSheet();
      }
    }
    if (!placed) unplaced.push(it);
  }
  for (let i = unplaced.length - 1; i >= 0; i--) {
    const it = unplaced[i];
    const canRot2 = allowRot && !it.part.grain;
    const opts = [{ w: it.w, h: it.h, rot: false }];
    if (canRot2 && it.w !== it.h) opts.push({ w: it.h, h: it.w, rot: true });
    outer: for (const s of sheets) {
      const bands = /* @__PURE__ */ new Map();
      s.placed.forEach((p) => {
        const b = bands.get(p.y) ?? { h: 0, right: 0 };
        b.h = Math.max(b.h, p.h);
        b.right = Math.max(b.right, p.x + p.w);
        bands.set(p.y, b);
      });
      for (const [by, b] of bands) {
        for (const o of opts) {
          if (o.h <= b.h && b.right + clr + o.w <= SW) {
            s.placed.push({ part: it.part, x: b.right + clr, y: by, w: o.w, h: o.h, rotated: o.rot });
            s.usedArea += it.w * it.h;
            b.right += clr + o.w;
            unplaced.splice(i, 1);
            break outer;
          }
        }
      }
    }
  }
  finalizeShelfSheet(sheet, SW, SH, shelfRightMin, usedY, clr, fullThreshold, minOff);
  sheets.push(sheet);
  return { sheets, unplaced };
}
function maxRectsPack(itemsIn, SW, SH, sortKey, heur, allowRot, clr, maxSheets, minOff) {
  const items = [...itemsIn].sort(SORTS[sortKey]);
  const unplaced = [];
  const open = [{ sheet: newShell(0), free: [{ x: 0, y: 0, w: SW, h: SH }] }];
  for (const it of items) {
    const pw = it.w + clr;
    const ph = it.h + clr;
    const canRot = allowRot && !it.part.grain;
    const opts = canRot && it.w !== it.h ? [false, true] : [false];
    let best = null;
    for (let si = 0; si < open.length; si++) {
      for (const fr of open[si].free) {
        for (const rot of opts) {
          const w = rot ? ph : pw;
          const h = rot ? pw : ph;
          if (w > fr.w + 1e-6 || h > fr.h + 1e-6) continue;
          let score;
          if (heur === "BAF") score = fr.w * fr.h - w * h;
          else if (heur === "BSSF") score = Math.min(fr.w - w, fr.h - h);
          else score = Math.max(fr.w - w, fr.h - h);
          score += si * 1e-4;
          if (!best || score < best.score) best = { si, rect: fr, w, h, rot, score };
        }
      }
    }
    if (!best) {
      if (open.length >= maxSheets) {
        unplaced.push(it);
        continue;
      }
      const fits = pw <= SW && ph <= SH;
      const fitsRot = canRot && ph <= SW && pw <= SH;
      if (!fits && !fitsRot) {
        unplaced.push(it);
        continue;
      }
      const rot = !fits && fitsRot;
      const shell = { sheet: newShell(open.length), free: [{ x: 0, y: 0, w: SW, h: SH }] };
      open.push(shell);
      const w = rot ? ph : pw;
      const h = rot ? pw : ph;
      place(it, w, h, rot, shell.free[0], shell.sheet);
      splitFree(shell.free, w, h, shell.free[0]);
      continue;
    }
    const tgt = open[best.si];
    place(it, best.w, best.h, best.rot, best.rect, tgt.sheet);
    splitFree(tgt.free, best.w, best.h, best.rect);
  }
  const sheets = open.map((o) => o.sheet);
  const freeFinal = open.map((o) => o.free.filter((f) => f.w >= minOff && f.h >= minOff));
  return { sheets, unplaced, freeFinal };
  function place(it, w, h, rot, fr, s) {
    s.placed.push({ part: it.part, x: fr.x, y: fr.y, w: w - clr, h: h - clr, rotated: rot });
    s.usedArea += it.w * it.h;
  }
  function splitFree(freeRects, w, h, at) {
    const rx = at ? at.x : 0;
    const ry = at ? at.y : 0;
    const next = [];
    for (const fr of freeRects) {
      if (fr.x >= rx + w || fr.x + fr.w <= rx || fr.y >= ry + h || fr.y + fr.h <= ry) {
        next.push(fr);
        continue;
      }
      if (fr.x + fr.w > rx + w) next.push({ x: rx + w, y: fr.y, w: fr.x + fr.w - (rx + w), h: fr.h });
      if (fr.y + fr.h > ry + h) next.push({ x: fr.x, y: ry + h, w: fr.w, h: fr.y + fr.h - (ry + h) });
      if (fr.x < rx) next.push({ x: fr.x, y: fr.y, w: rx - fr.x, h: fr.h });
      if (fr.y < ry) next.push({ x: fr.x, y: fr.y, w: fr.w, h: ry - fr.y });
    }
    const pruned = [];
    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      if (a.w < 30 || a.h < 30) continue;
      let contained = false;
      for (let j = 0; j < next.length; j++) {
        if (i === j) continue;
        const b = next[j];
        if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
          contained = true;
          break;
        }
      }
      if (!contained) pruned.push(a);
    }
    freeRects.length = 0;
    freeRects.push(...pruned);
  }
}
function guillotinePack(itemsIn, SW, SH, sortKey, split, allowRot, clr, maxSheets, minOff) {
  const items = [...itemsIn].sort(SORTS[sortKey]);
  const unplaced = [];
  const open = [{ sheet: newShell(0), free: [{ x: 0, y: 0, w: SW, h: SH }] }];
  const mergeFree = (free) => {
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i];
        const b = free[j];
        if (Math.abs(a.y - b.y) < 0.01 && Math.abs(a.h - b.h) < 0.01) {
          if (Math.abs(a.x + a.w - b.x) < 0.01) {
            a.w += b.w;
            free.splice(j, 1);
            i = -1;
            break;
          }
          if (Math.abs(b.x + b.w - a.x) < 0.01) {
            a.x = b.x;
            a.w += b.w;
            free.splice(j, 1);
            i = -1;
            break;
          }
        }
        if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.w - b.w) < 0.01) {
          if (Math.abs(a.y + a.h - b.y) < 0.01) {
            a.h += b.h;
            free.splice(j, 1);
            i = -1;
            break;
          }
          if (Math.abs(b.y + b.h - a.y) < 0.01) {
            a.y = b.y;
            a.h += b.h;
            free.splice(j, 1);
            i = -1;
            break;
          }
        }
      }
    }
  };
  for (const it of items) {
    const pw = it.w + clr;
    const ph = it.h + clr;
    const canRot = allowRot && !it.part.grain && it.w !== it.h;
    let best = null;
    for (let si = 0; si < open.length; si++) {
      const free = open[si].free;
      for (let fi = 0; fi < free.length; fi++) {
        const fr2 = free[fi];
        const opts = [[pw, ph, false]];
        if (canRot) opts.push([ph, pw, true]);
        for (const [w, h, rot] of opts) {
          if (w > fr2.w + 1e-6 || h > fr2.h + 1e-6) continue;
          const score = Math.min(fr2.w - w, fr2.h - h) * 1e3 + (fr2.w * fr2.h - w * h) * 1e-3 + si;
          if (!best || score < best.score) best = { si, fi, w, h, rot, score };
        }
      }
    }
    if (!best) {
      const fits = pw <= SW && ph <= SH;
      const fitsRot = canRot && ph <= SW && pw <= SH;
      if (!fits && !fitsRot || open.length >= maxSheets) {
        unplaced.push(it);
        continue;
      }
      open.push({ sheet: newShell(open.length), free: [{ x: 0, y: 0, w: SW, h: SH }] });
      best = { si: open.length - 1, fi: 0, w: fits ? pw : ph, h: fits ? ph : pw, rot: !fits, score: 0 };
    }
    const tgt = open[best.si];
    const fr = tgt.free[best.fi];
    tgt.sheet.placed.push({ part: it.part, x: fr.x, y: fr.y, w: best.w - clr, h: best.h - clr, rotated: best.rot });
    tgt.sheet.usedArea += it.w * it.h;
    const restW = fr.w - best.w;
    const restH = fr.h - best.h;
    const horizontal = split === "SAS" ? restW <= restH : restW > restH;
    const next = [];
    if (horizontal) {
      if (restW > 0) next.push({ x: fr.x + best.w, y: fr.y, w: restW, h: best.h });
      if (restH > 0) next.push({ x: fr.x, y: fr.y + best.h, w: fr.w, h: restH });
    } else {
      if (restW > 0) next.push({ x: fr.x + best.w, y: fr.y, w: restW, h: fr.h });
      if (restH > 0) next.push({ x: fr.x, y: fr.y + best.h, w: best.w, h: restH });
    }
    tgt.free.splice(best.fi, 1, ...next);
    for (let i = tgt.free.length - 1; i >= 0; i--) {
      if (tgt.free[i].w < 20 || tgt.free[i].h < 20) tgt.free.splice(i, 1);
    }
    mergeFree(tgt.free);
  }
  return {
    sheets: open.map((o) => o.sheet),
    unplaced,
    freeFinal: open.map((o) => o.free.filter((f) => f.w >= minOff && f.h >= minOff))
  };
}
function newShell(index) {
  return { index, key: "", material: "plywood", matId: null, thickness: 0, sheetW: 0, sheetH: 0, placed: [], offcuts: [], util: 0, usedArea: 0, strategy: "" };
}
function finalizeShelfSheet(sheet, SW, SH, rightMin, usedY, clr, fullThreshold, minOff) {
  sheet.util = sheet.usedArea / (SW * SH);
  if (sheet.util >= fullThreshold) return;
  const rightX = isFinite(rightMin) ? rightMin : 0;
  if (SW - rightX >= minOff && usedY >= minOff) sheet.offcuts.push({ x: rightX, y: 0, w: SW - rightX, h: Math.max(0, usedY - clr) });
  if (SH - usedY >= minOff) sheet.offcuts.push({ x: 0, y: usedY, w: SW, h: SH - usedY });
}
var toUnplaced = (items = [], S2) => items.map((it) => {
  const maxSide = Math.max(it.w, it.h);
  const sheetMax = Math.max(S2.sheetW, S2.sheetH) - 2 * S2.sheetMargin;
  const reason = maxSide > sheetMax ? `too large for the sheet (${Math.round(maxSide)}mm > ${Math.round(sheetMax)}mm)` : it.part.grain ? "no space left with grain locked (rotation not allowed)" : "sheet limit reached \u2014 increase max sheets";
  return {
    name: it.part.name,
    cabName: it.part.cabName,
    w: it.part.w,
    h: it.part.h,
    material: it.part.material,
    thickness: it.part.thickness,
    reason
  };
});
function nestGroupSync(items, key, S2) {
  const m = S2.sheetMargin;
  const SW = S2.sheetW - 2 * m;
  const SH = S2.sheetH - 2 * m;
  const clr = S2.partClearance || S2.bitDiameter * 1.05;
  const allowRot = !S2.grainLock;
  const sheetArea = SW * SH;
  const candidates = [];
  const push = (res, strategy) => {
    if (!layoutIsValid(res.sheets, SW, SH)) return;
    const sc = scoreOf(res.unplaced.length, res.sheets, sheetArea);
    candidates.push({ sheets: res.sheets, unplaced: res.unplaced.length, unplacedItems: res.unplaced, score: sc, strategy });
  };
  const rotOpts = allowRot ? [true, false] : [false];
  for (const rot of rotOpts) {
    for (const sort of SHELF_SORTS) {
      const res = shelfPack(items, SW, SH, sort, rot, clr, S2.maxSheets, S2.sheetFullThreshold, S2.minOffcut);
      push(res, `shelf/${sort}${rot ? "+rot" : ""}`);
    }
  }
  for (const rot of rotOpts) {
    for (const sort of MR_SORTS) {
      for (const heur of MR_HEUR) {
        const res = maxRectsPack(items, SW, SH, sort, heur, rot, clr, S2.maxSheets, S2.minOffcut);
        res.sheets.forEach((s, i) => s.offcuts = (res.freeFinal[i] ?? []).slice(0, 3));
        push({ sheets: res.sheets, unplaced: res.unplaced }, `maxrects/${sort}/${heur}${rot ? "+rot" : ""}`);
      }
    }
  }
  for (const rot of rotOpts) {
    for (const sort of MR_SORTS) {
      for (const sp of GUILLOTINE_SPLITS) {
        const res = guillotinePack(items, SW, SH, sort, sp, rot, clr, S2.maxSheets, S2.minOffcut);
        res.sheets.forEach((s, i) => s.offcuts = (res.freeFinal[i] ?? []).slice(0, 3));
        push({ sheets: res.sheets, unplaced: res.unplaced }, `guillotine/${sort}/${sp}${rot ? "+rot" : ""}`);
      }
    }
  }
  let best = candidates[0];
  candidates.forEach((c) => {
    if (better(c.score, best.score)) best = c;
  });
  const [mat, thk, mid] = key.split("@");
  best.sheets.forEach((s, idx) => {
    s.key = key;
    s.material = mat;
    s.matId = mid && mid !== "def" ? mid : null;
    s.thickness = parseFloat(thk);
    s.index = idx;
    s.strategy = best.strategy;
    s.util = s.usedArea / sheetArea;
  });
  const totalArea = items.reduce((a, i) => a + i.w * i.h, 0);
  return {
    key,
    material: mat,
    matId: mid && mid !== "def" ? mid : null,
    thickness: parseFloat(thk),
    sheets: best.sheets,
    partCount: items.length,
    totalArea,
    avgUtil: best.sheets.length ? best.sheets.reduce((a, s) => a + s.util, 0) / best.sheets.length : 0,
    unplaced: best.unplaced,
    unplacedParts: toUnplaced(best.unplacedItems, S2),
    strategy: best.strategy
  };
}
function groupParts(parts) {
  const groups = /* @__PURE__ */ new Map();
  parts.forEach((p) => {
    const key = `${p.material}@${p.thickness}@${p.matId ?? "def"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return groups;
}
function expand(parts) {
  const items = [];
  parts.forEach((p) => {
    for (let i = 0; i < p.qty; i++) items.push({ part: p, w: p.w, h: p.h });
  });
  return items;
}
function nestParts(parts, S2) {
  const out = [];
  groupParts(parts).forEach((plist, key) => {
    const dims = sheetDimsFor(key.split("@")[0], S2);
    let items = expand(plist);
    const S22 = { ...S2, sheetW: dims.w, sheetH: dims.h };
    if (S2.nestDirection === "Y") {
      items = items.map((i) => ({ ...i, w: i.h, h: i.w }));
      S22.sheetW = dims.h;
      S22.sheetH = dims.w;
    }
    const g = nestGroupSync(items, key, S22);
    g.sheets.forEach((s) => {
      s.sheetW = dims.w;
      s.sheetH = dims.h;
    });
    if (S2.nestDirection === "Y") {
      g.sheets.forEach((s) => {
        s.placed = s.placed.map((p) => ({ ...p, x: p.y, y: p.x, w: p.h, h: p.w, rotated: !p.rotated }));
      });
    }
    out.push(g);
  });
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

// tests/geometry.smoke.test.ts
var failures = 0;
var check = (label, ok, detail = "") => {
  if (ok) console.log("  PASS  " + label);
  else {
    failures++;
    console.log("  FAIL  " + label + (detail ? " \u2014 " + detail : ""));
  }
};
var S = { ...DEFAULT_SETTINGS };
{
  const c = makeCabinet("base", 600, 720, 600, "KickTest");
  c.hasToeKick = true;
  const parts = allParts([c], S);
  const kick = parts.filter((p) => p.name.includes("Toe kick"));
  const front = kick.find((p) => p.name.includes("front"));
  const side = kick.find((p) => p.name.includes("side"));
  check("kick exists on base unit", kick.length >= 2, `${kick.length}`);
  check("kick height = setting", !!front && Math.min(front.w, front.h) === S.kickHeight, `${front?.w}\xD7${front?.h}`);
  check("kick front w = 600\u22122\xD716.5", !!front && Math.max(front.w, front.h) === 567, `${front?.w}\xD7${front?.h}`);
  check("kick side w = carcassDepth\u221250", !!side && Math.min(side.w, side.h) === S.kickHeight && Math.max(side.w, side.h) === Math.round(carcassDepth(c, S)) - S.kickDepth, `${side?.w}\xD7${side?.h} (carcass=${Math.round(carcassDepth(c, S))})`);
  check("no kick on wall unit", allParts([makeCabinet("wall", 800, 720, 350, "W")], S).every((p) => !p.name.includes("Toe kick")));
  check("kickH helper", kickH(c, S) === S.kickHeight && kickH(makeCabinet("wall", 800, 720, 350, "W"), S) === 0);
}
{
  const c = makeCabinet("tall", 720, 2800, 600, "Wardrobe");
  c.hasToeKick = true;
  c.stack = [2e3, 800];
  c.rows = [
    { id: "r1", h: 1900, box: 0, columns: [] },
    { id: "r2", h: 800, box: 1, columns: [] }
  ];
  const parts = allParts([c], S);
  const named = (n) => parts.filter((p) => p.name.toLowerCase().includes(n.toLowerCase()) && !p.name.toLowerCase().includes("kick"));
  check("stacked: 4 side panels", named("Side").length === 4, `${named("Side").length}`);
  check("stacked: 2 tops", named("Top").length === 2, `${named("Top").length}`);
  check("stacked: 2 bottoms", named("Bottom").length === 2, `${named("Bottom").length}`);
  check("stacked: 2 backs", named("Back").length === 2, `${named("Back").length}`);
  check("stacked: no validation errors", validateCabinet(c, S).filter((v) => v.level === "err").length === 0);
  check("stackedHeights", JSON.stringify(stackedHeights(c)) === "[2000,800]");
  check("stackOn", stackOn(c) === true);
}
{
  const c = makeCabinet("base", 600, 720, 560, "Drw");
  const z = c.rows[0].columns[0];
  z.drawers = [{ id: "d1", hidden: false, frontHeight: 220, slideDepthCm: 35, frontMdf: true }];
  z.door = null;
  const ops = drillOps([c], S).filter((o) => o.type === "slide");
  const per = S.slideHolePatterns["35"].length;
  check("slide holes = pattern \xD7 2 side panels", ops.length === per * 2, `${ops.length} vs ${per * 2}`);
  const sides = allParts([c], S).filter((p) => p.name.toLowerCase().includes("side"));
  const inside = ops.every((o) => sides.some((sp) => o.x >= 0 && o.y >= 0 && o.x <= Math.max(sp.w, sp.h) && o.y <= Math.max(sp.w, sp.h)));
  check("slide holes within panel bounds", inside);
}
{
  const c = makeCabinet("base", 600, 720, 560, "Shf");
  const z = c.rows[0].columns[0];
  z.shelves = 2;
  z.drawers = [];
  const ops = drillOps([c], S).filter((o) => o.type === "shelf");
  const per = 2 * 2 * Math.max(1, Math.round(S.shelfHolesPerSide)) * 2;
  check("shelf pins count", ops.length === per, `${ops.length} vs ${per}`);
}
{
  const c = makeCabinet("base", 600, 720, 560, "ManY");
  const z = c.rows[0].columns[0];
  z.shelves = 1;
  z.drawers = [];
  z.shelfMode = "manual";
  z.shelfPositions = [240];
  const ops = drillOps([c], S).filter((o) => o.type === "shelf");
  const coords = [...ops.map((o) => Math.round(o.x)), ...ops.map((o) => Math.round(o.y))];
  check("manual shelf Y places pins at 240", coords.includes(240), coords.join(","));
}
{
  const c = makeCabinet("base", 600, 720, 560, "Band");
  const m = totalBandingM([c], S);
  check("banding > 0", m > 0, `${m.toFixed(1)}m`);
}
{
  const S3050 = { ...S, mdfSheet: "3050x1220" };
  check("mdf sheet 3050\xD71220", sheetDimsFor("mdf", S3050).w === 3050 && sheetDimsFor("mdf", S3050).h === 1220);
  check("plywood sheet 2440\xD71220", sheetDimsFor("plywood", S).w === 2440 && sheetDimsFor("plywood", S).h === 1220);
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
{
  const c = makeCabinet("tall", 720, 2e3, 600, "Cov");
  c.covers = [{ id: "c1", side: "L", mat: "mdf" }];
  const parts = allParts([c], S);
  const cover = parts.find((p) => p.name.includes("Cover") || p.name.includes("cover"));
  check("cover panel becomes a part", !!cover, parts.map((p) => p.name).slice(0, 6).join(","));
}
{
  const c = makeCabinet("tall", 720, 2800, 600, "FullDoor");
  c.hasToeKick = true;
  c.stack = [2e3, 800];
  c.hasFronts = true;
  c.rows = [
    {
      id: "r1",
      h: 1900,
      box: 0,
      columns: [
        { id: "c1", width: 720, shelves: 0, drawers: [], door: { type: "single", overlay: "semi", material: "mdf", mdfThk: 18, hingeBrand: "Blum Clip Top", hasHandle: true, handlePos: "center", full: true } }
      ]
    },
    { id: "r2", h: 800, box: 1, columns: [] }
  ];
  const doors = allParts([c], S).filter((p) => p.name.startsWith("Door"));
  check("exactly one full-height door", doors.length === 1, `${doors.length}`);
  if (doors[0]) check("door spans full height", Math.max(doors[0].w, doors[0].h) > 2690, `${doors[0].w}\xD7${doors[0].h}`);
}
{
  const c = makeCabinet("base", 600, 720, 560, "Hinge");
  const z = c.rows[0].columns[0];
  z.drawers = [];
  z.door = { type: "single", overlay: "semi", material: "mdf", mdfThk: 18, hingeBrand: "Blum Clip Top", hasHandle: true, handlePos: "center", full: false };
  const parts = allParts([c], S);
  const door = parts.find((p) => p.name.startsWith("Door"));
  const cups = door ? door.holes.filter((h) => h.kind === "hinge") : [];
  check("door has 2\xD7 \xD835 hinge cups (auto)", cups.length === 2 && cups.every((h) => h.dia === 35), `${cups.length} cups`);
  const sideCups = parts.filter((p) => p.name.toLowerCase().includes("side")).flatMap((p) => p.holes.filter((h) => h.kind === "hinge"));
  check("plywood side panels have ZERO hinge holes", sideCups.length === 0, `${sideCups.length}`);
  z.door = { ...z.door, hingeCount: 4 };
  const parts4 = allParts([c], S);
  const door4 = parts4.find((p) => p.name.startsWith("Door"));
  check("hinge-count override \u2192 4 cups", (door4?.holes.filter((h) => h.kind === "hinge").length ?? 0) === 4, `${door4?.holes.filter((h) => h.kind === "hinge").length}`);
}
if (failures) {
  console.log(`
${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nAll tests passed.");
}
