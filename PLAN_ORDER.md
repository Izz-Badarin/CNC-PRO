# CNC-PRO – Ordered Execution Plan (NO ACT, PLAN ONLY)

Date: 2026-09-09
Branch: arena/01a083d7-cnc-pro (merged to main)
Request: user asked "also did the last act do this also – order: 1) #1 remove drawer boxes + #2 pins fix + #4 rail center + #8 DXF fix, 2) #3 back follows material, 3) #5 panel drag in 2D, 4) Phases A-U in order, 5) New O exploded per-cabinet report – plan dont act now dont edit"

---

## STATUS — 2026-09-09, applied on `arena/01a08461-cnc-pro`

The session patch `01a083d7-8302-7c3e-a78b-15a5801c679d.patch` was ported into the repo
and the conflicts resolved by hand. Verified with `tsc --noEmit` (clean), `npm test`
(all green, new regression cases added) and `vite build` (1.30 MB single file).

**Now implemented**

- ✅ Phase 2 · #3 **back follows material** — `buildBody` + `buildStackedBody` stamp
  `matId: cabinetPly.id` on every Back part, so nesting groups `back@plyId` per plywood.
  *Ported fix:* the patch's hunks referenced `cabinetPly` without declaring it in those
  two functions → would have thrown `ReferenceError` on every cut-list build; both now
  derive it via `plyMaterialOf(S, cab)`.
- ✅ Phase 3 · #5 **panel drag in 2D** — `panelAt`/`movePanel` in `View2DTab` + plan-view
  X-drag in `PlanTab` (snap 5 mm, persisted in `ProjectInfo.panels[].layout`).
  *Ported fix:* `App.tsx` never passed `setPanels` to either tab, so the drag was inert.
- ✅ Phase 5 · New O **exploded per-cabinet report** — `src/lib/explodedReport.ts` plus
  the BOM-tab buttons. *Ported fix:* all 6 `BomTab.tsx` hunks rejected (file had drifted),
  so the report engine was orphaned — the button, `explodedReport()` and the per-cabinet
  PNG chip are now hand-ported.
- ✅ #1 drawer boxes rows removed, #2 shelf pins = shelves × 4, hinge note re-banded,
  glass `fullDoor` variants (`-left/-right/-double`) parsed in BOM **and** report — the
  repo still compared `cab.fullDoor === "glass"`, which never matches the new values.
- ✅ #8 DXF layers (`SLOT`, `CLAMP_HOLES`, `SHELF_HOLES`, `BANDING`, `GLASS DOOR REF`,
  Ø35 cups excluded) — verified already present and covered by the smoke tests.
- ✅ Also fixed while porting: `bomReportHtml`/`BomTab` filename slug used a
  double-escaped regex (`[^\\w\\-]`), which replaced every ordinary character with `_`.

**Still open**

- Open Door View draws doors at 90° (report) vs. the 108° swing used in 3D — deliberate,
  matches the shipped schematic; raise if 108° is wanted on paper.
- `snapshotExploded` offsets (±150 X / ±120 Y / −100 Z / +200 Z) are applied scene-wide;
  per-cabinet exploded capture relies on `snapshotExplodedCabinet(id)`.
- Phases A–U "UI polish" items (B, D) untouched by this patch.

**Left out on purpose:** `patches/*.patch` (nested copies of this same diff) and
`PREVIOUS_CHANGES_AFTER_MERGE.md` (a reconstruction guide for work that is now applied).

---


---

## 1) Did last act cover the requested order?

