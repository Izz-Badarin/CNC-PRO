# Last Phase – Exploded Per-Cabinet Report (Phase 14 Corrected + New O)

> **STATUS 2026-09-09:** implemented — `src/lib/explodedReport.ts` + `Exploded Per-Cab (print)`
> and `Save Exploded Report` buttons in the BOM tab. Per-cabinet pages: front elevation,
> exploded view (2D schematic + optional 3D PNG), open-door view, drilling map L/R, panel size
> table, hardware. A4 print CSS, single offline HTML, no external assets. Regression coverage in
> `tests/geometry.smoke.test.ts`. See `PLAN_ORDER.md` for the full applied/open list.

**User correction:** "phase 14 you do is not correct i mean to generate CABINET Exploded View, Open Door View, and Material Cut List! a detailed exploded view of a kitchen cabinet unit showing all components something like this take each cabinet and make a page for each one and do a panel size table for each, etc."

**Current Full Report (existing O):** 7-page overall report – cover, KPIs, 3D screenshot (E1), front elevation dimensioned (D2), cabinets list, panels list, BOM materials+hardware (M+U+L), cut list by material (bend length), nesting summary, banding + drilling notes, customer approval signature. This is **NOT** the requested exploded per-cabinet report.

**Requested Last Phase:** For **each cabinet**, generate its own set of pages:

---

## 1. Goal & Acceptance

