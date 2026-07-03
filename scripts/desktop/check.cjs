const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..", "..");
const checks = [
  ["Electron main", "desktop/main.cjs"],
  ["Electron preload", "desktop/preload.cjs"],
  ["Desktop renderer", "dist/index.html"],
  ["Backend sidecar", "desktop-resources/backend/ai-server-desktop.exe"],
  ["Local ONNX model", "ai-server/models/model.onnx"],
];

let failed = false;

console.log(`[desktop-check] Node ${process.version}`);

for (const [label, relativePath] of checks) {
  const absolutePath = path.join(projectRoot, relativePath);
  const exists = fs.existsSync(absolutePath);
  console.log(`[desktop-check] ${exists ? "OK" : "MISSING"} ${label}: ${absolutePath}`);
  failed ||= !exists;
}

for (const dependency of ["electron", "electron-builder"]) {
  try {
    console.log(`[desktop-check] OK dependency ${dependency}: ${require.resolve(dependency)}`);
  } catch {
    console.error(`[desktop-check] MISSING dependency ${dependency}`);
    failed = true;
  }
}

if (failed) {
  console.error(
    "[desktop-check] Desktop prerequisites are incomplete. Build the renderer/backend and provide the local model before packaging.",
  );
  process.exitCode = 1;
} else {
  console.log("[desktop-check] Desktop packaging prerequisites passed.");
}