**Last act (commit fa0e1c7) DID:**
- ✅ #1 remove drawer boxes row from BOM – removed from BomTab.tsx + export.ts (no longer listed, only hinges/slides/rails/pins)
- ✅ #2 pins fix – shelf pins = totalShelves*4 with note "X shelves ×4", drilling tab still shows individual hole count (e.g. 132)
- ✅ #4 rail center – rail bracket pilots at D/2 (carcassDepth/2) in model.ts buildColumn → drillLeft/Right at railCenterX = D/2, exported as shelf holes
- ✅ Slot editable – global SettingsTab Num + per-cabinet Num in EditTab, 3D groove uses `cab.slotFromFront ?? S.slotFromFront`
- ✅ Hinge bands new rule – defaults.ts `<900→2, 900-1799→3, 1800-2399→4, 2400-2999→5, ≥3000→6`, hingeCupYs first/last 140mm, middle even, UI Chip "Auto — N hinges"
- ✅ Full doors on stacked boxes – scene.ts buildFullDoors3D handles cab.fullDoor (now mdf-left/right/double + glass-left/right/double), spans fullH, animates with doorFrac, View2DTab draws full-cabinet door, model.ts genCabinetFullDoor parses suffix
- ✅ Door style control – FRONTS = MDF Left/Right/Double, Glass Left/Right/Double, Sliding, Drawers, Fixed, Open – replaces swing+count, doorFromFront parses material+type/swing
- ✅ Door W×H editable – doorDims returns wAuto/hAuto, actual w/h with wOverride/hOverride, EditTab shows W×H auto Chip + Actual Chip + Override W/H Num (0=auto), fullDoor H/W overrides too
- ✅ Build clean – vite build + tsc no errors, dist updated

**Last act DID NOT (still TODO):**
- ❌ #3 back follows material – 3D back already uses ply color (woodMat with plyMaterialOf), but cut-list Part material = "back" with no matId, so nesting groups as "back@def" not per-plywood material. Need to carry matId.
- ❌ #5 panel drag in 2D – View2DTab panelPositions exists, but drag hit-test cabAt only checks cabinets, panels not draggable, no snap, no layout persistence for panels in 2D
- ❌ #8 DXF fix – slot groove currently exported as type "slot" with x=-1 trick, but DXF writer in lib/dxf.ts (or export.ts frontElevationDxf) may still put slot on CUT layer or miss CLAMP_HOLES/SHELF_HOLES distinction. Need audit: slot should be on SLOT layer, glass reference excluded, hinge cups excluded, banding markers on BANDING, L/C notched outline as poly, not rect.
- ❌ Phases A-U – only subset done (hinges, door dims, slot). Full A-U list not fully implemented.
- ❌ New O exploded per-cabinet report – current Full Report is 7-page BOM report (cover, 3D screenshot, elevation, cabinets list, BOM, cut list by material, nesting, banding). Phase 14 you did earlier is NOT the requested exploded view per cabinet.

---

## 2) Ordered Plan (as requested)

### Phase 1 – Small safe fixes (order: #1, #2, #4, #8)

**Goal:** close the tiny BOM/drilling/DXF gaps, no model restructure.

1. **#1 Drawer boxes removal – verify**
   - File: `src/tabs/BomTab.tsx`, `src/lib/export.ts`
   - Action: ensure no "Drawer boxes" or "Drawer sides" rows in BOM, only hardware. Already done, add regression test.
   - Acceptance: BOM table has no drawer box material rows.

2. **#2 Shelf pins fix – verify**
   - File: `BomTab.tsx` `totalShelves = all.filter(p.name.startsWith("Shelf")).reduce(...)` → `shelfPins = totalShelves*4`
   - Action: keep drilling tab hole count (e.g., 132 holes) separate from BOM pcs (e.g., 160 pcs). Add chip note.
   - Acceptance: BOM shows "Shelf pins (32mm) 160 pcs – 40 shelves ×4", Drilling shows 132 hole ops.

3. **#4 Rail center**
   - File: `src/lib/model.ts` `buildColumn` – already at D/2, but verify stacked boxes too.
   - Action: ensure railCenterX = D/2 for both L and R, clamped inside panel, 2 pilots per rail, double rail = 4 pilots.
   - Files to touch if missing: `model.ts`, `scene.ts` (3D cylinder at d/2 already), `DrillTab.tsx` (show pilots).
   - Acceptance: rail pilots X = depth/2, Y = rail height.

4. **#8 DXF fix**
   - File: `src/lib/dxf.ts` (or inline writer), `src/tabs/DxfTab.tsx`, `src/lib/model.ts` groove kind="slot"
   - Action:
     - slot grooves → DXF layer "SLOT", not CUT, width = settings.slotWidth
     - clamp holes → layer "CLAMP_HOLES" only if settings.clampHoles
     - shelf/slide holes → SHELF_HOLES / SLIDE_HOLES
     - glass doors reference → exclude from DXF, add TEXT "GLASS DOOR REF" on LABEL layer
     - hinge cups → excluded from plywood DXF (already only in door part)
     - L/C notched side panels → polyline outline, not rect
     - back panel → full W×H outline
   - Acceptance: DXF opens in AutoCAD/librecad, layers visible, slot at 80mm from front.

