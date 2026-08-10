"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { ModelManager, LOCAL_LLM_PORT, LOCAL_LLM_HOST } = require("./model-manager.cjs");
const { CliManager } = require("./cli-manager.cjs");
const { setupAutoUpdater } = require("./auto-updater.cjs");

const isDev = !app.isPackaged;
const NEXT_PORT = Number(process.env.AGENTPILOTS_PORT || 3847);
const START_PATH = process.env.AGENTPILOTS_START_PATH || "/login";
/** Warm app canvas — matches web `--bg` so the shell feels like SaaS, not a utility. */
const WINDOW_BG = "#f3efe6";

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {import('child_process').ChildProcess | null} */
let nextProcess = null;
/** @type {ModelManager | null} */
let modelManager = null;
/** @type {CliManager | null} */
let cliManager = null;
/** @type {ReturnType<typeof setupAutoUpdater> | null} */
let updater = null;
/** @type {ReturnType<typeof setInterval> | null} */
let cliCommandTimer = null;

function getResourcesPath() {
  if (isDev) return path.join(__dirname, "resources");
  return process.resourcesPath;
}

function applyEnvFile(file) {
  if (!fs.existsSync(file)) return false;
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
  return true;
}

function loadEnvFile() {
  const candidates = [
    path.join(app.getPath("userData"), ".env"),
    path.join(getResourcesPath(), "app-standalone", ".env"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", ".env"),
  ];
  for (const file of candidates) {
    if (applyEnvFile(file)) break;
  }
}

function waitForHttp(url, timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (nextProcess && nextProcess.exitCode != null) {
        reject(
          new Error(
            `Next process exited early (code ${nextProcess.exitCode}) while waiting for ${url}`,
          ),
        );
        return;
      }
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

function appendNextLog(chunk) {
  try {
    const logPath = path.join(app.getPath("userData"), "next-server.log");
    fs.appendFileSync(logPath, chunk);
  } catch {
    // ignore log write failures
  }
}

function startCliCommandWatcher() {
  if (!cliManager) return;
  const commandPath = path.join(app.getPath("userData"), "cli-command.json");
  if (!fs.existsSync(commandPath)) {
    fs.writeFileSync(commandPath, "{}\n", "utf8");
  }
  let last = "";
  cliCommandTimer = setInterval(() => {
    try {
      const raw = fs.readFileSync(commandPath, "utf8");
      if (raw === last) return;
      last = raw;
      const cmd = JSON.parse(raw);
      if (cmd?.action === "detect") {
        const payload = cliManager.detectAll();
        fs.writeFileSync(
          commandPath,
          JSON.stringify({ action: "noop", done: true }),
          "utf8",
        );
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("cli:status", payload);
        }
      }
    } catch {
      // ignore
    }
  }, 800);
}

async function startNextServer() {
  const cliStatus = cliManager?.detectAll();
  const env = {
    ...process.env,
    PORT: String(NEXT_PORT),
    HOSTNAME: "127.0.0.1",
    LOCAL_LLM_BASE_URL: `http://${LOCAL_LLM_HOST}:${LOCAL_LLM_PORT}/v1`,
    LOCAL_LLM_STATUS_PATH: modelManager?.statusPath || "",
    AGENTPILOTS_CLI_STATUS_PATH: cliManager?.statusPath || "",
    AGENTPILOTS_CLAUDE_CLI_PATH:
      cliStatus?.env?.AGENTPILOTS_CLAUDE_CLI_PATH || "",
    AGENTPILOTS_CODEX_CLI_PATH:
      cliStatus?.env?.AGENTPILOTS_CODEX_CLI_PATH || "",
    AGENTPILOTS_DESKTOP: "1",
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL || "https://agentpilots.ai",
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
    const nextModule = path.join(standaloneDir, "node_modules", "next");
    if (!fs.existsSync(serverJs)) {
      throw new Error(`Next standalone server missing at ${serverJs}`);
    }
    if (!fs.existsSync(nextModule)) {
      throw new Error(
        `Next runtime missing at ${nextModule}. Reinstall AgentPilots or rebuild with desktop:dist (electron-builder must pack standalone node_modules).`,
      );
    }
    try {
      fs.writeFileSync(path.join(app.getPath("userData"), "next-server.log"), "");
    } catch {
      // ignore
    }
    nextProcess = spawn(process.execPath, [serverJs], {
      cwd: standaloneDir,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    nextProcess.stdout?.on("data", (buf) => {
      const text = buf.toString();
      process.stdout.write(text);
      appendNextLog(text);
    });
    nextProcess.stderr?.on("data", (buf) => {
      const text = buf.toString();
      process.stderr.write(text);
      appendNextLog(text);
    });
  }

  nextProcess.on("exit", (code) => {
    console.error("Next process exited", code);
  });

  await waitForHttp(`http://127.0.0.1:${NEXT_PORT}${START_PATH}`);
}

function setupApplicationMenu() {
  // Drop the classic File/Edit/View/Window/Help bar for a cleaner SaaS shell.
  // Keep a minimal macOS menu so Quit / Edit shortcuts stay available.
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: "appMenu" },
        { role: "editMenu" },
        { role: "windowMenu" },
      ]),
    );
    return;
  }
  Menu.setApplicationMenu(null);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "AgentPilots",
    backgroundColor: WINDOW_BG,
    show: false,
    autoHideMenuBar: true,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.loadURL(`http://127.0.0.1:${NEXT_PORT}${START_PATH}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function registerMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === "media" || permission === "microphone") {
        callback(true);
        return;
      }
      callback(false);
    },
  );
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
  ipcMain.handle("cli:status", async () => cliManager?.writeStatus() || { clis: [] });
  ipcMain.handle("cli:detect", async () => {
    if (!cliManager) throw new Error("CLI manager not ready");
    return cliManager.detectAll();
  });
  ipcMain.handle("cli:openInstall", async (_e, url) => {
    const target = String(url || "");
    if (!/^https?:\/\//i.test(target)) return false;
    await shell.openExternal(target);
    return true;
  });
  ipcMain.handle("updates:status", async () => updater?.getState() || { status: "idle" });
  ipcMain.handle("updates:check", async () => updater?.check() || { status: "idle" });
  ipcMain.handle("updates:install", async () => updater?.install() || false);
  ipcMain.handle("app:getVersion", async () => app.getVersion());
}

async function showStartupError(err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  const logHint = path.join(app.getPath("userData"), "next-server.log");
  await dialog.showMessageBox({
    type: "error",
    title: "AgentPilots failed to start",
    message: "The desktop shell could not start the local app server.",
    detail: `${message}\n\nIf this keeps happening, check:\n${logHint}`,
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

  cliManager = new CliManager({
    userDataPath: app.getPath("userData"),
  });
  cliManager.detectAll();
  startCliCommandWatcher();

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
  cliManager.on("status", (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cli:status", payload);
    }
  });

  registerIpc();
  registerMediaPermissions();

  updater = setupAutoUpdater({
    isDev,
    getMainWindow: () => mainWindow,
  });

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
  setupApplicationMenu();
  bootstrap().catch(async (err) => {
    await showStartupError(err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (cliCommandTimer) {
    clearInterval(cliCommandTimer);
    cliCommandTimer = null;
  }
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
