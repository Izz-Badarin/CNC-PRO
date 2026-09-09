export type CabinetType =
  | "custom"
  | "base"
  | "wall"
  | "tall"
  | "cornerBase"
  | "cornerWall"
  | "baseDoorFixed"
  | "L"
  | "C";



/* ---------- per-row / per-column specs ---------- */

export interface DrawerSpec {
  id: string;
  frontHeight: number;
  hidden: boolean;
  slideDepthCm: number;
  /** generate the MDF front for this drawer — OFF by default for hidden and normal drawers */
  frontMdf?: boolean;
  /**
   * Manual slide-hole Y offset (mm from the bottom of the drawer bank).
   * When set it replaces the automatically computed Y (first 60mm, then +55mm
   * per drawer). Leave undefined to keep the automatic rule.
   */
  yOffset?: number;
}

export type DoorType = "single" | "double" | "sliding";
export type DoorStyle = "overlay" | "inset";
export type SwingDir = "left" | "right";
export type DoorMaterial = "poly" | "mdf" | "glass";
/** MDF surface finish — "white" (matt laminated, NO edge banding) or "oak" (oak-veneer, banded like plywood) */
export type MdfFinish = "white" | "oak";

export interface DoorSpec {
  type: DoorType;
  style: DoorStyle;
  swing: SwingDir;
  material: DoorMaterial;
  /** MDF finish — "oak" gets edge banding + oak grain in 3D, "white" gets none (default follows Settings.mdfFinish) */
  finish?: MdfFinish;
  mdfThk: number;
  hingeBrand: string;
  hasHandle: boolean;
  handlePos: "top" | "center" | "bottom";
  /**
   * Full-height door: instead of covering just its own row, the door spans the
   * WHOLE carcass height (all rows / all stacked boxes) — one long door part.
   */
  full?: boolean;
  /**
   * Hinge count override for this door (universal 35mm hinges). undefined =
   * auto by leaf height (<900→2 · 900-1799→3 · 1800-2399→4 · 2400-2999→5 ·
   * ≥3000→6), first/last cup 140mm from the ends. The
   * hinge-cup hole (Ø35mm) is drilled in the DOOR at each hinge position —
   * never in the side panels, and never exported to DXF.
   */
  hingeCount?: number;
  /**
   * Manual door HEIGHT override (mm, rule F). 0/undefined = auto from the
   * section height. Width is always computed from the column opening.
   */
  hOverride?: number;
  /**
   * Manual door WIDTH override (mm). 0/undefined = auto from column opening.
   * For section doors, lets user override width as well.
   */
  wOverride?: number;
}

/**
 * A decorative / functional cover panel attached to one side of a cabinet.
 * The panel runs the FULL cabinet height (floor → top) and FULL depth (front → back)
 * by default, but every dimension is editable. It is a real MDF (or plywood) part
 * — it appears in the cut list, nesting and DXF, and is drawn in 2D + 3D.
 */
export type CoverSide = "L" | "R" | "T" | "B";
export interface CoverPanel {
  id: string;
  side: CoverSide;
  /** panel width (mm) — for L/R this is the depth-wise size, for T/B the cabinet-wise size */
  w: number;
  /** panel height (mm) — full cabinet height by default (floor → top) */
  h: number;
  /** panel thickness (mm) */
  thk: number;
  /** material — "mdf" (default) or "plywood" */
  mat: "mdf" | "plywood";
  /** MDF finish for mdf covers — "white" (no banding) or "oak" (banded) */
  finish?: MdfFinish;
  /** plywood material id when mat === "plywood" (matches Settings.plyMaterials[].id) — null = project default */
  matId?: string | null;
}

/**
 * A vertical section inside a row. A column can itself be split back into rows
 * (`rows`), which can each be split into columns again — so the cabinet supports
 * row→column and column→row nesting to any depth.
 */