### Phase 2 – #3 Back follows material (model + 3D)

**Goal:** back panel inherits cabinet plywood material id so 3D color + nesting grouping matches carcass.

- Files: `src/types.ts` (Part.matId already exists), `src/lib/model.ts` `buildBody` and `buildStackedBody` – back panel mk currently `material:"back", thickness:S.backThk` with no matId.
- Plan:
  - Option A (preferred, low risk): keep material="back" but add `matId: cabinetPly.id` – nesting groups as `back@plyId`, 3D already uses ply color.
  - Option B: change material to "plywood" when settings flag `backFollowsPly` true – then thickness still S.backThk but banding none, grain false.
  - Update `woodMat` in `scene.ts` – already uses ply for back, verify opacity.
  - Update `bandingByMaterial` – back never banded, so no change.
  - Update `export.ts` bomReportHtml – materials map for back should include matId.
- Acceptance: 2 cabinets with different plywood materials show different back colors in 3D, cut list groups backs per material, nesting sheet count per back material.

### Phase 3 – #5 Panel drag in 2D

**Goal:** raw panels (PanelItem) draggable in 2D front view like cabinets.

- File: `src/tabs/View2DTab.tsx`
- Current: `panelPositions` auto-flow after rightmost cabinet, `cabAt` only checks cabinets.
- Plan:
  - Extend `DragGuides` to handle panels.
  - Create `panelAt(vx,vy)` similar to `cabAt` using `ppos` (panelPositions).
  - `snapDrag` – add X candidates for panels, Y candidates floor/stack for panels.
  - `moveCab` → `movePanel` – setPanels layout {x,y}
  - `pos` + `ppos` combined for overlap detection – panels should also warn on overlap?
  - Ensure `viewMetrics` extra already includes panels maxX/maxH – it does.
  - Persist panel layout in `ProjectInfo.panels[].layout`.
- Acceptance: drag panel in 2D, snap 5mm, X/Y PosInput appears, floorAll includes panels, export frontElevation respects panel layout.

### Phase 4 – Phases A-U (in order)

Reconstructed from code comments, existing TODOs, and your pasted spec. This is the full roadmap you referred to as "Phases A-U in order above". Each phase is small, testable, and builds on previous.

**A – Project & Units**
- ProjectInfo name/type/customer/status/notes, panels array, autosave. Units mm everywhere.

**B – Plywood Materials Library**
- Settings.plyMaterials[] with id/name/color/opacity/solid/grainRot, defaultPlyId, per-cabinet matId, per-cover matId, per-panel matId. Already done, needs UI polish.

**C – Cabinet Types & Dimensions**
- Types: custom/base/wall/tall/cornerBase/cornerWall/L/C, TYPE_META dims/kick, width/height/depth/qty, hasToeKick/hasFronts/hasBack. Done.

**D – Rows / Columns / Shelves**
- Row heights sum = BH, columnLayoutIn flexible widths, shelves auto/manual Y, shelf gap min/max, shelfIncrease, shelfFrontSetback. Done, but needs manual Y UI for rail shelves (done) and shelves (done).

**E – Drawers & Slides**
- Drawer bank bottom/top/custom, slideDepthCm, hidden, frontMdf opt-in, slideHolePatterns per depth, drawerHoleYStart/YStep, kitchen mode 500mm. Drawer box dims: outer W-33-49-50 hidden extra, depth = slide-7. Done.

**F – Doors – Style & Material**
- Door types single/double/sliding, style overlay/inset, swing left/right, material mdf/poly/glass, finish white/oak, mdfThk from settings, hingeBrand. FRONTS picker now MDF Left/Right/Double, Glass Left/Right/Double. Done.

**G – Door Dimensions (Rule F)**
- doorDims: hAuto = rowH-2*gap (overlay) or -2*(bodyThk+gap) (inset), wAuto = faceW-2*gap etc., wOverride/hOverride editable, Chip auto vs actual. Done for sections + fullDoor.

