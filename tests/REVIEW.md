# App review — 2026-09-09

## Automated checks

- `npm test`: geometry, layout, nesting, machining and export regressions;
  includes mixed/quantity 3D placement and physical-only model bounds.
- `npx tsc --noEmit`: TypeScript validation.
- `npm run build`: offline single-file production build.

## Browser checks performed

Headless Chromium with software WebGL, using the default demo project:

- Opened Project, Edit Cabinet, 3D View, Front View, Plan View, Cut List,
  Nesting, Drilling, DXF Export, BOM / Hardware and Settings.
- Verified all three cabinet instances are present in the 3D scene and
  visually inspected the rendered view.
- Exercised Front, Elevation, Side, Top, Iso, Fit and Reset, plus all three
  rendering styles; checked the camera stays finite.
- Verified Fit resets the framing slider to 100%.
- Checked canvas dimensions match its container at 390, 900 and 1440px
  viewport widths, after ResizeObserver updates.
- Counted scene rebuilds in Edit Cabinet: no further rebuilds while idle.
- Loaded a panel-only project and checked that it gets a 3D canvas instead
  of the empty-cabinet message.
- No uncaught browser errors in these checks.

These are smoke checks, not exhaustive validation of every machining setup,
user project, browser or GPU. Recheck the reported project if its geometry or
saved layout differs from these fixtures.
