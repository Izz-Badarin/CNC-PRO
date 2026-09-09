import type { Cabinet, CabinetType, ColumnSpec, DrawerSpec, DoorSpec, PlywoodMaterial, RowSpec, Settings } from "../types";

export const uid = () => Math.random().toString(36).slice(2, 10);

/* ================= plywood materials ================= */

export const DEFAULT_PLY_ID = "ply-default";
export const DEFAULT_PLY_COLOR = "#b78a58";
/** the stock polyboard material, before the user customizes it */
export const STOCK_PLY_NAME = "Default Polyboard";
/** white laminated board — the default look */
export const PLY_WHITE = "#f2f1ed";

/** the built-in plywood materials every new project starts with: white solid + a real grain ply */
export const defaultPlyMaterials = (): PlywoodMaterial[] => [
  { id: DEFAULT_PLY_ID, name: "Plywood White", color: PLY_WHITE, opacity: 1, solid: true },
  { id: "ply-grain", name: "Plywood (grain)", color: DEFAULT_PLY_COLOR, opacity: 1 },
];

/** always returns a valid (non-empty) plywood material list */
export function plyMaterialsOf(S: Settings): PlywoodMaterial[] {
  return Array.isArray(S.plyMaterials) && S.plyMaterials.length ? S.plyMaterials : defaultPlyMaterials();
}

/** the material id a cabinet-unspecified part should use (the project default plywood) */
export function defaultPlyId(S: Settings): string {
  return plyMaterialById(S, S.defaultPlyId).id;
}

/** resolve a plywood material by id — falls back to the project default, then the built-in */
export function plyMaterialById(S: Settings, id?: string | null): PlywoodMaterial {
  const lib = plyMaterialsOf(S);
  if (id) {
    const hit = lib.find((m) => m.id === id);
    if (hit) return hit;
  }
  const def = lib.find((m) => m.id === S.defaultPlyId);
  return def ?? lib[0];
}

/** the material a cabinet is actually cut from (cabinet override → default → first) */
export const plyMaterialOf = (S: Settings, cab: Pick<Cabinet, "matId">): PlywoodMaterial => plyMaterialById(S, cab.matId);

/**
 * Drawer slide-hole X pattern by slide depth (cm), measured mm from the FRONT
 * edge of the side panel. These are the physical hole locations along the
 * slider rail — one key per slide depth, editable in Settings → Drilling.
 */
export const DEFAULT_SLIDE_HOLE_PATTERNS: Record<string, number[]> = {
  "25": [39, 71, 167, 231],
  "30": [39, 71, 167, 231],
  "35": [39, 71, 167, 231],
  "40": [39, 71, 167, 263],
  "45": [39, 71, 167, 263],
  "50": [39, 71, 263, 341],
  // kitchen-mode drawers use a dedicated industry pattern (always 50cm slide)
  kitchen: [38, 61, 261.5, 294.5],
};

/** make sure every slide depth (+ kitchen) has a valid pattern array */
export function normalizeSlidePatterns(p?: Record<string, number[]> | null): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const k of [...AVAILABLE_DRAWER_DEPTHS.map(String), "kitchen"]) {
    const arr = p?.[k];
    out[k] = Array.isArray(arr) && arr.length ? arr.map(Number) : [...DEFAULT_SLIDE_HOLE_PATTERNS[k]];
  }
  return out;
}