export interface ColumnSpec {
  id: string;
  width: number; // mm, 0 = flexible (shares remaining width)
  shelves: number; // ignored when drawers exist
  door: DoorSpec | null;
  drawers: DrawerSpec[];
  fixed?: boolean;
  /** split this column into stacked rows (column → row split) */
  rows?: RowSpec[];
  /** sub-sections — drawers / shelves / fixed panels (never doors) */
  sub?: ColumnSpec[];
  /**
   * Hidden-drawer splitter: adds a horizontal panel above the drawer bank.
   * The space above it is either left empty or filled with shelves.
   */
  splitter?: boolean;
  splitterShelves?: number;
  /**
   * Where the drawer bank sits inside its section:
   * "bottom" (default) — flush against the section bottom;
   * "top" — flush against the section top;
   * "custom" — lifted `drawerOffsetY` mm above the section bottom.
   */
  drawerAlign?: "bottom" | "top" | "custom";
  /** used when drawerAlign === "custom": mm from the section bottom to the bank's bottom edge */
  drawerOffsetY?: number;
  /**
   * Shelf placement mode:
   * "auto" (default) — shelves are evenly distributed in the shelf zone;
   * "manual" — shelves are placed at exact Y positions from the section bottom
   *   (mm), one entry per shelf in `shelfPositions`.
   */
  shelfMode?: "auto" | "manual";
  /** manual shelf positions (mm from the section bottom) — used when shelfMode === "manual" */
  shelfPositions?: number[];
  /**
   * Hanging rail in this column (suits / dresses). The rail is hardware — no cut
   * part is generated; it is drawn in the 2D front view and 3D scene.
   * "off" (default) / "suits" / "dresses" / "double" (two rails).
   */
  rail?: "off" | "suits" | "dresses" | "double";
  /**
   * Per-column rail height override (mm from the section bottom). null/undefined =
   * use the global Settings value (railSuitsH / railDressesH / railDouble1).
   */
  railHeight?: number | null;
  /** when a rail is on, add shelves directly above it (auto = max count with gaps ≥ Settings.railShelfMinGap; manual = shelfPositions Ys) */
  railShelf?: boolean;
  /** number of shelves placed above the hanging rail (used in manual mode) */
  railShelfCount?: number;
  /**
   * Placement mode for shelves above the rail:
   * "auto" (default) — the nester picks the max shelf count so every gap
   * (rail → shelf, shelf → shelf, shelf → top) is ≥ Settings.railShelfMinGap,
   * then spaces them evenly;
   * "manual" — exact Y positions from the section bottom via `shelfPositions`
   * (one per shelf, like the regular manual shelves).
   */
  railShelfMode?: "auto" | "manual";
  /**
   * Decorative MDF back panel for this column (e.g. a slat/feature panel behind an
   * open vanity niche). Generated as a real MDF part sized to the column opening ×
   * the row height, mounted INSIDE the carcass just in front of the back panel.
   */
  mdfBack?: boolean;
  /** MDF back panel thickness override (mm) — defaults to the global MDF thickness */
  mdfBackThk?: number;
}

/** A horizontal row inside the cabinet, split into one or more columns. */
export interface RowSpec {
  id: string;
  h: number;
  columns: ColumnSpec[];
  /** when the cabinet is built as stacked boxes: which box (0-based) this row belongs to */
  box?: number;
}

export interface Cabinet {
  id: string;
  name: string;
  type: CabinetType;
  width: number;
  height: number;
  depth: number;
  qty: number;
  isKitchen: boolean;
  hasToeKick: boolean;
  hasFronts: boolean;
  hasBack: boolean;
  rows: RowSpec[];
  lCutW: number;
  lCutH: number;
  cCutW: number;
  cCutTopH: number;
  cCutMidH: number;
  cCutOffsetFromBottom: number;
  /**
   * Which plywood material this cabinet is cut from (matches
   * `Settings.plyMaterials[].id`). null = use the project default plywood.
   */
  matId?: string | null;
  /**
   * Manual position on the 2D front view (mm). x = along the wall, y = lift
   * above the floor. null = auto-layout (side-by-side row). Display-only —
   * cut list / nesting / DXF are unaffected.
   */
  layout?: { x: number; y: number } | null;
  /**
   * Manual position on the top-down Plan view (mm). x = along the wall,
   * z = depth offset (how far back the cabinet sits from the front reference
   * line). null = derived from the 2D layout x, or auto side-by-side.
   * Display-only — cut list / nesting / DXF are unaffected.
   */
  plan?: { x: number; z: number } | null;
  /**
   * Linear slot cut into the side panels (e.g. for a glass panel / track):
   * 18mm wide × full carcass height, `Settings.slotFromFront` mm back from the
   * front edge. "none" (default) / left / right / both.
   */
  slot?: "none" | "left" | "right" | "both";
  /** per-cabinet slot distance from front override (mm) — null/undefined = global Settings.slotFromFront */
  slotFromFront?: number | null;
  /**
   * Stacked boxes: when set (array of box heights, bottom → top), the cabinet is
   * built as SEPARATE boxes bolted on top of each other — each box with its own
   * 2 side panels + top + bottom (+ back). Rows carry `box` = index (0-based).
   * null/undefined = one normal carcass.
   */
  stack?: number[] | null;
  /**
   * Cover panels attached to the cabinet (left / right / top / bottom). Each panel
   * is a real MDF or plywood part — full height (floor → top) and full depth
   * (front → back) by default, fully editable. Rendered in 2D + 3D, included in
   * cut list / nesting / DXF.
   */
  covers?: CoverPanel[];
  /**
   * Cabinet-level full-height door for STACKED cabinets: one door spanning all
   * boxes, chosen here instead of inside a section. "off" (default) = use the
   * per-section doors. Glass = no cut part (purchased), MDF = one long part.
   */
  fullDoor?: "off" | "mdf" | "glass" | "mdf-left" | "mdf-right" | "mdf-double" | "glass-left" | "glass-right" | "glass-double" | null;
  /** hinge count override for the cabinet-level full door (undefined = auto by height) */
  fullDoorHinges?: number;
  /** manual override for full-door height (mm) — for stacked full doors */
  fullDoorHOverride?: number | null;
  /** manual override for full-door width (mm) — rare, but editable */
  fullDoorWOverride?: number | null;
}

