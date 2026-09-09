# CNC-PRO – Enhancement Plan (PLAN ONLY, NO ACT)

Date: 2026-09-09
Branch: arena/01a08517-cnc-pro (HEAD ac79dfb — full-door 3D, banding-edge fix, grain orientation, nesting fill)
Request: user asked "what else enhancement need to do — plan not act now"

Conventions: effort S = <2h · M = half–2 days · L = 3+ days. Every item lists
Why / Touch / Acceptance. Standing rules still apply (OLD 3D look, strict R12
DXF, glass = BOM only, no room/wall/slider/exports re-added).

---

## Phase 1 – Production leftovers (do first — small, high shop value)

### 1.1 Oversized-back auto-split (wardrobes taller/wider than the sheet) [M]
- **Why:** a back longer than 2420mm (e.g. 2600 tall wardrobe) can never nest —
  today it just lands in "Unplaced" with no remedy. Shops split such backs into
  2 pieces with a joint.
- **Touch:** `src/lib/model.ts` (`buildBody`/`buildStackedBody` back block),
  `src/types.ts` (cabinet flag `splitBack?: boolean`, default ON), tests.
- **Plan:** when `max(backW, backH) > usable sheet length` and `splitBack !== false`,
  emit `Back A` + `Back B` (split across the SHORT axis at ~50%, each long-side-first,
  grain rule unchanged). Split backs get a distinct note (`split back · joint at …`).
  OFF = old behavior (one back, may go unplaced).
- **Acceptance:** 600×2600 oak cabinet nests both back halves, zero unplaced;
  600×720 cabinet still emits exactly one `Back`.

### 1.2 Finish the grain job — drawer-box + kick + drawer-front orientation [S]
- **Why:** last act fixed span panels + backs; drawer sides / box fronts / kick
  fronts are still auto-rotated, so their locked grain runs 90° off the shop
  standard (drawer-side grain horizontal along the slider, kick-front grain
  horizontal along the width, drawer-front grain horizontal along the width).
- **Touch:** `src/lib/model.ts` (`genStandardDrawer`, kick blocks, drawer-front
  blocks) + `noRotate` flags, tests.
- **Acceptance:** drawer side Length = slider depth; kick front Length = inner
  width; oak drawer front Length = front width; all locked; existing 148 tests green.

### 1.3 Optional handle-hole drilling [S–M]
- **Why:** handles are hardware-only (zero CNC holes). Many shops drill handle
  holes on the CNC — today they measure by hand.
- **Touch:** `src/types.ts` (`DoorSpec.handleHoles?: boolean`, `DrawerSpec.handleHoles?`),
  `src/lib/model.ts` (`genDoor` + drawer-front blocks emit 2× Ø5 system holes at
  the handle position), `src/tabs/EditTab.tsx` (checkbox, default OFF),
  `src/lib/dxf.ts` (new `HANDLE_HOLES` layer — still LINE/CIRCLE/TEXT, R12-safe),
  tests.
- **Acceptance:** OFF (default) = byte-identical DXF to today; ON = 2 holes per
  front on HANDLE_HOLES, shown in Drilling tab, counted in CSV.

### 1.4 Corner / notched × stacked audit + warnings [S]
- **Why:** silent model gaps — (a) `isCorner` cabinets ignore `stack` entirely,
  (b) stacked L/C cabinets lose their side notches (`buildStackedBody` makes
  plain rect sides). A user can configure this in the UI and get wrong parts.
- **Touch:** `src/lib/model.ts` (`validateCabinet`), `src/tabs/EditTab.tsx`
  (hide/disable Boxes control where unsupported, or show the warning inline).
- **Plan (no new geometry):** emit `err` "Stacked boxes are not supported on
  corner cabinets" and "Stacked boxes drop the L/C side notch — use one box" so
  the Edit-tab issue list + validation stop bad configs. Full geometry support
  (notched stacked sides) is a separate L item — do NOT bundle it.
- **Acceptance:** setting stack on corner/L/C shows a red ERR; normal stacked
  rect cabinets unaffected.

### 1.5 Oversize-door + ignored-fullDoor warnings [S]
- **Why:** a door that fits no MDF board (white unlocked or oak locked) only
  surfaces as "Unplaced" in nesting; a `fullDoor` set on a non-stacked cabinet
  (hand JSON) is silently ignored by model + 3D alike.
- **Touch:** `src/lib/model.ts` (`validateCabinet`), tests.
- **Acceptance:** WARN "Door 594×2498 fits no MDF sheet (max 3030×1220)" style
  messages; WARN "Cabinet-level door needs stacked boxes (2+)" when
  `fullDoor` is set but `stackOn()` is false.