**H – Hinges (Rule E)**
- doorHingeCount bands <900→2 etc., hingeCupDiameter 35, depth 12.5, edge 21.5, hingeCupYs 140mm from ends, even middle. HingeCount override select Auto/1-6, Chip shows Auto—N. Done.

**I – Glass Door Reference**
- Glass doors produce no cut part, but generate reference Part with holes for cup positions, rendered dashed in Drilling tab, excluded from DXF, TEXT label "GLASS DOOR REF". Need to ensure glassDoorRefs includes fullDoor glass variants.

**J – Linear Slot**
- Slot width global, slotFromFront global + per-cabinet override, side panels L/R/Both, full height, D - max(sw, slotFromFront) center, mirrored for R panel, groove kind="slot", DXF SLOT layer. Done.

**K – Stacked Boxes**
- stack: number[] heights, stackedHeights, stackTotal, rows with box index, per-box side panels/top/bottom/back, toe kick only box1, full-height door spans all boxes (cab.fullDoor). Done.

**L – Cover Panels**
- CoverSide L/R/T/B, w/h/thk/mat/finish/matId, full height/depth by default, real parts, nesting, DXF, 2D/3D rendering, grain direction vertical for L/R (H), along D for T/B. Done.

**M – Notched Panels (L/C)**
- L: lCutW/lCutH top-front corner removed, C: cCutW/cCutTopH/cCutMidH/cCutOffsetFromBottom, sidePanelOutline poly, mirrored for R, 3D extrude. Done.

**N – Hanging Rail**
- rail off/suits/dresses/double, railHeight override, railSuitsH/DressesH/Double1/Double2, railShelf boolean, railShelfMode auto/manual, railShelfYs auto max count gaps ≥ railShelfMinGap, manual Y list, shelf parts above rail + pin holes. Done, pilots at D/2.

**O – BOM / Hardware (M+U+L)**
- BOM rows: materials from nesting sheetCount, bandingByMaterial, hinges from drillOps + glass, slides by cm pairs, hanging rails count, shelf pins shelves*4. Handles removed. Full multi-page report includes 3D PNG + elevation. Done, but need to remove drawer boxes (done) and fix pins (done).

**P – Cut List & Grain Lock**
- allParts rotates once (L-W swap) then grain lock, partId, mergePieces, generatePanelParts, applyGrain. MDF oak grain locked, white not. Done.

**Q – Nesting**
- nestParts one-material-at-a-time, sheet size 2440×1220 plywood/back locked, MDF auto 3050×1220 if tall>2420 else 2440×1220, margin/clearance/minOffcut/maxSheets/timeBudget, strategies, offcuts, avgUtil. Done.

**R – Drilling**
- drillOps from holes+grooves, hole kinds shelf/slide/hinge, shelfHolesPerSide, shelfHoleCenter/Spacing, slideHoleDiameter, drawer grooves 5.7mm × (slider-grooveShorter) @ grooveFromBottom. Done.

**S – DXF Export**
- DxfTab groups by material@matId, layers CUT, CLAMP_HOLES, SHELF_HOLES, SLIDE_HOLES, DRAWER_GROOVE, SLOT, SHEET, LABEL, BANDING. Units mm R12. Needs #8 fix.

**T – 2D Front View**
- layoutCabs auto side-by-side, cab.layout manual x/y, drag with snap 5mm, guides vx/vy, overlapPairs warning, chain dims, overall dim, height dims, full-height doors, cover panels L/R only, mdfBack niche, rail + shelves above. Needs #5 panel drag.

**U – 3D View & Plan View**
- Three.js CabinetViewer, woodMat tinted per plyMaterial, opacity, room floor/wall/baseboard, OrbitControls, doorFrac 0-1 swing 108°, drawersOpen, layer toggles carcass/door/drawer/shelf/back/kick/panel, snapshot PNG, export GLB/OBJ mm, followLayout from 2D x/y + plan z. Done, but back follows material needs Phase 2.

### Phase 5 – New O Exploded Per-Cabinet Report (Phase 14 corrected)

**Your correction:** Phase 14 you did earlier is NOT correct. You want: "generate CABINET Exploded View, Open Door View, and Material Cut List! a detailed exploded view of a kitchen cabinet unit showing all components something like this take each cabinet and make a page for each one and do a panel size table for each, etc."