/** upgrade legacy/saved settings into the current shape (array → per-depth record) */
export function migrateSettings(raw: Partial<Settings> | undefined | null): Settings {
  const base = { ...DEFAULT_SETTINGS, ...(raw ?? {}) } as Settings;
  const patArr = (raw as { slideHolePattern?: unknown } | null | undefined)?.slideHolePattern;
  if (Array.isArray(patArr) && patArr.length) {
    base.slideHolePatterns = Object.fromEntries(AVAILABLE_DRAWER_DEPTHS.map((k) => [String(k), patArr.map(Number)])) as Record<string, number[]>;
  }
  base.slideHolePatterns = normalizeSlidePatterns(base.slideHolePatterns);
  // sheet size is LOCKED to 2440×1220 (older saves may still carry it swapped portrait)
  base.sheetW = 2440;
  base.sheetH = 1220;
  // legacy mdfSheet values collapse to the new auto behaviour unless explicitly forced
  if (base.mdfSheet !== "3050x1220" && base.mdfSheet !== "2440x1220") base.mdfSheet = "auto";
  // plywood material library — always a valid non-empty list with a resolvable default
  const savedLib = Array.isArray((raw ?? {}).plyMaterials) ? (raw ?? {}).plyMaterials : null;
  const lib = (savedLib && savedLib.length ? savedLib : defaultPlyMaterials()).map((m) => ({
    id: m.id || uid(),
    name: (m.name || "Plywood").trim(),
    color: /^#[0-9a-fA-F]{6}$/.test(m.color || "") ? m.color : DEFAULT_PLY_COLOR,
    opacity: Math.min(1, Math.max(0.05, Number(m.opacity) || 1)),
    solid: m.solid === true,
    grainRot: (m.grainRot === 90 ? 90 : 0) as 0 | 90,
  }));
  // upgrade an untouched stock "Default Polyboard" to the new white solid look
  for (const m of lib) {
    if (m.id === DEFAULT_PLY_ID && m.name === STOCK_PLY_NAME && m.color === DEFAULT_PLY_COLOR && !m.solid) {
      m.name = "Plywood White";
      m.color = PLY_WHITE;
      m.solid = true;
    }
  }
  base.plyMaterials = lib;
  base.defaultPlyId = lib.some((m) => m.id === base.defaultPlyId) ? base.defaultPlyId : lib[0].id;
  return base;
}

export const DEFAULT_SETTINGS: Settings = {
  bodyThk: 16.5,
  mdfThk: 19,
  backThk: 5,
  drawerThk: 16.5,
  bitDiameter: 4.0,
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
  sheetW: 2440, // locked: plywood / veneer-back sheets are always 2440 × 1220
  sheetH: 1220,
  mdfSheet: "auto",
  bandMarkers: true,
  railSuitsH: 1100,
  railDressesH: 1750,
  railDouble1: 1000,
  railDouble2: 2000,
  railShelfGap: 60,
  railShelfMinGap: 250,
  /* ---- hinge boring (universal 35mm hinge — cups bored in the DOOR) ---- */
  hingeCupDiameter: 35, // universal hinge — 35mm cup bored in the DOOR (never the side panels)
  hingeCupDepth: 12.5, // standard cup depth
  hingeCupEdge: 21.5, // cup CENTER distance from the hinge-side door edge
  mdfFinish: "white", // MDF doors/covers default to white (no edge banding)
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
  colorKick: "#b78a58", // matches plywood by default
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
  drawerBoxDepthFix: 7,
};




/* ================= drawer system ================= */

export const AVAILABLE_DRAWER_DEPTHS = [25, 30, 35, 40, 45, 50];
export const DEFAULT_SLIDE_CM = 50;

export const DRAWER_HOLE_PATTERNS: Record<number, number[]> = {
  25: [39, 71, 167, 231],
  30: [39, 71, 167, 231],
  35: [39, 71, 167, 231],
  40: [39, 71, 167, 263],
  45: [39, 71, 167, 263],
  50: [39, 71, 263, 341],
};

export const FIRST_DRAWER_HOLE_HEIGHT = 60;
export const DRAWER_HEIGHT_INCREMENT = 55;

export function getDrawerHolePattern(slideDepthCm: number): number[] {
  const d = Math.round(slideDepthCm);
  if (DRAWER_HOLE_PATTERNS[d]) return DRAWER_HOLE_PATTERNS[d];
  const lower = [...AVAILABLE_DRAWER_DEPTHS].reverse().find((x) => x <= d);
  return DRAWER_HOLE_PATTERNS[lower ?? AVAILABLE_DRAWER_DEPTHS[0]];
}

export function findNearestDrawerDepth(depthMm: number): number {
  const cm = depthMm / 10;
  for (let i = AVAILABLE_DRAWER_DEPTHS.length - 1; i >= 0; i--) if (AVAILABLE_DRAWER_DEPTHS[i] <= cm) return AVAILABLE_DRAWER_DEPTHS[i];
  return AVAILABLE_DRAWER_DEPTHS[0];
}

/* ================= kitchen drawer system ================= */

export const KITCHEN_SLIDE_CM = 50;
export const KITCHEN_SLIDE_PATTERN = [38, 61, 261.5, 294.5];
export const KITCHEN_FIRST_HOLE_Y = 75;
export const KITCHEN_LAST_DRAWER_OFFSET = 55;

/* ================= doors ================= */