---

## Phase 2 – Shop-output upgrades (visible wins, medium)

### 2.1 Grain-direction arrows in nesting + DXF labels [M]
- **Why:** grain is currently invisible except for the lock checkbox — the
  operator cannot verify orientation on the sheet or the DXF. This class of
  issue caused the last grain ticket.
- **Touch:** `src/tabs/NestingTab.tsx` (draw ⇄/⇅ arrow per placed part, along
  the part's Length = grain axis), `src/lib/dxf.ts` (append `GRAIN→` text or a
  2-LINE arrow on LABEL layer per part — R12-safe), `src/lib/export.ts`
  (nesting CSV `Grain` column).
- **Acceptance:** every nested part shows its grain axis; DXF part label reads
  e.g. `594 x 2494 R90 GRAIN-Y`; CSV has the column; no new entity types.

### 2.2 Part labels with QR codes (shop scanning) [M]
- **Why:** paper labels today are name + dims only. A QR (part id + dims + band
  + material) lets the shop scan at the saw / edgebander / assembly.
- **Touch:** `src/lib/export.ts` (`labelsHtml`), tiny offline QR encoder vendored
  into `src/lib/qr.ts` (~15–25 KB, no dependency — keeps the single-file build
  offline), tests (label HTML contains an SVG QR per card).
- **Acceptance:** each label card carries a scannable QR encoding
  `cabId|name|WxHxThk|band|matId`; build size grows <50 KB; works on file://.

### 2.3 Rectangular + circular cutouts (sink / hob / grommet / cable) [M–L]
- **Why:** kitchens need sink + hob cutouts (bottoms/tops), cable grommets,
  vent holes. Today there is no cutout feature at all — shops edit the DXF by hand.
- **Touch:** `src/types.ts` (`Part.cutouts: Cutout[]`, `Cutout = rect|circle`
  with x/y/w/h or dia + `target` part selector), `src/lib/model.ts` (attach to
  Bottom/Top/Shelf/Back at generation from new per-cabinet `cab.cutouts` spec),
  `src/lib/dxf.ts` (rect = 4 CUT LINEs, circle = 1 CUT CIRCLE — R12-safe),
  `src/tabs/DrillTab.tsx` (preview cutouts), `src/tabs/EditTab.tsx` (cutout
  editor: target panel + rect/circle + position + size), tests.
- **Acceptance:** sink cutout 560×490 in a base bottom appears in DXF CUT layer
  at the right XY, shows in Drilling preview, survives nesting rotation
  (transform like grooves); zero cutouts = identical output to today.

### 2.4 Panel-saw cutting pattern print (non-CNC shops) [M]
- **Why:** the guillotine strategies already produce saw-friendly layouts, but
  there is no ordered rip/cross-cut list per sheet — saw operators guess the order.
- **Touch:** `src/lib/nesting.ts` (record cut sequence during `guillotinePack`:
  ordered rip + cross cuts with mm positions), `src/lib/export.ts` (printable
  per-sheet cut-pattern page: sequence table + strip diagram), `src/tabs/NestingTab.tsx`
  (print button per sheet).
- **Acceptance:** each sheet prints cuts in executable order (rip 2440→…, then
  cross per strip); sequence dimensions sum back to the sheet size (test).

### 2.5 Edge-tape catalog in BOM (width per material) [S]
- **Why:** BOM counts banding meters but not tape spec — shops stock 0.4/1/2mm
  tapes per material and need the shopping list split by tape.