/* ---------- project / business ---------- */

export type ProjectStatus = "draft" | "quoted" | "production" | "done";

/** a raw panel added directly to the project (not inside a cabinet) — e.g. an
 *  oak MDF panel, a plyboard panel, or any user-defined rectangular part. It is a
 *  real cut part and participates in the cut list, nesting, DXF and BOM just like
 *  a cabinet part, but it has no rows/columns/drawers/doors — just one piece. */
export interface PanelItem {
  id: string;
  name: string;
  w: number; // mm
  h: number; // mm
  thk: number; // mm
  material: PartMaterial; // "plywood" | "mdf" | "back"
  /** MDF finish — "white" (no banding) or "oak" (banded + grain). Ignored for plywood/back. */
  finish?: MdfFinish;
  /** plywood material id when material === "plywood" — null = project default */
  matId?: string | null;
  /** true = grain locked (no rotation in nesting). For MDF, only oak gets grain. */
  grain?: boolean;
  /** manual position on the 2D front view (mm). x = along the wall, y = lift above floor.
   *  null = auto-placed below all cabinets (display only — not used for cut list / nesting / DXF). */
  layout?: { x: number; y: number } | null;
}

export interface ProjectInfo {
  name: string;
  type: string;
  customerId: string | null;
  status: ProjectStatus;
  notes: string;
  /** raw panels added to the project (independent of any cabinet) */
  panels?: PanelItem[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
}

/* ---------- settings ---------- */

/** a user-defined plywood material — same thickness as every other ply, but a distinct name / color */
export interface PlywoodMaterial {
  id: string;
  name: string;
  color: string;
  opacity: number; // 0..1
  /** true = flat solid color (laminated/melamine look) · false/undefined = wood-grain texture */
  solid?: boolean;
  /** wood-grain texture direction in the 3D view: 0° = horizontal, 90° = vertical */
  grainRot?: 0 | 90;
}

export interface Settings {
  bodyThk: number;
  mdfThk: number;
  backThk: number;
  drawerThk: number;
  bitDiameter: number;
  holeDiameter: number; // shelf pin holes
  slideHoleDiameter: number; // drawer slide holes
  shelfGapMin: number;
  shelfGapMax: number;
  shelfGapTarget: number;
  shelfIncrease: number;
  shelfFrontSetback: number;
  shelfHoleCenter: number;
  shelfHoleSpacing: number;
  shelfHolesPerSide: number;
  /* ---- MDF finish (white = no banding · oak = banded) ---- */
  mdfFinish: MdfFinish;
  kickHeight: number;
  kickDepth: number;
  doorGap: number;
  dividerDeduct: number;
  grooveWidth: number;
  grooveFromBottom: number;
  /** the groove is this much shorter than the slider (500 → 480) */
  grooveShorter: number;
  /** width of the linear slot cut into the side panels (glass panel / track) */
  slotWidth: number;
  /** distance of the linear slot center from the FRONT edge of the side panel */
  slotFromFront: number;
  /** real sheet size (always 2440×1220 for plywood / veneer back — locked) */
  sheetW: number;
  sheetH: number;
  /** MDF sheet size — "auto" nests MDF groups with tall parts (>2420mm) on 3050×1220
   *  and everything else on 2440×1220; "3050x1220"/"2440x1220" force one size for all. */
  mdfSheet: "auto" | "3050x1220" | "2440x1220";
  /** draw edge-banding marker lines on a BANDING layer in the exported DXF */
  bandMarkers: boolean;
  /* ---- hanging rail (suits / dresses) — center height from the section bottom ---- */
  railSuitsH: number;
  railDressesH: number;
  railDouble1: number;
  railDouble2: number;
  /** gap (mm) between the hanging rail and a shelf placed directly above it (legacy fixed-gap placement) */
  railShelfGap: number;
  /** minimum gap (mm) for AUTO shelf-above-rail mode — all gaps must stay ≥ this */
  railShelfMinGap: number;
  /* ---- hinge boring (universal 35mm hinge — cups bored in the DOOR) ---- */
  /** hinge cup hole diameter (universal 35mm hinge cup) */
  hingeCupDiameter: number;
  /** hinge cup boring depth (standard = 12.5mm) */
  hingeCupDepth: number;
  /** cup CENTER distance from the hinge-side door edge (standard = 21.5mm) */
  hingeCupEdge: number;
  /* ---- glass door appearance ---- */
  glassColor: string;
  glassOpacity: number;
  frameColor: string;
  sheetMargin: number;
  partClearance: number;
  maxSheets: number;
  timeBudget: number;
  sheetFullThreshold: number;
  grainLock: boolean;
  nestFrom: "top left" | "top right" | "bottom left" | "bottom right";
  nestDirection: "X" | "Y";
  minOffcut: number;