export const DOOR_GAP_BETWEEN_DOUBLE = 3;
export const DOOR_OVERLAY_AMOUNT = 16;
export const GLASS_RAIL = 60;
export const HINGE_BRANDS = ["Blum Clip Top", "Blum Clip Top Blumotion", "Universal 35mm"];
/**
 * Auto hinge count by LEAF HEIGHT (universal 35mm hinges):
 *   ≤1000 → 2 · ≤1500 → 3 · ≤2000 → 4 · ≤2400 → 5 · >2400 → 6
 * Hinge cups sit 140mm from the top and bottom of the door; extras spread
 * evenly in between (see genDoor in model.ts).
 */
export const doorHingeCount = (doorH: number) =>
  doorH <= 1000 ? 2 : doorH <= 1500 ? 3 : doorH <= 2000 ? 4 : doorH <= 2400 ? 5 : 6;

/** doors & drawer fronts default to MDF */
export const mkDoor = (type: DoorSpec["type"] = "single", p?: Partial<DoorSpec>): DoorSpec => ({
  type,
  style: "overlay",
  swing: "left",
  material: "mdf",
  mdfThk: DEFAULT_SETTINGS.mdfThk,
  hingeBrand: HINGE_BRANDS[0],
  hasHandle: true,
  handlePos: "top",
  ...p,
});

export const mkDrawer = (frontHeight = 200, p?: Partial<DrawerSpec>): DrawerSpec => ({
  id: uid(),
  frontHeight,
  hidden: false,
  slideDepthCm: DEFAULT_SLIDE_CM,
  frontMdf: false, // MDF fronts are opt-in for every drawer
  ...p,
});

export const mkColumn = (p?: Partial<ColumnSpec>): ColumnSpec => ({
  id: uid(),
  width: 0,
  shelves: 0,
  door: null,
  drawers: [],
  drawerAlign: "bottom", // drawer bank sits at the section bottom unless changed
  ...p,
});

/* ================= cabinet types ================= */

export const PROJECT_TYPES = [
  "Kitchen", "Wardrobe", "Bathroom", "Vanity", "Bookshelf", "TV Unit",
  "Storage", "Closet", "Laundry", "Garage", "Office", "Custom",
];

export const TYPE_META: Record<
  CabinetType,
  { label: string; desc: string; dims: [number, number, number]; kick: boolean; kitchen: boolean }
> = {
  custom: { label: "Custom Cabinet", desc: "Blank cabinet — configure everything", dims: [600, 720, 560], kick: true, kitchen: false },
  base: { label: "Base Unit", desc: "Floor unit with toe kick", dims: [600, 720, 560], kick: true, kitchen: true },
  wall: { label: "Wall Unit", desc: "No kick, wall hung", dims: [600, 720, 350], kick: false, kitchen: true },
  tall: { label: "Tall Unit", desc: "Pantry / oven housing", dims: [600, 2100, 560], kick: true, kitchen: true },
  cornerBase: { label: "Corner Base", desc: "5-sided pentagon footprint", dims: [900, 720, 900], kick: true, kitchen: true },
  cornerWall: { label: "Corner Wall", desc: "5-sided, wall hung", dims: [700, 720, 700], kick: false, kitchen: true },
  baseDoorFixed: { label: "Base + Door & Fixed", desc: "Door over fixed panel", dims: [600, 720, 560], kick: true, kitchen: false },
  L: { label: "L Cabinet", desc: "Side panels notched at top-front corner", dims: [600, 720, 560], kick: true, kitchen: true },
  C: { label: "C Cabinet", desc: "Side panels with top + mid notches", dims: [600, 720, 560], kick: true, kitchen: true },
};

export const DEFAULT_CUTS = {
  lCutW: 27,
  lCutH: 58,
  cCutW: 27,
  cCutTopH: 58,
  cCutMidH: 75,
  cCutOffsetFromBottom: 290,
};

/* ================= auto shelves ================= */

export function shelfGap(H: number, n: number, S: Settings): number {
  return (H - n * S.bodyThk) / (n + 1);
}

