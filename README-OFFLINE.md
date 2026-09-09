# CNC Cabinet Designer Pro — Offline & Plane Mode Guide v2

This app is **100% offline**. No internet is used while you work: the 3D viewer generates its own wood textures, nesting runs in a Web Worker bundled inline, all data is saved in your browser (localStorage + IndexedDB fallback), and CSV/DXF exports are produced locally. There are **no web fonts, no CDNs, no cloud calls**.

Plane mode: copy `dist/` folder to USB, shop PC, tablet — double-click `index.html` — works with no server, no install, no internet.

---

## ► Easiest way (recommended): `start-offline.bat`

Double-click **`start-offline.bat`**. It will:

1. Build the app the first time (needs internet once for `npm install`).
2. Open the built offline app in your default browser.
3. On later runs, it checks if `src/` is newer than `dist/index.html` — rebuilds only if needed. Otherwise opens instantly, even offline.

After the first build you can run it offline forever — even with no network, in airplane mode.

> The built app lives in the **`dist/`** folder as a single self-contained file: **`dist/index.html`** (~1.2MB, JS+CSS+Worker inlined). Plus `manifest.webmanifest`, `sw.js`, `icon.svg` for PWA install. You can copy the whole `dist/` folder anywhere (USB stick, shop PC) and double-click `index.html` — it runs with zero server.

---

## Manual build (for developers)

```sh
npm install
npm run build
```

Then open:

```
dist\index.html
```

or copy `dist/` anywhere and open `dist/index.html`.

---

## Reliability upgrades v2

### Storage
- **Version migration**: old keys `cnc-cabinet-designer-pro-v*` are auto-detected, newest migrated to current version (`v14`). No data loss on upgrade.
- **Quota handling**: if localStorage full (~5MB), app warns, trims oldest backups, falls back to IndexedDB (`cnc-pro-db`).
- **Backup rotation**: every ~60s a timestamped backup `cnc-backup-v14-YYYY-MM-DD-HH-MM-SS` is saved, last 5 kept.
- **Autosave**: debounced 400ms, dirty flag, `beforeunload` warning if unsaved.
- **Error log**: `cnc-error-log` in localStorage (last 20KB) for plane-mode debugging — visible in DevTools.

### Offline detection
- Header/footer show **ONLINE/OFFLINE**, storage usage KB, and **FILE:// OFFLINE / PWA CACHED / SINGLE-FILE** badge.
- Service worker v2: cache-first, navigation fallback to `index.html`, stale-while-revalidate, auto-cleanup old caches. Works on `https://` and `http://localhost`. `file://` can't use SW (browser restriction) but single-file build works without SW.
- **Drag & drop**: drop a `.json` project file anywhere on the app to load — works offline.
- **PWA install**: `beforeinstallprompt` handled, shows **Install** button when browser allows. Installed PWA works fully offline, plane mode, standalone window.
- **Downloads**: robust `triggerDownload` with Blob URL + `msSaveBlob` + dataURL fallback + new-tab fallback — works `file://`, Safari, PWA.

### Plane mode usage
- No network calls: `npm run build` output has no external URLs (checked).
- Worker: `nesting.worker?worker&inline` bundled as blob — works `file://`.
- Textures: procedural canvas, no images.
- Share links: hash-based `#p=...` deflate-compressed, works offline — copy via clipboard or textarea fallback.
- 3D screenshot: `cnc-last-3d-png` in localStorage, included in BOM full report even offline.

---

## Live editing during development

```sh
npm run dev
```
This starts a local dev server (http://localhost:5173) with hot reload. SW registers on localhost for PWA testing.

---

## Notes

- **Why can't I just open `index.html` at the project root?**
  That is the *source* file — it references `src/main.tsx`, which needs the build/dev server and cannot run straight from disk. It now detects this and shows a launcher button to `dist\index.html` instead of a blank page, plus plane-mode tips.

- **Data storage:** Projects autosave to browser. Same browser must be used to see saved work (use `File → Save/Open` for portable `.json` files). If storage full, export and clear old backups via DevTools → Application → Local Storage.

- **PWA install:** On Chrome/Edge, address bar shows install icon when served via https or localhost. After install, app opens standalone, offline, with its own window — perfect for shop tablet.

- **File:// quirks:** Some browsers block `download` attribute on `file://` — fallback opens content in new tab for manual save. Chrome works fine.