- **Touch:** `src/types.ts` (ply material `tape?: "0.4"|"1"|"2"`, MDF-oak tape
  setting), `src/lib/model.ts` (`bandingByMaterial` carries tape width),
  `src/tabs/BomTab.tsx` + `src/lib/export.ts` (BOM rows "Edge banding — Oak
  1×22mm — 42.5 m"), tests. Explicitly BOM-only: NO part-dimension changes.
- **Acceptance:** one BOM row per material×tape with meters; default tape keeps
  today's totals identical.

### 2.6 Settings profiles (named shop presets) [S–M]
- **Why:** one global Settings object — switching between e.g. "16.5 white shop"
  and "18mm oak contract" means hand-editing ~40 numbers with no way back.
- **Touch:** `src/lib/storage.ts` (named profiles in localStorage),
  `src/tabs/SettingsTab.tsx` (profile dropdown + save/rename/delete + export/
  import JSON), `src/App.tsx` (apply profile), tests (round-trip).
- **Acceptance:** 2 profiles switch all settings + plywood library; export/import
  JSON file round-trips; factory "Default" profile is resettable and never deletable.

### 2.7 Cut-list search + sort [S]
- **Why:** big kitchens = 500+ rows; no way to find a part or sort by size.
- **Touch:** `src/tabs/CutListTab.tsx` (text filter across cab/part, sort by
  Length/Width/Qty/Bend, per-group collapse), no model changes.
- **Acceptance:** filter "shelf" shows only shelves; sort toggles asc/desc;
  totals row always reflects the FILTERED set (labelled as such).

### 2.8 Per-part nesting exclusion flag [S]
- **Why:** `kickInNesting` exists globally, but shops also buy some parts
  ready-made (covers, worktops) — today they must delete the part or hand-edit DXF.
- **Touch:** `src/types.ts` (`Part.skipNest?: boolean` is runtime-only — better:
  persist exclusions as `GrainOverrides`-style map `partId → skip` in App state),
  `src/tabs/CutListTab.tsx` (⛔ checkbox per row), `src/lib/nesting.ts`
  (filter before grouping), BOM/report note "3 parts excluded from nesting".
- **Acceptance:** excluded parts stay in cut list/BOM/labels but never consume
  sheets; DXF "selected boards" unaffected.

---

## Phase 3 – Joinery systems (bigger, all opt-in, model work)

### 3.1 Dowel / confirmat carcass construction (assembly holes) [L]
- **Why:** the carcass has NO assembly drilling — sides/tops/bottoms carry only
  shelf/slide/rail holes. Dowel + confirmat shops currently add assembly holes
  in CAM by hand for every panel.
- **Touch:** `src/types.ts` (`Cabinet.construction: "screws"|"dowel"|"confirmat"`,
  settings: dowel Ø8 pattern, confirmat Ø5+Ø8 step note), `src/lib/model.ts`
  (emit `kind: "dowel"|"assembly"` holes on side panels + matching end holes on
  tops/bottoms/dividers — new `HoleKind`s), `src/lib/dxf.ts` (new layer(s),
  R12-safe), `src/tabs/DrillTab.tsx` (colors + legend), `src/tabs/EditTab.tsx`
  (per-cabinet picker, default `screws` = today's output), tests.
- **Acceptance:** default `screws` = byte-identical DXF/holes to today; `dowel`
  on a 600×720 base yields symmetric Ø8 rows (e.g. 2 per joint, 32mm from edges)
  on both mating faces; drilling CSV + DXF agree.

### 3.2 Metal drawer systems (tandembox-style) [M–L]
- **Why:** only full-plywood drawer boxes + kitchen mode exist. Modern shops buy
  metal drawer sides — then the box sides/backs must NOT be cut, only bottoms
  (+ backs at system height) to the system makers' dims.
- **Touch:** `src/types.ts` (`ColumnSpec.drawerSystem: "plywood"|"metal"`,
  settings per system: side height, bottom inset, back height), `src/lib/model.ts`
  (`genStandardDrawer` metal branch), BOM (metal sides as hardware pairs),
  2D/3D (thin-wall drawer rendering), tests.
- **Acceptance:** `plywood` = today's parts; `metal` = no box sides, bottom sized
  per system spec, BOM lists "Metal drawer side 500mm — N pairs".

---

## Phase 4 – Money (quoting module) [L, splittable]

### 4.1 Price lists + project costing + customer quote [L]
- **Why:** `ProjectStatus` already has `quoted`, customers exist, BOM counts
  everything — but there are zero prices anywhere. Quoting is done outside the app.
- **Touch:** `src/types.ts` (new `PriceList`: sheet price per material+thk,
  banding per meter per tape, hardware unit prices, labor rate + margin %),
  `src/tabs/*` (new `QuoteTab.tsx`: editable price list + per-cabinet cost
  breakdown + project total + margin + VAT toggle), `src/lib/export.ts`
  (quote page in Full Report / standalone print), storage (price lists persist
  per project), tests (BOM qty × price math).
- **Split:** (a) price-list editor + BOM valuation [M]; (b) quote document with
  letterhead/terms/VAT [M].
- **Acceptance:** quote total = Σ(sheet×price + band×price + hardware×price) +
  labor + margin + VAT, each line traceable to a BOM row; re-nesting updates
  sheet cost automatically.

---

## Phase 5 – Experience & reach

### 5.1 Arabic (RTL) interface [M–L]
- **Why:** English-only UI in a Palestinian shop — Arabic + RTL lets local staff
  run cutting/drilling unsupervised. (CutListTab already uses an `L` dictionary
  pattern — extend it app-wide.)
- **Touch:** new `src/lib/i18n.ts` (`en` + `ar` dictionaries, `dir` flag),
  all tabs (replace literals — mechanical, file by file), `src/index.css`
  (`[dir=rtl]` layout rules), `src/App.tsx` (language toggle persisted),
  reports (Arabic quote/cut-list headers as an option).
- **Acceptance:** one toggle flips UI + reports to Arabic RTL with zero layout
  breakage; DXF/print numeric output unchanged; English stays default.

### 5.2 Undo / redo for cabinet edits [M]
- **Why:** no safety net — one wrong drag/edit overwrites the project (backups
  exist in storage but are coarse). Biggest UX risk in daily use.
- **Touch:** `src/App.tsx` (history stack of `{cabinets, panels, settings?}`
  snapshots, Ctrl+Z / Ctrl+Shift+Z, ~50 steps, memory-capped), toolbar buttons
  with tooltips. Settings changes excluded from history (documented).
- **Acceptance:** drag, add/delete cabinet, row/col edits all undo cleanly;
  memory stays bounded (snapshots capped, large screenshot blobs excluded).

### 5.3 Demo project + first-run tour [S]
- **Why:** empty app on first open; new users don't discover 2D-drag, grain lock,
  nesting-per-material, or the exploded report.
- **Touch:** `src/lib/defaults.ts` (a `demoProject()` kitchen: 3 cabinets + panels),
  `src/tabs/ProjectTab.tsx` ("Load demo kitchen" button), lightweight tour
  (5–6 tooltip steps, no dependency).
- **Acceptance:** one click loads a kitchen that exercises drawers, full door,
  slot, rail, covers; tour dismisses forever; demo never overwrites a real project
  (confirm dialog when cabinets exist).

---

## Phase 6 – Repo & pipeline health

### 6.1 Untrack node_modules + real .gitignore + CI [S–M]
- **Why:** `node_modules` is COMMITTED (only `/*.patch` is ignored) — the repo is
  bloated, platform-specific (Windows binaries broke the Linux test run), and
  every `npm install` dirties the tree. There is also no CI, so regressions are
  caught by hand.
- **Touch:** `.gitignore` (node_modules, .tmp, dist? — see note), `git rm -r
  --cached node_modules .tmp`, new `.github/workflows/ci.yml`
  (`npm ci` → `tsc --noEmit` → tests → `vite build` on every push/PR).
- **Offline note (important):** `start-offline.bat` + `dist/` keep working
  offline regardless — `dist/index.html` stays TRACKED (it is the shippable
  artifact). Only the dev-only `node_modules` goes untracked; document one
  `npm ci` (needs network once) in README-OFFLINE.md. Rollback = revert one commit.
- **Acceptance:** fresh clone + `npm ci` + tests green on Linux AND Windows;
  `git status` clean after install; CI badge green on main.

### 6.2 Screenshot storage guard [S]
- **Why:** 3D PNGs in localStorage (`cnc-last-3d-png`, per-cab shots) can blow
  the 5MB quota and break autosave (save/load already guards, but the UX is a
  surprise failure).
- **Touch:** centralize capture helper (max dimension 1280px, JPEG quality cap,
  byte-size check BEFORE write, oldest per-cab shots evicted first),
  `src/tabs/BomTab.tsx` (honest "screenshot too large — downscaled" chip).
- **Acceptance:** capturing 20 cab PNGs never breaks project save; storage-info
  panel shows image vs project bytes.

---

## Explicitly NOT proposed (standing rules)

Room/wall backdrop, rim/warm lights, 0–108° door slider, per-cabinet
isolate + auto-rotate, GLB/OBJ/PNG export buttons, exploded-view offsets,
snapshotCabinet — all stay out of the 3D views. DXF stays strict R12
(LINE/CIRCLE/TEXT only). Glass stays BOM-only.

## Suggested order (if approved)

1. Phase 1 in numeric order (1.1 → 1.5) — each shippable alone, tests each step.
2. Phase 6.1 early (parallel-safe, unblocks clean CI for everything after).
3. Phase 2 by shop pain: 2.1 grain arrows → 2.3 cutouts → 2.5 tape catalog →
   2.6 profiles → 2.2 QR → 2.4 saw patterns → 2.7 search → 2.8 exclusions.
4. Phase 5.2 undo before Phase 3/4 (protects users during bigger changes).
5. Phase 3 joinery, then Phase 4 money, then 5.1 Arabic + 5.3 demo.

No code changed in this turn — plan document only.