export function recommendedShelves(H: number, S: Settings): number {
  let bestN = -1;
  let bestScore = Infinity;
  for (let n = 0; n < 30; n++) {
    const gap = shelfGap(H, n, S);
    if (gap >= S.shelfGapMin && gap <= S.shelfGapMax) {
      const sc = Math.abs(gap - S.shelfGapTarget);
      if (sc < bestScore) { bestScore = sc; bestN = n; }
    }
  }
  if (bestN >= 0) return bestN;
  for (let n = 0; n < 30; n++) {
    const gap = shelfGap(H, n, S);
    if (gap >= S.shelfGapMin - 25 && gap <= S.shelfGapMax + 25) {
      const sc = Math.abs(gap - S.shelfGapTarget) * 2;
      if (sc < bestScore) { bestScore = sc; bestN = n; }
    }
  }
  if (bestN >= 0) return bestN;
  if (H >= 400) {
    let fb = 1, fbScore = Infinity;
    for (let n = 1; n < 30; n++) {
      const sc = Math.abs(shelfGap(H, n, S) - S.shelfGapTarget);
      if (sc < fbScore) { fbScore = sc; fb = n; }
    }
    return fb;
  }
  return 0;
}

/* ================= default rows ================= */

const row = (h: number, cols: ColumnSpec[]): RowSpec => ({ id: uid(), h, columns: cols });

/**
 * Default layout for a new cabinet. MDF fronts are NOT generated by default —
 * every section starts with no door, so the user adds doors explicitly.
 */
