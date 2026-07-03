const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktopRuntime", {
  apiUrl: "http://127.0.0.1:8765/segment-garment",
  isDesktop: true,
  platform: process.platform,
});
