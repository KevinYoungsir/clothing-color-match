# Desktop Shell

This directory contains the Electron shell only. It does not contain garment
segmentation, color-transfer, or export business logic.

- `main.cjs` owns the desktop window and the local FastAPI sidecar lifecycle.
- `preload.cjs` exposes minimal read-only desktop runtime metadata.
- Development loads `http://127.0.0.1:5173`.
- Packaged builds load `dist/index.html` and start the bundled backend on
  `127.0.0.1:8765`.

Use the root npm scripts documented in
`docs/windows-desktop-packaging.md`. Model files and generated desktop output
must remain outside Git.