- Each cabinet gets **its own section** in a multi-page HTML report (printable A4, offline, file:// compatible)
- Each cabinet section contains:
  1. **Exploded View** – 3D or 2D detailed exploded showing all components separated but aligned (like kitchen cabinet assembly instructions)
  2. **Open Door View** – front elevation with doors open 108°, drawers pulled 60%, shelves visible, hanging rails, dimensions
  3. **Material Cut List (per cabinet)** – panel size table for that cabinet only
  4. **Panel Size Table** – W×H×Thk, qty, material (with plywood material name), banding, holes, grain, bend length, area
  5. **Drilling Map per Panel** (optional but valuable) – side panel L/R with shelf holes, slide holes, rail pilots at D/2, slot groove
  6. **Hardware per Cabinet** – hinges per door leaf (auto computed), slides pairs by depth, hanging rails, shelf pins for that cabinet

- Overall report still has project cover + TOC + overall BOM/nesting at end
- Works offline, no external assets, single HTML file with embedded SVGs + PNGs (base64)

---

## 2. Files to Create / Modify (PLAN ONLY – NO ACT)

### New file: `src/lib/explodedReport.ts`

**Export:** `explodedReportHtml(cabinets, settings, panels, grain, project, customers, opts)`

**Structure:**
```ts
export interface ExplodedReportOpts {
  screenshotDataUrl?: string | null; // overall 3D
  perCabinetScreenshots?: Record<string, string>; // cabId → PNG dataUrl of that cabinet alone
}

export function explodedReportHtml(
  cabinets: Cabinet[],
  settings: Settings,
  panels: PanelItem[],
  grain: GrainOverrides,
  project: ProjectInfo | null,
  customers: Customer[] | null,
  opts: ExplodedReportOpts = {}
): string
```

**Steps inside:**

1. **Collect per-cabinet parts:**
   ```ts
   const perCabParts = cabinets.map(cab => ({
     cab,
     parts: generateCabinetParts(cab, settings).map(rotatePartOnce), // NOT merged, keep per-cab
     merged: mergePieces(allParts([cab], settings, grain, [])), // for cut list table
   }));
   ```

2. **Generate per-cabinet SVGs:**
   - `frontElevationSvg([cab], [])` – already exists, gives dimensioned front
   - New `explodedFrontSvg(cab, settings)` – 2D exploded front: draw carcass outline dashed, then side panels offset X ±120mm, top/bottom offset Y ±100mm, shelves offset Y +30mm each with gaps, back offset, doors offset Z (in 2D show as side view). Simple version: reuse `buildFrontSvg` but with exploded offsets.
   - New `exploded3DSvgPlaceholder` – for now use 3D snapshot, later real 3D exploded.

3. **3D exploded PNG generation (in browser):**
   - In `View3DTab.tsx`, add method `snapshotCabinetExploded(cab)`:
     - Clone `buildCabinetGroup(cab, settings).group`
     - For each mesh with tag "carcass" and name includes "Side panel L" → position.x -= 150
     - "Side panel R" → x += 150
     - "Top" → y += 120
     - "Bottom" → y -= 20
     - "Back" → z -= 100
     - "Door" → z += 200, rotation.y = 45° open
     - "Drawer" → z += 300
     - "Shelf" → y += 30*k
     - Render with `renderer.render` and `toDataURL`
   - Store in localStorage `cnc-exploded-${cab.id}` or pass via opts

4. **Panel size table per cabinet:**
   ```ts
   const rows = merged.map((p,i) => `
     <tr>
       <td>${i+1}</td>
       <td>${escH(p.name)}</td>
       <td>${escH(matLabel(settings,p))}</td>
       <td class="num">${p.w}×${p.h}×${p.thickness}</td>
       <td class="num">${p.qty}</td>
       <td>${bandStr(p.band)}</td>
       <td class="num">${(bandLengthMm(p)*p.qty/1000).toFixed(2)}m</td>
       <td class="num">${(p.w*p.h*p.qty/1e6).toFixed(3)}m²</td>
       <td class="num">${p.holes.length * p.qty}</td>
       <td>${p.grain?"locked":""}</td>
       <td class="small">${escH(p.note)}</td>
     </tr>`)
   ```

5. **Hardware per cabinet:**
   - Reuse logic from `bomReportHtml` but per cab: hinges (doorDims + doorHingeCount + overrides), slides by cm, rails, shelf pins = shelf count *4 for that cab.

6. **HTML template:**
   - Use same CSS as `bomReportHtml` – `@page{margin:12mm;size:A4}`, `.page{page-break-after:always}`
   - Cover page (project)
   - TOC page with links: `<a href="#cab-${cab.id}">`
   - For each cab: `<div class="page" id="cab-${id}">` with sub-pages:
     - Page header: `${cab.name} – ${W}×${H}×${D} – ${type} – ${qty} units`
     - Exploded view: `<div class="elevation">${explodedSvg}</div>` + `<img src="${perCabScreenshot}">`
     - Open door view: frontElevationSvg + door table
     - Cut list table
     - Drilling map: for each side panel, small SVG with holes
     - Hardware table

7. **Final pages:** overall BOM + nesting (reuse existing)

### Modify `src/tabs/BomTab.tsx`

- Add buttons:
```tsx
<Btn size="sm" variant="warn" onClick={() => {
  const html = explodedReportHtml(cabinets, settings, panels, grain, project, customers, { screenshotDataUrl: lastScreenshot });
  openPrintWindow(html);
}}>Exploded Per-Cabinet (print)</Btn>
<Btn size="sm" onClick={() => {
  const html = explodedReportHtml(...);
  download(`Exploded-Report-${project?.name||"project"}.html`, html, "text/html");
}}>Save Exploded Report</Btn>
```

### Modify `src/tabs/View3DTab.tsx`

- Add per-cabinet snapshot button: when single cabinet selected in EditTab, show "Exploded PNG" that calls viewer.snapshot() after applying exploded offsets, saves to localStorage `cnc-exploded-${id}` and updates BomTab state.

### Modify `src/lib/layout2d.ts` (optional)

- Add `explodedLayout(cab, settings, gap=100)` that returns panel positions for exploded front view: side panels left/right offset, top/bottom offset, shelves stacked with gap.

---

## 3. Detailed Exploded View Spec

**Visual reference:** kitchen cabinet exploded assembly – side panels left/right pulled apart, top/bottom pulled up/down, shelves floating between, back behind, doors in front open, drawers pulled out, toe kick below.

**2D SVG exploded (simpler, offline-safe):**
- Canvas: 800×600 viewBox
- Draw:
  - Side L at x=50, y=100, w=D, h=BH
  - Side R at x=50+W+240, y=100, same
  - Bottom at x=50+T, y=100+BH+80, w=insideW, h=D
  - Top at x=50+T, y=20, w=insideW, h=D
  - Shelves: between sides, y = y0 + shelfY, with small gap lines showing exploded
  - Back: dashed rect behind sides, x=50, y=100, w=W, h=BH
  - Doors: in front of sides, offset Z shown as separate rects at x=50+W/2, y=100, w=doorW, h=doorH, with hinge side marked
  - Drawers: below, boxes separated
  - Dimension lines: overall W×H×D, plus panel sizes
  - Labels: each part name + size

**3D exploded PNG (more impressive):**
- Use Three.js group, offset meshes as described
- Camera iso view, target center, render
- Embed as base64 PNG `<img src="data:image/png;base64,...">`

**Acceptance for exploded:**
- All parts visible, none overlapping
- Each part labeled with name + W×H×Thk
- Door shows hinge side (L/R) and swing arrow
- Shelf pins holes visible as dots on side panels (optional)

---

## 4. Open Door View Spec

- Reuse `buildFrontSvg` but with `doorsOpen=true` flag (or manually draw doors open)
- For 2D: draw carcass, shelves (solid lines), doors as side rects rotated 90° outward (or as open panels beside cabinet)
- Show:
  - Cabinet outline W×H
  - Shelves with gap dims
  - Drawer bank position with Y offsets
  - Hanging rail at railHeight with label "SUITS 1100mm"
  - Door W×H table: per door leaf W×H, hinge count, swing
- Dimensions: overall W, overall H, kick H, door gaps

---

## 5. Panel Size Table Spec (per cabinet)

**Columns:** #, Part name, Material (plywood name from plyMaterialById), Thickness, Length (w after rotateOnce), Width (h), Qty, Banding (T/B/L/R), Bend length (m) = bandLengthMm*qty/1000, Area m² = w*h*qty/1e6, Holes, Grain locked, Note

**Grouping:** by material@matId@thickness, sorted by area desc

**Example row:**
```
1 | Side panel L | Plywood White (16.5) | 16.5 | 560 | 720 | 2 | R | 0.72m | 0.403m² | 12 | locked | banding: front
```

**Include:** cover panels L/R/T/B with auto thickness note, MDF back niche, shelves above rail, drawer splitter, toe kick front + 2 sides

---

## 6. Implementation Order for Next Agent (when you say act)

1. **Create `explodedReport.ts`** – start with 2D SVG exploded only (no 3D PNG yet), per-cabinet cut list table, reuse existing CSS from export.ts
2. **Add buttons in BomTab** – print + save
3. **Test with 1 cabinet** – 600×720×560 base, 1 shelf, 1 door MDF Left, check HTML opens, pages break correctly
4. **Add 3D exploded snapshot** – View3DTab method, localStorage per-cab, embed in report
5. **Add drilling map per side panel** – SVG with holes
6. **Polish CSS** – A4, header/footer, page numbers, customer signature at end

**Estimated effort:** 8-12h for full feature, 3-4h for MVP (2D exploded + cut list per cabinet)

---

## 7. How to tell other agent to redo previous work + this new phase

**Tell next agent:**

> After PR #3 merged (18ebf61), we did commit fa0e1c7 on arena branch but didn't push. Reproduce it using PREVIOUS_CHANGES_AFTER_MERGE.md – it has exact code for types, defaults, model, scene, EditTab, SettingsTab, View2DTab, BomTab, export. Build with `npm run build`, verify tsc clean, commit.
>
> Then implement exploded per-cabinet report using this file EXPLODED_REPORT_PHASE_DETAILS.md – create src/lib/explodedReport.ts, add buttons in BomTab, add snapshot in View3DTab, no external deps, single HTML, per-cabinet pages: exploded view (2D SVG + 3D PNG), open door view, material cut list, panel size table, drilling map, hardware per cabinet. Use existing frontElevationSvg and generateCabinetParts.

**Push flow:**

```sh
git checkout arena/01a083d7-cnc-pro
# apply previous changes
git add src/types.ts src/lib/defaults.ts src/lib/model.ts src/three/scene.ts src/tabs/EditTab.tsx src/tabs/SettingsTab.tsx src/tabs/View2DTab.tsx src/tabs/BomTab.tsx src/lib/export.ts dist/index.html
git commit -m "feat: full-cabinet doors L/R/Double + slot editable + hinge bands + BOM fixes"
git push origin arena/01a083d7-cnc-pro
gh pr create --title "Full doors L/R/Double + slot editable + hinge bands" --body-file PREVIOUS_CHANGES_AFTER_MERGE.md

# after merge, start new branch for exploded report
git checkout main
git pull origin main
git checkout -b arena/exploded-report
# implement explodedReport.ts etc.
git add src/lib/explodedReport.ts src/tabs/BomTab.tsx src/tabs/View3DTab.tsx
git commit -m "feat: exploded per-cabinet report – exploded view + open door + cut list per cabinet"
git push origin arena/exploded-report
gh pr create --title "Exploded per-cabinet report" --body-file EXPLODED_REPORT_PHASE_DETAILS.md
```

---

## 8. No act in this turn

This file is documentation only. No source files edited.
