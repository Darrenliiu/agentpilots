"use strict";

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { ModelManager, LOCAL_LLM_PORT, LOCAL_LLM_HOST } = require("./model-manager.cjs");

const isDev = !app.isPackaged;
const NEXT_PORT = Number(process.env.AGENTPILOTS_PORT || 3847);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {import('child_process').ChildProcess | null} */
let nextProcess = null;
/** @type {ModelManager | null} */
let modelManager = null;

function getResourcesPath() {
  if (isDev) return path.join(__dirname, "resources");
  return process.resourcesPath;
}

function loadEnvFile() {
  const candidates = [
    path.join(app.getPath("userData"), ".env"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    break;
  }
}

function waitForHttp(url, timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(undefined);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(tick, 400);
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function startNextServer() {
  const env = {
    ...process.env,
    PORT: String(NEXT_PORT),
    HOSTNAME: "127.0.0.1",
    LOCAL_LLM_BASE_URL: `http://${LOCAL_LLM_HOST}:${LOCAL_LLM_PORT}/v1`,
    LOCAL_LLM_STATUS_PATH: modelManager?.statusPath || "",
    AGENTPILOTS_DESKTOP: "1",
  };

  if (isDev) {
    nextProcess = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["next", "dev", "-p", String(NEXT_PORT), "-H", "127.0.0.1"],
      {
        cwd: path.join(__dirname, ".."),
        env,
        stdio: "inherit",
        shell: process.platform === "win32",
      },
    );
  } else {
    const standaloneDir = path.join(process.resourcesPath, "app-standalone");
    const serverJs = path.join(standaloneDir, "server.js");
    if (!fs.existsSync(serverJs)) {
      throw new Error(`Next standalone server missing at ${serverJs}`);
    }
    nextProcess = spawn(process.execPath, [serverJs], {
      cwd: standaloneDir,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: "inherit",
    });
  }

  nextProcess.on("exit", (code) => {
    console.error("Next process exited", code);
  });

  await waitForHttp(`http://127.0.0.1:${NEXT_PORT}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "AgentPilots",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${NEXT_PORT}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function registerIpc() {
  ipcMain.handle("models:list", async () => modelManager?.listModels() || []);
  ipcMain.handle("models:status", async () => modelManager?.getRuntimeStatus() || null);
  ipcMain.handle("models:setActive", async (_e, id) => {
    if (!modelManager) throw new Error("Model manager not ready");
    return modelManager.setActiveModel(String(id));
  });
  ipcMain.handle("models:download", async (_e, id) => {
    if (!modelManager) throw new Error("Model manager not ready");
    return modelManager.downloadModel(String(id));
  });
  ipcMain.handle("models:cancelDownload", async (_e, id) => {
    modelManager?.cancelDownload(String(id));
    return true;
  });
}

async function bootstrap() {
  loadEnvFile();
  modelManager = new ModelManager({
    resourcesPath: getResourcesPath(),
    userDataPath: app.getPath("userData"),
    isPackaged: app.isPackaged,
  });
  modelManager.ensureDirs();
  modelManager.writeStatus();
  modelManager.startCommandWatcher();

  modelManager.on("status", (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("models:status", payload);
    }
  });
  modelManager.on("download-progress", (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("models:download-progress", payload);
    }
  });

  registerIpc();

  try {
    await modelManager.startLlama();
  } catch (err) {
    console.warn("Local LLM failed to start (continuing):", err);
    modelManager.writeStatus();
  }

  await startNextServer();
  createWindow();
}

app.whenReady().then(() => {
  bootstrap().catch((err) => {
    console.error(err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess && !nextProcess.killed) {
    try {
      if (process.platform === "win32" && nextProcess.pid) {
        spawn("taskkill", ["/pid", String(nextProcess.pid), "/f", "/t"]);
      } else {
        nextProcess.kill("SIGTERM");
      }
    } catch {
      // ignore
    }
  }
  void modelManager?.dispose();
});