export function defaultRows(type: CabinetType, height: number, width: number, S: Settings = DEFAULT_SETTINGS): RowSpec[] {
  void width;
  const kick = TYPE_META[type].kick ? S.kickHeight : 0;
  const BH = height - kick;
  const shel = (H: number) => recommendedShelves(H, S);
  if (BH < 300) return [row(Math.max(80, BH), [mkColumn()])];
  switch (type) {
    case "custom":
      // a blank cabinet — one open section with shelves, no doors, ready to edit
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
        row(BH - lower, [mkColumn({ shelves: shel(BH - lower) })]),
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

/** system default cabinet dimensions */
export const DEFAULT_DIMS: [number, number, number] = [600, 720, 560];

export function makeCabinet(type: CabinetType, w: number, h: number, d: number, name: string): Cabinet {
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
    isKitchen: false, // kitchen mode is OFF until the user turns it on
    hasToeKick: false, // toe kick is OFF until the user enables it
    hasFronts: false, // MDF fronts are OFF until the user adds a door / enables a front
    hasBack: true,
    rows: defaultRows(type, H, W),
    ...DEFAULT_CUTS,
  };
}

/* ---- identity / duplication / library ---- */

const stripDraw = (d: DrawerSpec) => ({
  frontHeight: d.frontHeight,
  hidden: d.hidden,
  slideDepthCm: d.slideDepthCm,
  frontMdf: !!d.frontMdf,
});
const stripCol = (col: ColumnSpec): any => ({
  width: col.width,
  shelves: col.shelves,
  fixed: !!col.fixed,
  door: col.door
    ? {
        ...col.door,
        hingeCount: col.door.hingeCount ?? null,
        finish: col.door.finish ?? null,
      }
    : null,
  drawers: col.drawers.map(stripDraw),
  splitter: !!col.splitter,
  splitterShelves: col.splitterShelves,
  drawerAlign: col.drawerAlign ?? "bottom",
  drawerOffsetY: col.drawerOffsetY,
  shelfMode: col.shelfMode ?? "auto",
  shelfPositions: col.shelfPositions ?? null,
  rail: col.rail ?? "off",
  railHeight: col.railHeight ?? null,
  railShelf: !!col.railShelf,
  railShelfCount: col.railShelfCount ?? null,
  mdfBack: !!col.mdfBack,
  mdfBackThk: col.mdfBackThk ?? null,
  // nested geometry must be captured too, or structurally different cabinets
  // would wrongly be considered "the same config" and folded together
  rows: (col.rows ?? []).map(stripRow),
  sub: (col.sub ?? []).map(stripCol),
});
const stripRow = (r: RowSpec): any => ({ h: r.h, columns: r.columns.map(stripCol) });
const stripIds = (c: Cabinet) => ({
  type: c.type,
  width: c.width,
  height: c.height,
  depth: c.depth,
  isKitchen: c.isKitchen,
  hasToeKick: c.hasToeKick,
  hasFronts: c.hasFronts,
  hasBack: c.hasBack,
  matId: c.matId ?? null,
  lCutW: c.lCutW,
  lCutH: c.lCutH,
  cCutW: c.cCutW,
  cCutTopH: c.cCutTopH,
  cCutMidH: c.cCutMidH,
  cCutOffsetFromBottom: c.cCutOffsetFromBottom,
  stack: c.stack ?? null,
  fullDoor: c.fullDoor ?? null,
  fullDoorHinges: c.fullDoorHinges ?? null,
  slot: c.slot ?? "none",
  covers: (c.covers ?? []).map((cv) => ({
    side: cv.side,
    w: cv.w,
    h: cv.h,
    thk: cv.thk,
    mat: cv.mat,
    finish: cv.finish ?? null,
    matId: cv.matId ?? null,
  })),
  rows: c.rows.map(stripRow),
});

/** two cabinets are "the same" when everything except id / name / qty matches */
export const sameConfig = (a: Cabinet, b: Cabinet) => JSON.stringify(stripIds(a)) === JSON.stringify(stripIds(b));

const reId = (c: Cabinet): Cabinet => ({
  ...c,
  id: uid(),
  rows: c.rows.map((r) => ({
    ...r,
    id: uid(),
    columns: r.columns.map((col) => ({
      ...col,
      id: uid(),
      door: col.door ? { ...col.door } : null,
      drawers: col.drawers.map((d) => ({ ...d, id: uid() })),
    })),
  })),
});

export const duplicateCabinet = (c: Cabinet, name?: string): Cabinet => ({
  ...reId(c),
  name: name ?? nextCopyName(c.name),
  qty: 1,
});

/**
 * Increment the trailing unit number instead of appending "copy":
 *   "Wall Unit-07" → "Wall Unit-08"   ·   "Base 3" → "Base 4"   ·   "Pantry" → "Pantry-2"
 * Zero padding is preserved (07 → 08).
 */
export function nextCopyName(name: string, taken: string[] = []): string {
  const m = name.match(/^(.*?)(\d+)(\D*)$/);
  const build = (n: number) => {
    if (!m) return `${name}-${n}`;
    const pad = m[2].length;
    return `${m[1]}${String(n).padStart(pad, "0")}${m[3]}`;
  };
  let n = m ? parseInt(m[2], 10) + 1 : 2;
  const used = new Set(taken);
  let out = build(n);
  while (used.has(out)) out = build(++n);
  return out;
}

export interface LibraryItem {
  id: string;
  name: string;
  builtin?: boolean;
  cabinet: Cabinet;
}

/** ready-to-use starter templates */
export function builtinLibrary(): LibraryItem[] {
  const items: [string, CabinetType, number, number, number][] = [
    ["Base 600 · drawer + door", "base", 600, 720, 560],
    ["Base 900 · drawer + 2 doors", "base", 900, 720, 560],
    ["Drawer bank 600 · 4 drawers", "base", 600, 720, 560],
    ["Wall 600 · 2 doors", "wall", 600, 720, 350],
    ["Wall 800 · 2 doors", "wall", 800, 720, 350],
    ["Tall pantry 600", "tall", 600, 2100, 560],
    ["Corner base 900", "cornerBase", 900, 720, 900],
    ["L notched base 600", "L", 600, 720, 560],
    ["C notched base 600", "C", 600, 720, 560],
  ];
  return items.map(([name, type, w, h, d]) => {
    const cab = makeCabinet(type, w, h, d, name.split(" · ")[0]);
    if (name.startsWith("Drawer bank")) {
      const BH = h - (TYPE_META[type].kick ? DEFAULT_SETTINGS.kickHeight : 0);
      const each = Math.round(BH / 4);
      cab.rows = [
        {
          id: uid(),
          h: BH,
          columns: [mkColumn({ drawers: [each, each, each, BH - each * 3].map((fh) => mkDrawer(fh)) })],
        },
      ];
    }
    return { id: uid(), name, builtin: true, cabinet: cab };
  });
}

/* ---- migrate legacy (pre-column) saved cabinets ---- */
export function migrateCabinet(c: Cabinet): Cabinet {
  const legacy = c as unknown as {
    rows?: (RowSpec & { shelves?: number; door?: DoorSpec | null; drawers?: DrawerSpec[]; fixed?: boolean })[];
  };
  const rows = (legacy.rows ?? []).map((r) =>
    r.columns
      ? r
      : ({
          id: r.id ?? uid(),
          h: r.h ?? 300,
          columns: [mkColumn({ shelves: r.shelves ?? 0, door: r.door ?? null, drawers: r.drawers ?? [], fixed: r.fixed })],
        } as RowSpec),
  );
  return {
    ...DEFAULT_CUTS,
    ...c,
    qty: c.qty ?? 1,
    isKitchen: c.isKitchen ?? false,
    // kept inline-true only if the user explicitly enabled it — legacy cabinets
    // without the field must behave as "toe kick OFF" so nothing shows by default.
    hasToeKick: c.hasToeKick === true,
    rows,
  };
}

/* ================= settings meta ================= */

export const SETTINGS_META: { key: keyof Settings; label: string; unit: string; group: string }[] = [
  { key: "bodyThk", label: "Body / box plywood thickness", unit: "mm", group: "Materials" },
  { key: "mdfThk", label: "MDF door & drawer front thickness", unit: "mm", group: "Materials" },
  { key: "backThk", label: "Back panel thickness", unit: "mm", group: "Materials" },
  { key: "drawerThk", label: "Drawer box side thickness", unit: "mm", group: "Materials" },

  { key: "hiddenFrontDeduct", label: "Hidden drawer front deduction (57 new / 90 legacy)", unit: "mm", group: "Construction" },
  { key: "hiddenFrontInset", label: "Hidden drawer front inlay depth", unit: "mm", group: "Construction" },
  { key: "bitDiameter", label: "Router bit diameter", unit: "mm", group: "Drilling" },
  { key: "holeDiameter", label: "Shelf pin hole diameter", unit: "mm", group: "Drilling" },
  { key: "slideHoleDiameter", label: "Drawer slide hole diameter", unit: "mm", group: "Drilling" },
  { key: "grooveWidth", label: "Drawer groove width", unit: "mm", group: "Drilling" },
  { key: "grooveFromBottom", label: "Groove distance from bottom", unit: "mm", group: "Drilling" },
  { key: "grooveShorter", label: "Groove shorter than slider by", unit: "mm", group: "Drilling" },
  { key: "slotWidth", label: "Linear slot width (side panels)", unit: "mm", group: "Drilling" },
  { key: "slotFromFront", label: "Linear slot center from front edge", unit: "mm", group: "Drilling" },
  { key: "drawerHoleYStart", label: "First drawer slide-hole Y (from bottom)", unit: "mm", group: "Drilling" },
  { key: "drawerHoleYStep", label: "Drawer slide-hole Y step", unit: "mm", group: "Drilling" },
  { key: "drawerBoxFrontDeduct", label: "Drawer box width − front (divider)", unit: "mm", group: "Drilling" },
  { key: "drawerBoxBackDeduct", label: "Drawer box width − back", unit: "mm", group: "Drilling" },
  { key: "drawerBoxHiddenExtra", label: "Drawer box width − extra (hidden)", unit: "mm", group: "Drilling" },
  { key: "drawerBoxDepthFix", label: "Drawer box depth = slide − offset", unit: "mm", group: "Drilling" },
  { key: "dividerDeduct", label: "Vertical divider height deduction", unit: "mm", group: "Construction" },
  { key: "shelfGapMin", label: "Shelf gap minimum", unit: "mm", group: "Shelf system" },
  { key: "shelfGapMax", label: "Shelf gap maximum", unit: "mm", group: "Shelf system" },
  { key: "shelfGapTarget", label: "Shelf gap target", unit: "mm", group: "Shelf system" },
  { key: "shelfIncrease", label: "Shelf width shaving", unit: "mm", group: "Shelf system" },
  { key: "shelfFrontSetback", label: "Shelf front setback", unit: "mm", group: "Shelf system" },
  { key: "shelfHoleCenter", label: "Pin column offset from edges", unit: "mm", group: "Shelf system" },
  { key: "shelfHoleSpacing", label: "Pin hole spacing", unit: "mm", group: "Shelf system" },
  { key: "shelfHolesPerSide", label: "Pin holes per shelf position", unit: "n", group: "Shelf system" },
  { key: "kickHeight", label: "Toe kick height", unit: "mm", group: "Construction" },
  { key: "kickDepth", label: "Toe kick recess depth", unit: "mm", group: "Construction" },
  { key: "doorGap", label: "Front reveal gap", unit: "mm", group: "Construction" },
  { key: "sheetMargin", label: "Sheet edge margin", unit: "mm", group: "Nesting" },
  { key: "partClearance", label: "Part clearance (kerf)", unit: "mm", group: "Nesting" },
  { key: "maxSheets", label: "Max sheets per material", unit: "n", group: "Nesting" },
  { key: "timeBudget", label: "Optimizer time budget", unit: "s/group", group: "Nesting" },
  { key: "sheetFullThreshold", label: "Sheet full threshold (0–1)", unit: "ratio", group: "Nesting" },
  { key: "minOffcut", label: "Min offcut dimension", unit: "mm", group: "Nesting" },
];

export const SETTINGS_VERSION = 14;