  colorPlywood: string;
  colorMdf: string;
  colorBack: string;
  colorKick: string;
  colorEdge: string;
  /** 0..1 opacity per material type — lets you see inside the cabinet */
  opacityPlywood: number;
  opacityMdf: number;
  opacityBack: number;
  opacityKick: number;
  /** hidden drawer front MDF = section width − this (57 new rule, 90 legacy) */
  hiddenFrontDeduct: number;
  /** hidden drawer front MDF is inlaid this far inside the cabinet */
  hiddenFrontInset: number;
  /** include the toe kick parts in nesting / cut list */
  kickInNesting: boolean;
  /** add 10mm CNC vacuum-table clamping holes in free areas of the sheet when exporting DXF */
  clampHoles: boolean;

  /* ---- plywood material library (same thickness, different colors/names) ---- */
  /** every plywood material available in this project */
  plyMaterials: PlywoodMaterial[];
  /** which library entry new/unspecified cabinets use */
  defaultPlyId: string;

  /* ---- drawer drilling & box (formerly hardcoded) ---- */
  /** drawer slide-hole X pattern per slide depth (key = cm, values = mm from the FRONT edge) */
  slideHolePatterns: Record<string, number[]>;
  /** Y of the first drawer's slide holes, measured from the panel bottom */
  drawerHoleYStart: number;
  /** Y step added to each subsequent drawer's slide holes */
  drawerHoleYStep: number;
  /** drawer box width deduction (front divider) — "outer W − 33" */
  drawerBoxFrontDeduct: number;
  /** drawer box width deduction (back) — "outer W − 49" */
  drawerBoxBackDeduct: number;
  /** extra drawer box width deduction when the drawer is hidden — "− 50" */
  drawerBoxHiddenExtra: number;
  /** drawer box depth = slide length − this offset */
  drawerBoxDepthFix: number;
}

/* ---------- parts ---------- */

export type PartMaterial = "plywood" | "mdf" | "back" | "glass";

export type HoleKind = "shelf" | "slide" | "hinge";

export interface Hole {
  x: number;
  y: number;
  dia: number;
  depth: number;
  kind: HoleKind;
}

export interface Groove {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  /** "drawer" (default) = slide groove · "slot" = full-height linear slot (DXF SLOT layer) */
  kind?: "drawer" | "slot";
}

export interface Banding {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
}

export interface Part {
  cabId: string;
  cabName: string;
  name: string;
  w: number;
  h: number;
  qty: number;
  material: PartMaterial;
  thickness: number;
  /** for plywood parts: the id of the user plywood material (matches `Settings.plyMaterials[].id`) */
  matId?: string;
  band: Banding;
  holes: Hole[];
  grooves: Groove[];
  shape: "rect" | "poly";
  outline: [number, number][];
  grain: boolean;
  note: string;
  /**
   * reference part (rule H) — e.g. a glass door's hinge-cup positions.
   * Rendered DASHED everywhere, labelled "not drilled", and excluded from
   * drilling CSVs and DXF output.
   */
  reference?: boolean;
}

export const MATERIAL_LABEL: Record<PartMaterial, string> = {
  plywood: "Plywood",
  mdf: "MDF",
  back: "Veneer back",
  glass: "Glass (ref)",
};

export const HOLE_COLOR: Record<HoleKind, string> = {
  shelf: "#f5b33c",
  slide: "#38bdf8",
  hinge: "#f87171",
};

export const BODY_MAT = "Polyboard 16.5mm";
export const BACK_MAT = "Veneer 5mm";