**Goal:** per-cabinet multi-page report, each cabinet gets its own pages.

- File: new `src/lib/explodedReport.ts` + extend `src/lib/export.ts` `bomReportHtml` or new `explodedReportHtml`
- Pages per cabinet:
  1. **Cover** – cabinet name, W×H×D, qty, type, plywood material, hasToeKick/Fronts/Back, preview 3D iso PNG (reuse viewer snapshot per cabinet)
  2. **Exploded View** – 3D exploded: side panels offset ±150mm X, top/bottom offset ±120mm Y, shelves offset Y +50mm each, back offset Z -100mm, doors offset Z +200mm + swing open 45°, drawers offset Z +300mm. Use Three.js scene clone, translate meshes by tag. Render to PNG via canvas, embed.
     - Alternative 2D exploded SVG: front + side + top orthographic with exploded gaps, dimensioned.
  3. **Open Door View** – front elevation with doors open (doorFrac=1), drawers open, shelves visible, hanging rails, dimensions W×H, door W×H table.
  4. **Material Cut List (per cabinet)** – table: Part name, Material (with ply name), Thk, W×H (after rotateOnce), Qty, Banding (T/B/L/R), Holes count, Grain locked, Note. Include cover panels, MDF back, shelves above rail, splitter, toe kick sides.
  5. **Panel Size Table** – same as cut list but grouped by material@matId, with bend length (bandLengthMm*qty) and area m², plus small SVG thumbnail per part (w*h scaled).
  6. **Drilling Map per Panel** – for each plywood side panel: SVG top view with shelf holes (yellow), slide holes (blue), rail pilots (cyan), slot groove (dark strip) with X/Y coords.
  7. **Hardware Summary per Cabinet** – hinges (with auto count per door leaf), slides pairs by depth, hanging rails, shelf pins (shelves*4 for this cabinet only).

- **Overall report structure:**
  - Page 1: Project cover (same as existing)
  - Page 2: TOC – list of cabinets with links to their exploded sections
  - Pages 3..N: repeat per-cabinet 4-7 pages above
  - Final pages: overall BOM + nesting summary (existing)

- **Implementation steps (no edit now, plan only):**
  1. Create `explodedReportHtml(cabinets, settings, panels, grain, project, customers, opts)` – loops cabinets, calls `generateCabinetParts` per cabinet (not merged) to keep per-cabinet parts.
  2. For each cabinet, generate 2D SVGs: `frontElevationSvg([cab])`, `explodedSvg(cab, settings)` – new function that draws side panels separated, top/bottom separated, shelves spaced, doors offset.
  3. For 3D exploded PNG: add method `CabinetViewer.snapshotExploded(cab, settings, offset)` – or reuse `buildCabinetGroup` and offset meshes by tag before snapshot.
  4. Panel size table: `allParts([cab])` → table rows, plus `bandLengthMm`, area.
  5. CSS: `@page` A4, `.page-break-after:always`, header/footer with cabinet name + page number.
  6. Button in BomTab: "Exploded Per-Cabinet Report (print)" → `openPrintWindow(explodedReportHtml(...))`, "Save" → download HTML.

- **Acceptance:**
  - Each cabinet has its own exploded view PNG/SVG showing all components separated but aligned
  - Open door view shows doors open 108° and drawers pulled 60%
  - Material cut list per cabinet matches overall cut list when summed
  - Panel size table per cabinet lists every part with W×H×Thk, qty, banding, holes
  - Report printable A4, works offline file://

---

## 3) Next Steps (if you approve this plan)

1. Implement Phase 1 #8 DXF fix (1 file, ~2h)
2. Implement Phase 2 back follows material (model.ts + scene.ts + export.ts, ~3h)
3. Implement Phase 3 panel drag 2D (View2DTab.tsx, ~4h)
4. Re-verify Phases A-U checklist, write tests for doorDims, hingeCupYs, railShelfYs, slotFromFront fallback
5. Implement Phase 5 exploded per-cabinet report (new file explodedReport.ts, ~8-12h) – includes 2D exploded SVG + per-cabinet cut list + drilling map

No files edited in this turn, only PLAN_ORDER.md created.
