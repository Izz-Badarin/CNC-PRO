# 🪚 CNC Cabinet Designer Pro

**Professional cabinet design software for CNC workshops — 100% offline.**

Design cabinets visually, get instant cut lists, automatic sheet **nesting**,
drilling patterns, hardware BOM and **DXF export** — all running locally in
your browser. No internet, no cloud, no accounts: wood textures are generated
procedurally, projects autosave to your browser, and every export is produced
on your machine.

---

## ✨ Features

| Area | What you get |
|---|---|
| 🧱 **Cabinet editor** | Base / wall / tall / corner / L / C cabinets, rows ↔ columns split to any depth, drawers, doors (single / double / sliding, overlay / inset), cover panels, adjustable shelves |
| 🧊 **3D view** | Real-time Three.js preview with procedural wood textures, doors, drawers and hardware |
| 📐 **2D views** | Front elevation and top-down plan views |
| ✂️ **Cut list** | Automatic part list with dimensions, material, thickness and edge banding |
| 📦 **Nesting** | Sheet optimization (runs in a Web Worker) to minimize material waste |
| 🎯 **Drilling** | Drill operations for hinges (Ø35 cup holes), drawer slides and fittings |
| 💾 **DXF export** | Export parts as DXF files, ready for your CNC machine |
| 🔩 **BOM / Hardware** | Bill of materials: hinges, slides, handles, screws and fittings |
| 📕 **Shop reports** | Full multi-page customer report (cover, 3D shot, dimensioned elevation, cut list, nesting, approval line) + **exploded per-cabinet report** — exploded view, open-door view, drilling map, panel size table and hardware for every cabinet, printable A4 |
| ⚙️ **Settings** | Sheet sizes, plywood/MDF materials, thicknesses, units and shop defaults |
| 📁 **Projects** | Autosave to browser storage, portable project files (Save/Open), share links |

## 🚀 Quick start

### One click (Windows)

Double-click **`start-offline.bat`** — it installs dependencies on first run,
builds the app, and opens it in your default browser. After the first build it
works **fully offline, forever**.

### Manual

```sh
npm install
npm run build
```

Then open **`dist/index.html`** — or copy the whole `dist/` folder anywhere
(USB stick, shop PC) and double-click `index.html`. It is a single
self-contained file: no server, no internet required.

### Development

```sh
npm run dev        # local dev server with hot reload (http://localhost:5173)
npm run build      # production single-file build → dist/
npm run preview    # preview the production build
npm test           # geometry smoke tests
```

## 🛠️ Tech stack

- **React 19** + **TypeScript** (strict mode)
- **Vite 7** with [`vite-plugin-singlefile`](https://github.com/richardtallent/vite-plugin-singlefile) — the whole app bundles into one portable `index.html`
- **Three.js** — 3D viewer with procedurally generated wood textures
- **Tailwind CSS 4** — styling
- **Web Worker** — background nesting optimization
- Zero runtime network calls: no CDNs, no web fonts, no analytics

## 📂 Project structure

```
src/
├── App.tsx              # main app shell & tab routing
├── tabs/                # Project, Edit, 3D, 2D, Plan, Cut List,
│                        # Nesting, Drilling, DXF, BOM, Settings
├── components/          # 3D canvas, layer toggles, UI primitives
├── lib/                 # data model, nesting engine + worker,
│                        # DXF writer, export/share utilities
├── three/               # Three.js scene setup
└── types.ts             # domain types (cabinets, doors, drawers…)
tests/                   # geometry smoke tests
public/                  # icon, web manifest, service worker
dist/                    # built single-file app (portable)
```

## 📝 Notes

- **Why can't I open `index.html` in the project root?**
  That is the *source* entry file — it needs the dev server or a build.
  If opened from disk it shows a launcher button pointing to `dist/index.html`.
- **Where are my projects saved?** In your browser's local storage
  (autosaved). Use **File → Save / Open** for portable project files you can
  move between machines or browsers.
- For detailed offline setup instructions see [`README-OFFLINE.md`](README-OFFLINE.md).

## 📄 License

Private project — © Izz Badarin. All rights reserved.
