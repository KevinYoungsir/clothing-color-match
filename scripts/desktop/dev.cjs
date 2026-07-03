const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..", "..");
const rendererUrl = "http://127.0.0.1:5173";
const electronExecutable = require("electron");
const viteCli = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");

let viteProcess = null;
let electronProcess = null;
let shuttingDown = false;

function isRendererReady() {
  return new Promise((resolve) => {
    const request = http.get(rendererUrl, { timeout: 1000 }, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function waitForRenderer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isRendererReady()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

function stopChild(child) {
  if (child && !child.killed) {
    child.kill();
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopChild(electronProcess);
  stopChild(viteProcess);
  setTimeout(() => process.exit(exitCode), 100);
}

async function run() {
  if (!(await isRendererReady())) {
    viteProcess = spawn(
      process.execPath,
      [viteCli, "--mode", "desktop", "--host", "127.0.0.1", "--port", "5173"],
      {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
      },
    );

    viteProcess.on("exit", (code) => {
      if (!shuttingDown && code !== 0) {
        console.error(`[desktop] Vite exited before Electron, code=${code}`);
        shutdown(code || 1);
      }
    });
  } else {
    console.log(`[desktop] reusing renderer at ${rendererUrl}`);
  }

  if (!(await waitForRenderer())) {
    throw new Error(`Vite did not become ready at ${rendererUrl}`);
  }

  electronProcess = spawn(electronExecutable, [projectRoot], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: rendererUrl,
    },
    stdio: "inherit",
    windowsHide: false,
  });

  electronProcess.on("exit", (code) => shutdown(code || 0));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run().catch((error) => {
  console.error("[desktop] development startup failed", error);
  shutdown(1);
});
