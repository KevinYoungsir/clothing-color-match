const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = Number(process.env.AI_DESKTOP_PORT || 8765);
const BACKEND_HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;

let backendProcess = null;
let ownsBackendProcess = false;
let mainWindow = null;

function requestHealth() {
  return new Promise((resolve) => {
    const request = http.get(BACKEND_HEALTH_URL, { timeout: 1000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function waitForBackend(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await requestHealth()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return false;
}

function resolveModelPath() {
  if (process.env.AI_LIGHTWEIGHT_MODEL_PATH) {
    return path.resolve(process.env.AI_LIGHTWEIGHT_MODEL_PATH);
  }

  if (app.isPackaged) {
    return path.join(process.resourcesPath, "model", "model.onnx");
  }

  return path.join(app.getAppPath(), "ai-server", "models", "model.onnx");
}

function resolveBackendCommand() {
  if (app.isPackaged) {
    const executable = path.join(
      process.resourcesPath,
      "backend",
      "ai-server-desktop.exe",
    );

    if (!fs.existsSync(executable)) {
      throw new Error(`Desktop backend executable not found: ${executable}`);
    }

    return {
      args: [],
      command: executable,
      cwd: path.dirname(executable),
    };
  }

  const projectRoot = app.getAppPath();
  const configuredPython = process.env.DESKTOP_PYTHON;
  const venvPython = path.join(projectRoot, "ai-server", ".venv", "Scripts", "python.exe");
  const python = configuredPython || (fs.existsSync(venvPython) ? venvPython : "python");

  return {
    args: [path.join(projectRoot, "ai-server", "desktop_server.py")],
    command: python,
    cwd: path.join(projectRoot, "ai-server"),
  };
}

function stopBackend() {
  if (!backendProcess || !ownsBackendProcess) {
    return;
  }

  const processId = backendProcess.pid;

  if (process.platform === "win32" && processId) {
    spawnSync("taskkill", ["/pid", String(processId), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    backendProcess.kill();
  }

  backendProcess = null;
  ownsBackendProcess = false;
}

async function ensureBackend() {
  if (await requestHealth()) {
    console.log(`[desktop] connected to existing backend at ${BACKEND_HEALTH_URL}`);
    return;
  }

  if (process.env.AI_DESKTOP_CONNECT_ONLY === "1") {
    throw new Error(`No backend is listening at ${BACKEND_HEALTH_URL}`);
  }

  const modelPath = resolveModelPath();
  const backend = resolveBackendCommand();
  const childEnvironment = {
    ...process.env,
    AI_DEBUG_SAVE_MASKS: process.env.AI_DEBUG_SAVE_MASKS || "0",
    AI_DESKTOP_HOST: BACKEND_HOST,
    AI_DESKTOP_PORT: String(BACKEND_PORT),
    AI_LIGHTWEIGHT_MODEL_PATH: modelPath,
    AI_SEGMENTER: process.env.AI_SEGMENTER || "lightweight",
    PYTHONUNBUFFERED: "1",
  };

  if (!fs.existsSync(modelPath)) {
    console.warn(`[desktop] model not found at ${modelPath}; AI requests will fail safely`);
  }

  console.log(`[desktop] starting backend: ${backend.command} ${backend.args.join(" ")}`);
  backendProcess = spawn(backend.command, backend.args, {
    cwd: backend.cwd,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  ownsBackendProcess = true;

  backendProcess.stdout.on("data", (data) => {
    process.stdout.write(`[ai-server] ${data}`);
  });
  backendProcess.stderr.on("data", (data) => {
    process.stderr.write(`[ai-server] ${data}`);
  });
  backendProcess.on("error", (error) => {
    console.error("[desktop] backend process error", error);
  });
  backendProcess.on("exit", (code, signal) => {
    console.log(`[desktop] backend exited code=${code} signal=${signal}`);
    backendProcess = null;
    ownsBackendProcess = false;
  });

  if (!(await waitForBackend())) {
    stopBackend();
    throw new Error(`Backend did not become healthy at ${BACKEND_HEALTH_URL}`);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    backgroundColor: "#f5f7f8",
    height: 900,
    minHeight: 720,
    minWidth: 1120,
    show: false,
    title: "服装校色工具",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
    width: 1440,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();

    if (process.env.DESKTOP_SMOKE_TEST === "1") {
      console.log("[desktop] smoke test window is ready");
      setTimeout(() => app.quit(), 1500);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged) {
    const rendererUrl =
      process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:5173";
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await ensureBackend();
      createWindow();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[desktop] startup failed", error);
      dialog.showErrorBox("服装校色工具启动失败", message);
      app.quit();
    }
  });
}

app.on("before-quit", stopBackend);
app.on("window-all-closed", () => app.quit());
