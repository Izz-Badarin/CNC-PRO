# CNC Cabinet Designer Pro — Offline Setup

This app is **100% offline**. No internet is used while you work: the 3D viewer
generates its own wood textures, all data is saved in your browser, and CSV/DXF
exports are produced locally. There are **no web fonts, no CDNs, no cloud calls**.

---

## ► Easiest way (recommended): `start-offline.bat`

Double-click **`start-offline.bat`**. It will:

1. Build the app the first time (needs internet once for `npm install`).
2. Open the built offline app in your default browser.

After the first build you can run it offline forever — even with no network.

> The built app lives in the **`dist/`** folder as a single self-contained
> file: **`dist/index.html`**. You can copy the whole `dist/` folder anywhere
> (USB stick, shop PC) and double-click `index.html` — it runs with zero server.

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

## Live editing during development

```sh
npm run dev
```
This starts a local dev server (http://localhost:5173) with hot reload.

---

## Notes

- **Why can't I just open `index.html` at the project root?**
  That is the *source* file — it references `src/main.tsx`, which needs the
  build/dev server and cannot run straight from disk. It now detects this and
  shows a launcher button to `dist\index.html` instead of a blank page.

- **Data storage:** Projects autosave; they are kept in your browser. The same
  browser must be used to see saved work (use `File → Save/Open` for portable
  project files).