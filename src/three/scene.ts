import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Cabinet, ColumnSpec, CoverPanel, DoorSpec, PanelItem, PlywoodMaterial, Settings } from "../types";
import {
  boxHeight,
  carcassDepth,
  columnFaceWidth,
  columnLayout,
  columnLayoutIn,
  doorDims,
  drawerBank,
  hasKick,
  isCorner,
  isNotched,
  kickH,
  sidePanelOutline,
  stackOn,
  stackedHeights,
} from "../lib/model";
import { plyMaterialById, plyMaterialOf } from "../lib/defaults";

/* ================= materials ================= */

let woodTex: THREE.CanvasTexture | null = null;
/**
 * The wood grain is baked in NEUTRAL GRAY — the per-cabinet plywood color is
 * applied via the material's diffuse `color` (map × color), so every plywood
 * material gets its own tinted grain.
 */
function getWoodTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, "#b9b9b9");
  grad.addColorStop(0.5, "#cfcfcf");
  grad.addColorStop(1, "#b1b1b1");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 130; i++) {
    const y = Math.random() * 512;
    const wob = 2 + Math.random() * 6;
    ctx.strokeStyle = `rgba(${92 + Math.random() * 40},${92 + Math.random() * 40},${92 + Math.random() * 40},${0.12 + Math.random() * 0.16})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x / 60 + i) * wob);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.strokeStyle = "rgba(90,90,90,0.16)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y, 16 * Math.random(), 5 + 4 * Math.random(), 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.anisotropy = 8;
  return woodTex;
}

const DEFAULT_SETTINGS_FALLBACK: Settings = {
  bodyThk: 16.5, mdfThk: 19, backThk: 5, drawerThk: 16.5,
  bitDiameter: 4, holeDiameter: 4.9, slideHoleDiameter: 4.9, shelfGapMin: 300, shelfGapMax: 350, shelfGapTarget: 325,
  shelfIncrease: 0.5, shelfFrontSetback: 5, shelfHoleCenter: 39, shelfHoleSpacing: 32, shelfHolesPerSide: 3,
  kickHeight: 100, kickDepth: 50, doorGap: 3, dividerDeduct: 33, grooveWidth: 5.7, grooveFromBottom: 12, grooveShorter: 20,
  slotWidth: 18, slotFromFront: 80,
  sheetW: 2440, sheetH: 1220, mdfSheet: "auto", bandMarkers: true,
  railSuitsH: 1100, railDressesH: 1750, railDouble1: 1000, railDouble2: 2000, railShelfGap: 60,
  hingeCupDiameter: 35, hingeCupDepth: 12.5, hingeCupEdge: 21.5, mdfFinish: "white",
  glassColor: "#bcd8e8", glassOpacity: 0.32, frameColor: "#c9ccd4",
  sheetMargin: 10, partClearance: 4.1, maxSheets: 50, timeBudget: 5, sheetFullThreshold: 0.9,
  grainLock: false, nestFrom: "bottom left", nestDirection: "Y", minOffcut: 300, railShelfMinGap: 250,
  colorPlywood: "#b78a58", colorMdf: "#d8d4ca", colorBack: "#a08a6a", colorKick: "#b78a58", colorEdge: "#f5b33c",
  opacityPlywood: 1, opacityMdf: 1, opacityBack: 1, opacityKick: 1,
  hiddenFrontDeduct: 57, hiddenFrontInset: 50, kickInNesting: true, clampHoles: true,
  plyMaterials: [
    { id: "ply-default", name: "Plywood White", color: "#f2f1ed", opacity: 1, solid: true },
    { id: "ply-grain", name: "Plywood (grain)", color: "#b78a58", opacity: 1 },
  ],
  defaultPlyId: "ply-default",
  slideHolePatterns: { "25": [39, 71, 167, 231], "30": [39, 71, 167, 231], "35": [39, 71, 167, 231], "40": [39, 71, 167, 263], "45": [39, 71, 167, 263], "50": [39, 71, 263, 341], kitchen: [38, 61, 261.5, 294.5] },
  drawerHoleYStart: 60, drawerHoleYStep: 55,
  drawerBoxFrontDeduct: 33, drawerBoxBackDeduct: 49, drawerBoxHiddenExtra: 50, drawerBoxDepthFix: 7,
};
/** per-material opacity 0..1 — below 1 the panels become see-through */
const clampOp = (v: number | undefined) => Math.min(1, Math.max(0.05, v ?? 1));
const trans = (v: number | undefined) => {
  const o = clampOp(v);
  return { transparent: o < 1, opacity: o, depthWrite: o >= 1 };
};

const m = (S: Settings) => ({
  mdf: new THREE.MeshStandardMaterial({ color: S.colorMdf, roughness: 0.55, metalness: 0.02, ...trans(S.opacityMdf) }),
  back: new THREE.MeshStandardMaterial({ color: S.colorBack, roughness: 0.9, ...trans(S.opacityBack) }),
  metal: new THREE.MeshStandardMaterial({ color: "#c9ccd4", roughness: 0.3, metalness: 0.85 }),
  // the toe kick always follows the project DEFAULT plywood (e.g. the white board)
  kick: (() => {
    const dp = plyMaterialById(S, S.defaultPlyId);
    return new THREE.MeshStandardMaterial({ color: dp.color, roughness: 0.9, ...trans(S.opacityKick) });
  })(),
  drawerBox: new THREE.MeshStandardMaterial({ color: S.colorPlywood, roughness: 0.78, metalness: 0.03, ...trans(S.opacityPlywood) }),
  glass: new THREE.MeshStandardMaterial({ color: "#bcd8e8", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }),
  slot: new THREE.MeshStandardMaterial({ color: "#4a4038", roughness: 1 }),
});
let mats = m(DEFAULT_SETTINGS_FALLBACK);

let woodOpacity = 1;
/** oak-finish MDF — rendered with the wood texture tinted oak (doors / covers) */
const OAK_MDF_PLY: PlywoodMaterial = { id: "mdf-oak", name: "MDF oak", color: "#a9805a", opacity: 1, grainRot: 0, solid: false };
/** wood-textured plywood material, optionally tinted with a plywood material's color/opacity.
 *  A `solid` material skips the grain texture entirely — flat laminated-board look.
 *  `vert` = grain runs VERTICALLY (along the panel height) — used for every H×D
 *  panel (sides, dividers, doors, L/R covers) so the grain follows H, never D. */
function woodMat(w: number, h: number, ply?: PlywoodMaterial, vert = false): THREE.MeshStandardMaterial {
  const op = ply ? Math.min(1, Math.max(0.05, ply.opacity)) : woodOpacity;
  if (ply?.solid) {
    return new THREE.MeshStandardMaterial({
      color: ply.color,
      roughness: 0.62,
      metalness: 0.02,
      transparent: op < 1,
      opacity: op,
      depthWrite: op >= 1,
    });
  }
  const t = getWoodTexture().clone();
  t.needsUpdate = true;
  t.repeat.set(Math.max(0.5, w / 900), Math.max(0.5, h / 900));
  // per-material grain direction (0° = horizontal, 90° = vertical)
  if (ply?.grainRot === 90 || vert) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
  }
  const mat = new THREE.MeshStandardMaterial({
    map: t,
    roughness: 0.78,
    metalness: 0.03,
    transparent: op < 1,
    opacity: op,
    depthWrite: op >= 1,
  });
  if (ply) mat.color = new THREE.Color(ply.color);
  return mat;
}

/** plain-colored plywood boxes (drawer boxes) — matches woodMat's tint & opacity */
function plyBoxMat(ply: PlywoodMaterial): THREE.MeshStandardMaterial {
  const op = Math.min(1, Math.max(0.05, ply.opacity));
  return new THREE.MeshStandardMaterial({
    color: ply.color,
    roughness: 0.78,
    metalness: 0.03,
    transparent: op < 1,
    opacity: op,
    depthWrite: op >= 1,
  });
}

type Tag = "carcass" | "door" | "drawer" | "shelf" | "back" | "handle" | "kick" | "panel";

function box(w: number, h: number, d: number, mat: THREE.Material, tag: Tag, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  m.userData.tag = tag;
  return m;
}

/* ================= labels & dimensions ================= */

function textSprite(text: string, color = "#f5b33c"): THREE.Sprite {
  const pad = 26;
  const font = "600 58px 'JetBrains Mono', monospace";
  const cv = document.createElement("canvas");
  const ctx0 = cv.getContext("2d")!;
  ctx0.font = font;
  const w = Math.ceil(ctx0.measureText(text).width) + pad * 2;
  cv.width = w;
  cv.height = 104;
  const ctx = cv.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = "rgba(7,11,18,0.85)";
  ctx.strokeStyle = "rgba(245,179,60,0.45)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(2, 2, cv.width - 4, cv.height - 4, 18);
  else ctx.rect(2, 2, cv.width - 4, cv.height - 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cv.width / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const h = 120;
  sp.scale.set((h * cv.width) / cv.height, h, 1);
  sp.renderOrder = 5;
  return sp;
}

function dimLine(p1: THREE.Vector3, p2: THREE.Vector3, label: string, color = "#f5b33c"): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), mat);
  l.renderOrder = 4;
  g.add(l);
  const dir = p2.clone().sub(p1).normalize();
  const perp = new THREE.Vector3(-dir.y, dir.x, 0);
  if (perp.lengthSq() < 0.01) perp.set(0, 1, 0);
  [p1, p2].forEach((p) => {
    const a = p.clone().addScaledVector(perp, 22);
    const b = p.clone().addScaledVector(perp, -22);
    const t = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat);
    t.renderOrder = 4;
    g.add(t);
  });
  const sp = textSprite(label, color);
  sp.position.copy(p1.clone().add(p2).multiplyScalar(0.5).addScaledVector(perp, 115));
  g.add(sp);
  return g;
}

/* ================= animation records ================= */

interface DoorAnim {
  node: THREE.Object3D;
  base: number; // base rotation.y (swing) or base position.x (slide)
  sign: number;
  cur: number;
  mode: "swing" | "slide";
  dist: number; // slide distance for sliding doors
}
interface DrawerAnim {
  node: THREE.Object3D;
  baseZ: number;
  dist: number;
  cur: number;
}

export interface BuiltCabinet {
  group: THREE.Group;
  doors: DoorAnim[];
  drawers: DrawerAnim[];
  dims: THREE.Group;
  width: number;
}

const OPEN_ANGLE = (108 * Math.PI) / 180;

/* ================= cabinet builder (mm space) ================= */

export function buildCabinetGroup(cab: Cabinet, S: Settings): BuiltCabinet {
  const T = S.bodyThk;
  const kick = kickH(cab, S);
  const BH = boxHeight(cab, S);
  const grp = new THREE.Group();
  const doors: DoorAnim[] = [];
  const drawers: DrawerAnim[] = [];
  const dims = new THREE.Group();

  if (isCorner(cab.type)) buildCorner3D(cab, S, grp, doors, plyMaterialOf(S, cab));
  else if (stackOn(cab)) {
    // stacked boxes — each box is its own mini-carcass (own sides/top/bottom/back)
    const D = carcassDepth(cab, S);
    const heights = stackedHeights(cab);
    const fullH = heights.reduce((a, h) => a + h, 0) - kick;
    const z0 = -cab.depth + (cab.hasFronts !== false ? S.mdfThk : 0);
    let yBase = kick;
    heights.forEach((bh, bi) => {
      const bKick = bi === 0 ? kick : 0;
      const bH = Math.max(40, bh - bKick);
      const wg = new THREE.Group();
      wg.position.set(0, yBase, z0);
      grp.add(wg);
      buildWing3D(cab, S, cab.width, D, bH, wg, doors, drawers, T, plyMaterialOf(S, cab), {
        boxIndex: bi,
        skipKick: true,
        skipFullDoors: true,
        fullH,
      });
      yBase += bH;
    });
    // full-height doors span the entire stack — drawn once at cabinet level
    const wgF = new THREE.Group();
    wgF.position.set(0, kick, z0);
    grp.add(wgF);
    buildFullDoors3D(cab, S, cab.width, D, fullH, wgF, doors, T);
  } else {
    const D = carcassDepth(cab, S);
    const wg = new THREE.Group();
    // overall depth = back panel + carcass + front, so the carcass starts after the back
    wg.position.set(0, kick, -cab.depth + (cab.hasFronts !== false ? S.mdfThk : 0));
    grp.add(wg);
    buildWing3D(cab, S, cab.width, D, BH, wg, doors, drawers, T, plyMaterialOf(S, cab), { fullH: BH });
  }

  buildDims(cab, S, dims);
  grp.add(dims);

  // cover panels (L / R / T / B): real MDF / plywood panels attached to the cabinet
  (cab.covers ?? []).forEach((cv) => buildCover3D(cab, S, cv, grp, kick));

  // tag the group so raycasting can identify which cabinet was clicked
  grp.userData = { cabId: cab.id, cab };

  return { group: grp, doors, drawers, dims, width: cab.width };
}

/**
 * Render one cover panel in 3D. L/R panels stand vertically on the side face
 * (full height × full depth); T/B panels lie horizontally on the top/bottom face
 * (full width × full depth). Every dimension comes from the editable CoverPanel.
 */
function buildCover3D(cab: Cabinet, S: Settings, cv: CoverPanel, grp: THREE.Group, kick: number) {
  // material: plywood covers can pick ANY library material (matId); MDF covers
  // pick a finish — white = flat laminated · oak = oak-tinted grain texture.
  const finish = cv.finish ?? "white";
  const ply = cv.mat === "plywood" ? plyMaterialById(S, cv.matId ?? cab.matId) : OAK_MDF_PLY;
  // grain always follows the cabinet W or H — never D:
  //   L/R covers are H×D panels → grain VERTICAL along the height
  //   T/B covers are W×D panels → grain HORIZONTAL along the width
  const vert = cv.side === "L" || cv.side === "R";
  const mat =
    cv.mat === "plywood"
      ? woodMat(vert ? cv.h : cv.w, vert ? cv.w : cv.h, ply, vert)
      : finish === "oak"
        ? woodMat(vert ? cv.h : cv.w, vert ? cv.w : cv.h, ply, vert)
        : new THREE.MeshStandardMaterial({ color: S.colorMdf, roughness: 0.55, metalness: 0.02 });
  let mesh: THREE.Mesh;
  if (cv.side === "L") {
    // vertical panel on the left face: thk(x) × h(y) × w(z, =depth)
    mesh = box(cv.thk, cv.h, cv.w, mat, "carcass");
    mesh.position.set(-cv.thk / 2, cv.h / 2, -cv.w / 2);
  } else if (cv.side === "R") {
    mesh = box(cv.thk, cv.h, cv.w, mat, "carcass");
    mesh.position.set(cab.width + cv.thk / 2, cv.h / 2, -cv.w / 2);
  } else if (cv.side === "T") {
    // horizontal panel on top: w(x) × thk(y) × depth(z)
    mesh = box(cv.w, cv.thk, cv.h, mat, "carcass");
    mesh.position.set(cv.w / 2, cab.height + cv.thk / 2, -cv.h / 2);
  } else {
    // bottom panel: w(x) × thk(y) × depth(z), below the kick
    mesh = box(cv.w, cv.thk, cv.h, mat, "carcass");
    mesh.position.set(cv.w / 2, -kick - cv.thk / 2, -cv.h / 2);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  grp.add(mesh);
}

interface WingOpts {
  /** stacked boxes: only render the rows belonging to this box (0-based) */
  boxIndex?: number;
  /** stacked boxes: the toe kick is drawn by the cabinet-level builder, not the wing */
  skipKick?: boolean;
  /** stacked boxes: full-height doors are drawn at cabinet level, skip them here */
  skipFullDoors?: boolean;
  /** total carcass height a `full` door spans (whole cabinet, all rows/boxes) */
  fullH?: number;
}

function buildWing3D(
  cab: Cabinet,
  S: Settings,
  w: number,
  d: number,
  BH: number,
  wg: THREE.Group,
  doors: DoorAnim[],
  drawersAcc: DrawerAnim[],
  T: number,
  ply: PlywoodMaterial,
  o?: WingOpts,
) {
  const gap = S.doorGap;

  // column indices that carry a full-height door — non-full doors in those columns
  // must be suppressed (the full door spans the whole carcass, drawn once at the
  // cabinet level) so we don't get one door per box.
  const fullDoorCols = new Set<number>();
  cab.rows.forEach((r) => r.columns.forEach((c, ci) => {
    if (c.door && c.door.full) fullDoorCols.add(ci);
  }));

  // carcass — side panels (notched polygon for L / C)
  const mkSide = (xPos: number) => {
    if (isNotched(cab.type)) {
      const pts = sidePanelOutline(cab, BH);
      const shape = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
      const m = new THREE.Mesh(geo, woodMat(d, BH, ply));
      m.rotation.y = -Math.PI / 2; // shape-x → +z (depth), extrusion → −x
      m.position.set(xPos + T, 0, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.tag = "carcass";
      wg.add(m);
      return m;
    }
    const s = box(T, BH, d, woodMat(BH, d, ply, true), "carcass");
    s.position.set(xPos + T / 2, BH / 2, d / 2);
    wg.add(s);
    return s;
  };
  mkSide(0);
  mkSide(w - T);

  // linear slot — dark groove strip on the inner face of the chosen side panel(s)
  const slotV = cab.slot ?? "none";
  if (slotV !== "none" && !isNotched(cab.type)) {
    const sw = Math.max(6, S.slotWidth);
    const slotFromFront = cab.slotFromFront != null && cab.slotFromFront > 0 ? cab.slotFromFront : S.slotFromFront;
    const zc = d - Math.max(sw, slotFromFront);
    if (slotV === "left" || slotV === "both") {
      const st = box(3, BH, sw, mats.slot, "carcass");
      st.position.set(T + 1.5, BH / 2, zc);
      wg.add(st);
    }
    if (slotV === "right" || slotV === "both") {
      const st = box(3, BH, sw, mats.slot, "carcass");
      st.position.set(w - T - 1.5, BH / 2, zc);
      wg.add(st);
    }
  }

  const bottom = box(w - 2 * T, T, d, woodMat(w, d, ply), "carcass");
  bottom.position.set(w / 2, T / 2, d / 2);
  wg.add(bottom);
  const top = bottom.clone();
  top.position.y = BH - T / 2;
  wg.add(top);
  if (cab.hasBack !== false) {
    const back = box(w - 2, BH - 2, S.backThk, mats.back, "back", false);
    back.position.set(w / 2, BH / 2, -S.backThk / 2);
    wg.add(back);
  }

  // toe kick box — front board recessed by kickDepth; the 2 side boards run the
  // FULL carcass depth (back → recess line) to match the cut-list parts exactly.
  const kick = kickH(cab, S);
  if (kick > 0 && !o?.skipKick) {
    const front = box(w - 2 * T, kick - 4, T, mats.kick, "kick", false);
    front.position.set(w / 2, -kick / 2 - 1, d - S.kickDepth - T / 2);
    wg.add(front);
    const sideDepth = Math.max(20, d - S.kickDepth);
    [-1, 1].forEach((s) => {
      const side = box(T, kick - 4, sideDepth, mats.kick, "kick", false);
      side.position.set(w / 2 + s * (w / 2 - T * 1.5), -kick / 2 - 1, sideDepth / 2);
      wg.add(side);
    });
  }

  // rows & columns
  let y0 = 0;
  let rowIdx = 0;
  cab.rows.forEach((r) => {
    if (o?.boxIndex !== undefined && (r.box ?? 0) !== o.boxIndex) return;
    const rowTop = y0 + r.h;
    const lays = columnLayout(cab, r, S);
    // row section (horizontal divider) — same size as top/bottom, always present
    if (rowIdx++ > 0) {
      const sec = box(w - 2 * T, T, d, woodMat(w, d, ply), "carcass");
      sec.position.set(w / 2, y0 - T / 2, d / 2);
      wg.add(sec);
    }
    lays.forEach((lay, ci) => {
      const colX = T + lay.x; // left edge of the clear opening
      const cw = lay.w;
      const faceW = lays.length === 1 ? w : columnFaceWidth(cab, lay, S);
      const faceCx = lays.length === 1 ? w / 2 : colX + cw / 2;
      const col = lay.col;

      // vertical divider on the right of this column (height − deduction)
      if (!lay.last) {
        const dh = Math.max(20, r.h - S.dividerDeduct);
        const dv = box(T, dh, d, woodMat(T, dh, ply), "carcass");
        dv.position.set(colX + cw + T / 2, y0 + dh / 2, d / 2);
        wg.add(dv);
      }

      // shelves / splitters are handled inside buildColumn3D (it also recurses for nested rows)
      buildColumn3D(cab, S, col, faceW, faceCx, cw, d, y0, r.h, wg, doors, drawersAcc, T, gap, ply, o?.fullH, o?.skipFullDoors, fullDoorCols.has(ci));
    });
    y0 = rowTop;
  });
}

function buildColumn3D(
  cab: Cabinet,
  S: Settings,
  col: ColumnSpec,
  faceW: number,
  faceCx: number,
  clearW: number,
  d: number,
  y0: number,
  rowH: number,
  wg: THREE.Group,
  doors: DoorAnim[],
  drawersAcc: DrawerAnim[],
  T: number,
  gap: number,
  ply: PlywoodMaterial,
  fullH?: number,
  skipFullDoors?: boolean,
  suppressDoor?: boolean,
) {
  const drawerBoxMat = plyBoxMat(ply);
  // column → row split: render each stacked sub-row (which may split into columns again)
  const nested = col.rows ?? [];
  if (nested.length > 0) {
    const total = nested.reduce((a, r) => a + r.h, 0) || 1;
    const leftX = faceCx - clearW / 2;
    let sy = y0;
    nested.forEach((sub, si) => {
      const subH = (sub.h / total) * rowH;
      if (si > 0) {
        const hd = box(clearW, T, d, woodMat(clearW, d, ply), "carcass");
        hd.position.set(faceCx, sy, d / 2);
        wg.add(hd);
      }
      const subLays = columnLayoutIn(clearW, sub.columns ?? [], S);
      subLays.forEach((sl) => {
        const cx = leftX + sl.x + sl.w / 2;
        if (!sl.last) {
          const dh2 = Math.max(20, subH - S.dividerDeduct);
          const dv = box(T, dh2, d, woodMat(T, dh2, ply), "carcass");
          dv.position.set(leftX + sl.x + sl.w + T / 2, sy + dh2 / 2, d / 2);
          wg.add(dv);
        }
        buildColumn3D(cab, S, sl.col, subLays.length === 1 ? faceW : sl.w + T, cx, sl.w, d, sy, subH, wg, doors, drawersAcc, T, gap, ply);
      });
      sy += subH;
    });
    return;
  }

  // shelves for this column (drawers sit per their bank placement; shelves go in the
  // zone left over — above the bank for bottom/custom, below it for top-aligned)
  {
    const dz = col.drawers.reduce((a, dd) => a + dd.frontHeight, 0);
    const bank = drawerBank(col, rowH, S);
    const aboveBank = col.drawerAlign !== "top";
    const shY = y0 + (aboveBank ? bank.y + bank.h : 0);
    const shH = Math.max(0, aboveBank ? rowH - bank.y - bank.h : bank.y);
    const shelvesAbove = col.shelves > 0 ? col.shelves : col.splitter ? col.splitterShelves ?? 0 : 0;

    if (shelvesAbove > 0 && shH > 20) {
      const manual = col.shelfMode === "manual" && (col.shelfPositions?.length ?? 0) > 0;
      const positions: number[] = manual
        ? (col.shelfPositions ?? []).slice(0, shelvesAbove).map((y) => Math.min(Math.max(y, 4), shH - 4))
        : Array.from({ length: shelvesAbove }, (_, k) => shH * (k + 1) / (shelvesAbove + 1));
      for (let k = 0; k < shelvesAbove; k++) {
        const sy2 = shY + positions[k];
        const sd = d - S.shelfFrontSetback - 6;
        const sh = box(clearW - 6, T, sd, woodMat(clearW, d, ply), "shelf");
        sh.position.set(faceCx, sy2, sd / 2 + 2);
        wg.add(sh);
      }
    }
    // splitter panel at the bank edge — always drawn when requested
    if (dz > 0 && shH > 20 && (col.shelves > 0 || col.splitter)) {
      const splitY = aboveBank ? y0 + bank.y + bank.h : y0 + bank.y;
      const sp = box(clearW, T, d, woodMat(clearW, d, ply), "carcass");
      sp.position.set(faceCx, splitY, d / 2);
      wg.add(sp);
    }

    // decorative MDF back panel (niche back) — real panel just in front of the
    // veneer back, inside the carcass (z: 0 → thk)
    if (col.mdfBack) {
      const thk = Math.max(6, col.mdfBackThk || S.mdfThk);
      const mb = box(clearW - 2, rowH - 2, thk, mats.mdf, "carcass");
      mb.position.set(faceCx, y0 + rowH / 2, thk / 2);
      wg.add(mb);
    }

    // hanging rail (suits / dresses) — drawn as a chrome cylinder
    const rail = col.rail ?? "off";
    if (rail !== "off") {
      const railMat = new THREE.MeshStandardMaterial({ color: "#d4af37", roughness: 0.3, metalness: 0.9 });
      const drawRail = (h: number) => {
        const ry = y0 + h;
        const railGeo = new THREE.CylinderGeometry(4, 4, clearW - 10, 12);
        railGeo.rotateZ(Math.PI / 2);
        const railMesh = new THREE.Mesh(railGeo, railMat);
        railMesh.position.set(faceCx, ry, d / 2);
        railMesh.castShadow = true;
        wg.add(railMesh);
        // end supports
        [-1, 1].forEach((s) => {
          const supGeo = new THREE.CylinderGeometry(2, 2, 10, 8);
          const sup = new THREE.Mesh(supGeo, railMat);
          sup.position.set(faceCx + s * (clearW - 10) / 2, ry, d / 2 - 5);
          wg.add(sup);
        });
      };
      const rh = col.railHeight ?? (rail === "suits" ? S.railSuitsH : rail === "dresses" ? S.railDressesH : S.railDouble1);
      if (rail === "suits") drawRail(rh);
      else if (rail === "dresses") drawRail(rh);
      else if (rail === "double") { drawRail(rh); drawRail(S.railDouble2); }

      // shelf(es) above the rail — #1 sits railShelfGap above the rail center,
      // any extra shelves divide the remaining space above #1 evenly
      // (same math as buildColumn in model.ts)
      if (col.railShelf) {
        const count = Math.max(1, Math.round(col.railShelfCount ?? 1));
        const firstY = rh + (S.railShelfGap || 60);
        const above = Math.max(0, rowH - firstY);
        for (let k = 0; k < count; k++) {
          const shelfY = firstY + (count > 1 ? (above * k) / count : 0);
          if (shelfY >= rowH - 10) continue;
          const sd = d - S.shelfFrontSetback - 6;
          const sh = box(clearW - 6, T, sd, woodMat(clearW, d, ply), "shelf");
          sh.position.set(faceCx, y0 + shelfY, sd / 2 + 2);
          wg.add(sh);
        }
      }
    }
  }

  // sub-sections — stacked drawers / shelves / fixed panels with dividers between
  {
    const subs = col.sub ?? [];
    if (subs.length > 0) {
      const subH = rowH / subs.length;
      subs.forEach((sub, si) => {
        const baseY = y0 + si * subH;
        if (si > 0) {
          const sd2 = box(clearW, T, d, woodMat(clearW, d, ply), "carcass");
          sd2.position.set(faceCx, baseY, d / 2);
          wg.add(sd2);
        }
        if (sub.shelves > 0) {
          for (let k = 0; k < sub.shelves; k++) {
            const sy2 = baseY + (subH * (k + 1)) / (sub.shelves + 1);
            const sd3 = d - S.shelfFrontSetback - 6;
            const sh = box(clearW - 6, T, sd3, woodMat(clearW, d, ply), "shelf");
            sh.position.set(faceCx, sy2, sd3 / 2 + 2);
            wg.add(sh);
          }
        } else if (sub.fixed) {
          const fp = box(clearW - 2 * gap, subH - gap, S.mdfThk, mats.mdf, "door");
          fp.position.set(faceCx, baseY + subH / 2, d + S.mdfThk / 2 + gap);
          wg.add(fp);
        } else if (sub.drawers.length > 0) {
          let sdy = baseY;
          sub.drawers.forEach((sdr) => {
            const fh2 = sdr.frontHeight - gap;
            const bd = Math.min(d - 60, sdr.slideDepthCm * 10 - 7);
            const bx = box(Math.max(80, clearW - 90), Math.max(60, fh2 - 20), bd, drawerBoxMat, "drawer", false);
            bx.position.set(faceCx, sdy + fh2 / 2, d - bd / 2 - 10);
            wg.add(bx);
            sdy += sdr.frontHeight;
          });
        }
      });
    }
  }

  {
    const bank = drawerBank(col, rowH, S);
    let dy = y0 + bank.y;
    col.drawers.forEach((dr) => {
      const fh = dr.frontHeight - gap;
      const fcy = dy + fh / 2 + gap / 2;
      const frontZ = d + S.mdfThk / 2 + gap;
      const dg = new THREE.Group();
      dg.position.set(faceCx, fcy, frontZ);
      const w = faceW;
      const fw = faceW - 2 * gap;
      // MDF fronts are opt-in for every drawer, and always inlaid inside the carcass
      if (dr.frontMdf && cab.hasFronts !== false) {
        const inset = S.hiddenFrontInset || 30;
        const fwMdf = dr.hidden ? Math.max(60, w - S.hiddenFrontDeduct) : fw;
        const mf = box(fwMdf, fh, S.mdfThk, mats.mdf, "drawer");
        mf.position.z = -inset;
        dg.add(mf);
      }
      if (cab.isKitchen) {
        const bd = Math.min(495, d - 60);
        const bot = box(w - 108, S.bodyThk * 0.8, bd, drawerBoxMat, "drawer", false);
        bot.position.set(0, -fh / 2 + 34, -S.mdfThk / 2 - gap - bd / 2);
        dg.add(bot);
        const bk = box(w - 120, Math.min(120, fh * 0.5), S.bodyThk * 0.8, drawerBoxMat, "drawer", false);
        bk.position.set(0, -fh / 2 + 80, -S.mdfThk / 2 - gap - bd + 10);
        dg.add(bk);
        drawersAcc.push({ node: dg, baseZ: frontZ, dist: bd * 0.6, cur: 0 });
      } else {
        const slideMm = dr.slideDepthCm * 10;
        const sd = Math.min(d - 60, slideMm - 7);
        const boxH = Math.max(70, Math.min(150, dr.frontHeight - 50));
        const boxW = Math.max(80, w - 90 - (dr.hidden ? 50 : 0));
        const bL = box(S.drawerThk, boxH, sd, drawerBoxMat, "drawer", false);
        bL.position.set(-boxW / 2 + S.drawerThk / 2, -fh / 2 + 30 + boxH / 2, -S.mdfThk / 2 - gap - sd / 2);
        dg.add(bL);
        const bR = bL.clone();
        bR.position.x = boxW / 2 - S.drawerThk / 2;
        dg.add(bR);
        const bF = box(boxW - 2 * S.drawerThk, boxH, S.drawerThk * 0.8, drawerBoxMat, "drawer", false);
        bF.position.set(0, -fh / 2 + 30 + boxH / 2, -S.mdfThk / 2 - gap - 8);
        dg.add(bF);
        const bB = bF.clone();
        bB.position.z = -S.mdfThk / 2 - gap - sd + 8;
        dg.add(bB);
        const bBot = box(boxW - 2, S.backThk, sd - 10, mats.back, "drawer", false);
        bBot.position.set(0, -fh / 2 + 30 + 4, -S.mdfThk / 2 - gap - sd / 2);
        dg.add(bBot);
        drawersAcc.push({ node: dg, baseZ: frontZ, dist: sd * 0.62, cur: 0 });
      }
      // handles only exist on a visible MDF front; hidden drawers never get one
      if (!dr.hidden && dr.frontMdf) {
        const hb = handle(fw * 0.5, "h");
        hb.position.set(0, fh / 2 - 42, S.mdfThk / 2 + 10);
        dg.add(hb);
      }
      wg.add(dg);
      dy += dr.frontHeight;
    });

    // door — also drawn over hidden drawers (their fronts are inlaid inside).
    // A full-height door spans the whole carcass (drawn from y=0 with fullH).
    const allHidden3D = col.drawers.length > 0 && col.drawers.every((dd) => dd.hidden);
    // Suppress a non-full door if another row/box has a full door in the same
    // column index — the full door spans the whole carcass (drawn once at the
    // cabinet level), so per-row doors in that column would duplicate it.
    const suppressed3D = !!suppressDoor && col.door && !col.door.full;
    const drawDoor = cab.hasFronts !== false && col.door && !col.fixed && (col.drawers.length === 0 || allHidden3D) && !(skipFullDoors && col.door?.full) && !suppressed3D;
    if (drawDoor && col.door) {
      if (col.door.full && fullH) buildDoor3D(S, faceW, faceCx, d, 0, fullH, col.door, wg, doors, T, gap, ply);
      else buildDoor3D(S, faceW, faceCx, d, y0, rowH, col.door, wg, doors, T, gap, ply);
    }

    // fixed panel
    if (cab.hasFronts !== false && col.fixed) {
      const fh = rowH - gap;
      const fp = box(faceW - 2 * gap, fh, S.mdfThk, mats.mdf, "door");
      fp.position.set(faceCx, y0 + fh / 2 + gap / 2, d + S.mdfThk / 2 + gap);
      wg.add(fp);
    }
    void clearW;
  }
}

function buildDoor3D(
  S: Settings,
  w: number,
  faceCx: number,
  d: number,
  y0: number,
  rowH: number,
  door: DoorSpec,
  wg: THREE.Group,
  doors: DoorAnim[],
  T: number,
  gap: number,
  ply: PlywoodMaterial,
) {
  const baseX = faceCx - w / 2;
  const { w: dw, h: dh, count } = doorDims(w, rowH, door, S);
  const thk = door.material === "glass" ? 10 : door.material === "mdf" ? door.mdfThk || S.mdfThk : S.bodyThk;
  // MDF oak doors get the oak grain texture (vertical — along the door height);
  // white MDF stays flat; plywood doors get the plywood grain along H, never D.
  const finish = door.material === "mdf" ? door.finish ?? S.mdfFinish : "white";
  const doorMat =
    door.material === "glass"
      ? mats.glass
      : door.material === "mdf"
        ? finish === "oak"
          ? woodMat(dw, dh, OAK_MDF_PLY, true)
          : mats.mdf
        : woodMat(dw, dh, ply, true);
  void T;

  /** aluminum frame bars around a glass pane (pane-local coordinates) */
  const addGlassFrame = (pane: THREE.Mesh) => {
    const fw = 24; // frame bar width
    const bars: [number, number, number, number][] = [
      [dw, fw, 0, dh / 2 - fw / 2], // top
      [dw, fw, 0, -dh / 2 + fw / 2], // bottom
      [fw, dh - 2 * fw, -dw / 2 + fw / 2, 0], // left
      [fw, dh - 2 * fw, dw / 2 - fw / 2, 0], // right
    ];
    bars.forEach(([bw, bhh, bx, by]) => {
      const bar = box(bw, bhh, 4, mats.metal, "door");
      bar.position.set(bx, by, 0);
      pane.add(bar);
    });
  };

  if (door.type === "sliding") {
    // two overlapping panels; open = slide apart horizontally
    for (let j = 0; j < 2; j++) {
      const cx = baseX + (j === 0 ? gap + dw / 2 : w - gap - dw / 2);
      const panel = new THREE.Group();
      panel.position.set(cx, y0 + gap, d + thk / 2 + gap + (j === 1 ? thk + 5 : 0));
      const p = box(dw, dh, thk, doorMat, "door");
      p.position.set(0, dh / 2, 0);
      if (door.material === "glass") addGlassFrame(p);
      panel.add(p);
      const hb = handle(26, "v");
      hb.position.set(j === 0 ? dw / 2 - 20 : -(dw / 2 - 20), dh / 2, thk / 2 + 8);
      panel.add(hb);
      wg.add(panel);
      doors.push({ node: panel, base: cx, sign: j === 0 ? -1 : 1, cur: 0, mode: "slide", dist: dw * 0.72 });
    }
    return;
  }

  for (let j = 0; j < count; j++) {
    const hingeLeft = count === 1 ? door.swing === "left" : j === 0;
    let x1: number;
    if (count === 2) x1 = j === 0 ? gap : w / 2 + gap / 2;
    else x1 = door.style === "inset" ? S.bodyThk + gap : gap;
    const zFront = door.style === "inset" ? d - thk / 2 - 2 : d + thk / 2 + gap;
    const pivot = new THREE.Group();
    pivot.position.set(baseX + (hingeLeft ? x1 : x1 + dw), y0 + (door.style === "inset" ? S.bodyThk + gap : gap), zFront);
    const dp = box(dw, dh, thk, doorMat, "door");
    dp.position.set(hingeLeft ? dw / 2 : -dw / 2, dh / 2, 0);
    if (door.material === "glass") addGlassFrame(dp);
    pivot.add(dp);
    if (door.hasHandle) {
      const hb = handle(Math.min(220, dh * 0.4), "v");
      const hy = door.handlePos === "top" ? dh - 130 : door.handlePos === "bottom" ? 130 : dh / 2;
      hb.position.set(hingeLeft ? dw - 34 : -(dw - 34), hy, thk / 2 + 10);
      pivot.add(hb);
    }
    wg.add(pivot);
    doors.push({ node: pivot, base: 0, sign: hingeLeft ? -1 : 1, cur: 0, mode: "swing", dist: 0 });
  }
}

/**
 * Full-height doors on a STACKED cabinet — drawn once at cabinet level so one
 * door spans all boxes (y=0 → fullH in carcass space).
 */
function buildFullDoors3D(
  cab: Cabinet,
  S: Settings,
  w: number,
  d: number,
  fullH: number,
  wg: THREE.Group,
  doors: DoorAnim[],
  T: number,
) {
  const gap = S.doorGap;
  const ply = plyMaterialOf(S, cab);
  // cabinet-level full door (Boxes control) — one door/pair covering whole width,
  // with left/right/double support
  if (cab.fullDoor && cab.fullDoor !== "off") {
    const fd = cab.fullDoor as string;
    const isGlass = fd.startsWith("glass");
    const suffix = fd.includes("-") ? fd.split("-")[1] : "";
    const type: DoorSpec["type"] = suffix === "double" ? "double" : suffix === "left" || suffix === "right" ? "single" : (cab.width > 620 ? "double" : "single");
    const swing: DoorSpec["swing"] = suffix === "right" ? "right" : "left";
    const door: DoorSpec = {
      type,
      style: "overlay",
      swing,
      material: isGlass ? "glass" : "mdf",
      finish: S.mdfFinish,
      mdfThk: S.mdfThk,
      hingeBrand: "Universal 35mm",
      hasHandle: true,
      handlePos: "center",
      full: true,
      hingeCount: cab.fullDoorHinges,
      hOverride: cab.fullDoorHOverride != null && cab.fullDoorHOverride > 0 ? cab.fullDoorHOverride : undefined,
      wOverride: cab.fullDoorWOverride != null && cab.fullDoorWOverride > 0 ? cab.fullDoorWOverride : undefined,
    };
    buildDoor3D(S, w, w / 2, d, 0, fullH, door, wg, doors, T, gap, ply);
    return;
  }
  cab.rows.forEach((r) => {
    const lays = columnLayout(cab, r, S);
    lays.forEach((lay) => {
      const col = lay.col;
      if (!col.door?.full || col.fixed) return;
      const allHidden3D = col.drawers.length > 0 && col.drawers.every((dd) => dd.hidden);
      if (!(col.drawers.length === 0 || allHidden3D)) return;
      const faceW = lays.length === 1 ? w : columnFaceWidth(cab, lay, S);
      const faceCx = lays.length === 1 ? w / 2 : T + lay.x + lay.w / 2;
      buildDoor3D(S, faceW, faceCx, d, 0, fullH, col.door, wg, doors, T, gap, ply);
    });
  });
}




function handle(len: number, orient: "h" | "v"): THREE.Group {
  const g = new THREE.Group();
  const r = 6;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(30, len), 14), mats.metal);
  grip.castShadow = true;
  grip.userData.tag = "handle";
  if (orient === "h") grip.rotation.z = Math.PI / 2;
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 18, 10), mats.metal);
  p1.rotation.x = Math.PI / 2;
  p1.userData.tag = "handle";
  const p2 = p1.clone();
  const off = Math.max(30, len) / 2 - 12;
  if (orient === "h") {
    p1.position.set(-off, 0, -8);
    p2.position.set(off, 0, -8);
  } else {
    p1.position.set(0, -off, -8);
    p2.position.set(0, off, -8);
  }
  g.add(p1, p2, grip);
  return g;
}

/* ---- corner ---- */
function buildCorner3D(cab: Cabinet, S: Settings, grp: THREE.Group, doors: DoorAnim[], ply: PlywoodMaterial) {
  const T = S.bodyThk;
  const kick = kickH(cab, S);
  const BH = cab.height - kick;
  const W = cab.width;
  const D = cab.depth;
  const K = Math.min(220, Math.round(Math.min(W, D) * 0.32));
  const gap = S.doorGap;
  const Ld = Math.hypot(W - K, D - K);
  const pts: [number, number][] = [
    [0, 0],
    [W, 0],
    [W, -K],
    [K, -D],
    [0, -D],
  ];
  const insetPoly = (inset: number): [number, number][] => {
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return pts.map(([x, z]) => {
      const dx = cx - x;
      const dz = cz - z;
      const l = Math.hypot(dx, dz);
      return [x + (dx / l) * inset, z + (dz / l) * inset] as [number, number];
    });
  };
  const plate = (y: number, th: number, tag: Tag, inset = 0) => {
    const sh = inset ? insetPoly(inset) : pts;
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(sh.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: th, bevelEnabled: false });
    const m = new THREE.Mesh(geo, woodMat(W, D, ply));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y + th;
    m.userData.tag = tag;
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
  };
  plate(kick, T, "carcass");
  if (cab.type === "cornerWall") plate(kick + BH - T, T, "carcass");

  const bR = box(W, BH, T, woodMat(W, BH, ply), "carcass");
  bR.position.set(W / 2, kick + BH / 2, T / 2);
  grp.add(bR);
  const bL = box(T, BH, D, woodMat(D, BH, ply), "carcass");
  bL.position.set(T / 2, kick + BH / 2, -D / 2);
  grp.add(bL);
  const wingA = box(T, BH, K, woodMat(K, BH, ply), "carcass");
  wingA.position.set(W - T / 2, kick + BH / 2, -K / 2);
  grp.add(wingA);
  const wingB = box(K, BH, T, woodMat(K, BH, ply), "carcass");
  wingB.position.set(K / 2, kick + BH / 2, -D + T / 2);
  grp.add(wingB);

  cab.rows.forEach((r) => {
    const col = r.columns[0];
    if (!col) return;
    for (let k = 0; k < col.shelves; k++) {
      const sy = kick + (r.h * (k + 1)) / (col.shelves + 1);
      const sh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(new THREE.Shape(insetPoly(T + 4).map(([x, z]) => new THREE.Vector2(x, -z))), { depth: T, bevelEnabled: false }),
        woodMat(W - 2 * T, D - 2 * T, ply),
      );
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = sy + T;
      sh.castShadow = true;
      sh.receiveShadow = true;
      sh.userData.tag = "shelf";
      grp.add(sh);
    }
    if (!col.door) return;
    const dh = r.h - 2 * gap;
    const dw = Ld - 2 * gap;
    const thk = col.door.material === "mdf" ? col.door.mdfThk || S.mdfThk : S.bodyThk;
    const a = new THREE.Vector3(W, 0, -K);
    const b = new THREE.Vector3(K, 0, -D);
    const v = b.clone().sub(a);
    const ang = Math.atan2(-v.z, v.x);
    const n = new THREE.Vector3(-v.z, 0, v.x).normalize();
    const off = thk / 2 + gap;
    const pivot = new THREE.Group();
    pivot.position.set(a.x + n.x * off, kick + gap, a.z + n.z * off);
    pivot.rotation.y = ang;
    const door = box(dw, dh, thk, col.door.material === "glass" ? mats.glass : col.door.material === "mdf" ? mats.mdf : woodMat(dw, dh, ply), "door");
    door.position.set(dw / 2, dh / 2, 0);
    pivot.add(door);
    const hb = handle(Math.min(220, dh * 0.4), "v");
    hb.position.set(dw - 34, dh - 130, thk / 2 + 10);
    pivot.add(hb);
    grp.add(pivot);
    doors.push({ node: pivot, base: ang, sign: -1, cur: 0, mode: "swing", dist: 0 });
  });
}

/* ---- dims ---- */
function buildDims(cab: Cabinet, S: Settings, dims: THREE.Group) {
  const H = cab.height;
  const W = cab.width;
  const D = cab.depth;
  dims.add(dimLine(new THREE.Vector3(0, H + 130, 60), new THREE.Vector3(W, H + 130, 60), `${W}`));
  dims.add(dimLine(new THREE.Vector3(W + 150, 0, 60), new THREE.Vector3(W + 150, H, 60), `${H}`));
  dims.add(dimLine(new THREE.Vector3(-150, 40, 0), new THREE.Vector3(-150, 40, -D), `${D}`));
  const kick = hasKick(cab, S) ? S.kickHeight : 0;
  if (kick > 0) {
    const sp = textSprite(`kick ${S.kickHeight}`, "#7dd3fc");
    sp.position.set(-280, kick / 2, 120);
    dims.add(sp);
  }
}

/** raw project panel — a standing W×H×thk box (grain vertical on the face) */
function buildPanel3D(pn: PanelItem, S: Settings): THREE.Group {
  const g = new THREE.Group();
  // clamp non-finite values (NaN geometry would poison the scene bounding box)
  const w = Number.isFinite(pn.w) ? pn.w : 5;
  const h = Number.isFinite(pn.h) ? pn.h : 5;
  const t = Number.isFinite(pn.thk) ? pn.thk : 0;
  const thk = t > 0 ? t : pn.material === "plywood" ? S.bodyThk : pn.material === "back" ? S.backThk : S.mdfThk;
  const W = Math.max(5, w);
  const H = Math.max(5, h);
  let mat: THREE.Material;
  if (pn.material === "plywood") {
    const ply = plyMaterialById(S, pn.matId ?? null);
    mat = ply && ply.solid ? plyBoxMat(ply) : woodMat(W, H, ply, true);
  } else if (pn.material === "back") {
    mat = new THREE.MeshStandardMaterial({ color: "#5d6b52", roughness: 0.9, metalness: 0.02 });
  } else {
    const finish = pn.finish ?? S.mdfFinish ?? "white";
    mat =
      finish === "oak"
        ? woodMat(W, H, OAK_MDF_PLY, true)
        : new THREE.MeshStandardMaterial({ color: S.colorMdf, roughness: 0.55, metalness: 0.02 });
  }
  const m = box(W, H, thk, mat, "panel");
  // stands on the floor, floating 60mm in front of the cabinet wall plane so
  // it reads as a separate object
  m.position.set(W / 2, H / 2, thk / 2 + 60);
  g.add(m);
  return g;
}

/* ================= viewer ================= */

export interface ViewerOptions {
  spacing: number;
  showDims: boolean;
  followLayout?: boolean;
  /** raw project panels — standing boxes on the floor (auto-flow after the row) */
  panels?: PanelItem[];
}

export class CabinetViewer {
  private renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private ro: ResizeObserver;
  private raf = 0;
  private container: HTMLElement;
  private built: BuiltCabinet[] = [];
  private builtWrap = new THREE.Group();
  /** raw project panels — floating standing panels on the floor */
  private panelGroups: THREE.Group[] = [];
  private center = new THREE.Vector3(1.5, 0.45, 0);
  private radius = 2.2;
  private dirLight: THREE.DirectionalLight;
  doorsOpen = false;
  drawersOpen = false;
  layerVis: Record<Tag, boolean> = { carcass: true, door: true, drawer: true, shelf: true, back: true, handle: true, kick: true, panel: true };
  private disposed = false;
  private visible = true;
  private io: IntersectionObserver | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a0f18");
    // long runs / 2D layouts with large X coords must stay on the floor, in
    // view and out of the fog — same OLD disc+grid look, just bigger
    this.scene.fog = new THREE.Fog("#0a0f18", 80, 240);

    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.02, 400);
    this.camera.position.set(2.6, 1.6, 3.4);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.015;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 140;
    this.controls.target.set(0.8, 0.45, 0);

    const hemi = new THREE.HemisphereLight("#dfe9ff", "#1b1409", 1.05);
    this.scene.add(hemi);
    this.dirLight = new THREE.DirectionalLight("#fff1da", 2.1);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.bias = -0.0004;
    this.scene.add(this.dirLight, this.dirLight.target);
    const fill = new THREE.DirectionalLight("#9db4ff", 0.5);
    fill.position.set(-4, 3, -5);
    this.scene.add(fill);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64), new THREE.MeshStandardMaterial({ color: "#0c1320", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(140, 140, "#1c2940", "#131e30");
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    grid.position.y = 0.002;
    this.scene.add(grid);

    this.scene.add(this.builtWrap);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);

    // only render while the canvas is actually on screen — saves CPU/GPU when
    // you are working in the cut list, nesting or settings tabs
    this.io = new IntersectionObserver((es) => (this.visible = es.some((e) => e.isIntersecting)), { threshold: 0.01 });
    this.io.observe(container);

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      if (this.visible && !document.hidden) this.tick();
    };
    loop();
  }

  private tick() {
    this.controls.update();
    const speed = 0.11;
    this.built.forEach((b) => {
      b.doors.forEach((d) => {
        const target = this.doorsOpen ? 1 : 0;
        d.cur += (target - d.cur) * speed;
        if (d.mode === "swing") d.node.rotation.y = d.base + d.sign * d.cur * OPEN_ANGLE;
        else d.node.position.x = d.base + d.sign * d.cur * d.dist;
      });
      b.drawers.forEach((dr) => {
        const target = this.drawersOpen ? 1 : 0;
        dr.cur += (target - dr.cur) * speed;
        dr.node.position.z = dr.baseZ + dr.cur * dr.dist;
      });
    });
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 500;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setData(cabs: Cabinet[], S: Settings, opts: ViewerOptions) {
    woodOpacity = clampOp(S.opacityPlywood); // carcass panels use the plywood texture
    mats = m(S);
    this.built.forEach((b) => disposeObject(b.group));
    this.built = [];
    this.panelGroups.forEach((g) => disposeObject(g));
    this.panelGroups = [];
    this.builtWrap.clear();

    let x = 0;
    const spacing = isFinite(opts.spacing) ? opts.spacing : 0;
    const okLayout = (l: { x: number; y: number } | null | undefined) => !!l && Number.isFinite(l.x) && Number.isFinite(l.y);
    cabs.forEach((cab) => {
      // a cabinet with corrupt (NaN/missing) dimensions would create NaN
      // geometry → NaN bounding box → NaN camera → the WHOLE scene goes blank
      if (!Number.isFinite(cab.width) || !Number.isFinite(cab.height) || !Number.isFinite(cab.depth)) return;
      const q = Math.max(1, cab.qty || 1);
      for (let i = 0; i < q; i++) {
        const bc = buildCabinetGroup(cab, S);
        bc.group.scale.setScalar(0.001);
        // when following the 2D arrangement, a laid-out cabinet sits at its
        // arranged spot (x along the wall, y = lift above the floor); qty>1
        // duplicates continue side-by-side from that spot. Cabinets without a
        // layout keep the classic auto-row on the floor.
        const laid = opts.followLayout && okLayout(cab.layout);
        if (laid) {
          bc.group.position.x = (cab.layout!.x + i * (cab.width + spacing)) / 1000;
          bc.group.position.y = cab.layout!.y / 1000;
        } else {
          bc.group.position.x = x / 1000;
          bc.group.position.y = 0;
          x += cab.width + spacing;
        }
        // Plan-view depth offset (mm): lets a cabinet stand IN FRONT of another
        // one (positive z = further into the room, toward the viewer)
        const zOff = cab.plan && Number.isFinite(cab.plan.z) ? cab.plan.z : 0;
        bc.group.position.z = zOff / 1000;
        bc.dims.visible = opts.showDims;
        this.builtWrap.add(bc.group);
        this.built.push(bc);
        this.applyLayers(bc);
      }
    });

    // ---- raw project panels — floating standing panels on the floor ----
    // (same auto-flow as the cabinet row: after the rightmost cabinet)
    if (opts.panels && opts.panels.length) {
      let px = x + 80;
      opts.panels.forEach((pn) => {
        // a panel with NaN w/h would create NaN geometry → NaN bbox → blank scene
        if (!Number.isFinite(pn.w) || !Number.isFinite(pn.h)) return;
        const grp = buildPanel3D(pn, S);
        const laid = opts.followLayout && !!pn.layout && Number.isFinite(pn.layout.x) && Number.isFinite(pn.layout.y ?? 0);
        if (laid) {
          grp.position.x = pn.layout!.x / 1000;
          grp.position.y = (pn.layout!.y ?? 0) / 1000;
        } else {
          grp.position.x = px / 1000;
          px += Math.max(50, pn.w) + 60;
        }
        const pz = pn.plan && Number.isFinite(pn.plan.z) ? pn.plan.z : 0;
        grp.position.z = pz / 1000;
        this.builtWrap.add(grp);
        this.panelGroups.push(grp);
        this.setVis(grp);
      });
    }

    const bbox = new THREE.Box3().setFromObject(this.builtWrap);
    // a NaN in ANY mesh position yields a NaN bbox — framing the camera from it
    // would blank the entire 3D view, so reframe only from finite extents
    if (!bbox.isEmpty() && Number.isFinite(bbox.min.x) && Number.isFinite(bbox.min.y) && Number.isFinite(bbox.min.z) && Number.isFinite(bbox.max.x) && Number.isFinite(bbox.max.y) && Number.isFinite(bbox.max.z)) {
      bbox.getCenter(this.center);
      const size = bbox.getSize(new THREE.Vector3());
      this.radius = Math.max(size.x, size.y, size.z, 0.6) / 2;
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.controls.target.copy(this.center);
      this.camera.position.copy(this.center.clone().addScaledVector(dir, this.radius * 2.6));
      this.dirLight.position.set(this.center.x + this.radius * 1.4, this.radius * 2.6 + 1.2, this.center.z + this.radius * 1.8);
      this.dirLight.target.position.copy(this.center);
      const sc = this.dirLight.shadow.camera;
      sc.left = -this.radius * 1.7;
      sc.right = this.radius * 1.7;
      sc.top = this.radius * 1.7;
      sc.bottom = -this.radius * 1.7;
      // long runs sit far from the light — keep the shadow frustum deeper than the scene
      sc.far = Math.max(60, this.radius * 8);
      sc.updateProjectionMatrix();
    }
  }

  setShowDims(v: boolean) {
    this.built.forEach((b) => (b.dims.visible = v));
  }

  private applyLayers(bc: BuiltCabinet) {
    this.setVis(bc.group);
  }

  private setVis(obj: THREE.Object3D) {
    obj.traverse((o) => {
      const tag = (o as THREE.Mesh).userData?.tag as Tag | undefined;
      if (tag && tag in this.layerVis) o.visible = this.layerVis[tag];
    });
  }

  setLayer(tag: string, vis: boolean) {
    this.layerVis[tag as Tag] = vis;
    this.built.forEach((b) => this.applyLayers(b));
    this.panelGroups.forEach((g) => this.setVis(g));
  }

  setView(preset: "iso" | "top" | "front" | "side" | "reset") {
    const dirs: Record<string, THREE.Vector3> = {
      iso: new THREE.Vector3(1.15, 0.8, 1.45),
      top: new THREE.Vector3(0.02, 1, 0.02),
      front: new THREE.Vector3(0, 0.16, 1.6),
      side: new THREE.Vector3(1.6, 0.24, 0.02),
      reset: new THREE.Vector3(1.15, 0.8, 1.45),
    };
    const d = dirs[preset].normalize();
    const dist = preset === "top" ? this.radius * 2.9 : this.radius * 2.6;
    this.controls.target.copy(this.center);
    this.camera.position.copy(this.center.clone().addScaledVector(d, dist));
    this.controls.update();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.ro.disconnect();
    this.built.forEach((b) => disposeObject(b.group));
    this.panelGroups.forEach((g) => disposeObject(g));
    this.panelGroups = [];
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat && !Object.values(mats).includes(mat as (typeof mats)[keyof typeof mats])) mat.dispose();
  });
}
