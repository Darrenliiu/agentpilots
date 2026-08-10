"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");

const catalog = require("./model-catalog.json");

const LOCAL_LLM_PORT = Number(process.env.LOCAL_LLM_PORT || catalog.llamaPort || 11435);
const LOCAL_LLM_HOST = "127.0.0.1";

/**
 * @typedef {object} CatalogModel
 * @property {string} id
 * @property {string} label
 * @property {string} filename
 * @property {string} url
 * @property {number} sizeBytes
 * @property {number} minRamGb
 * @property {string} license
 * @property {boolean} bundled
 * @property {string} [description]
 */

class ModelManager extends EventEmitter {
  /**
   * @param {{
   *   resourcesPath: string,
   *   userDataPath: string,
   *   isPackaged: boolean,
   * }} opts
   */
  constructor(opts) {
    super();
    this.resourcesPath = opts.resourcesPath;
    this.userDataPath = opts.userDataPath;
    this.isPackaged = opts.isPackaged;
    this.modelsDir = path.join(this.userDataPath, "models");
    this.bundledModelsDir = path.join(this.resourcesPath, "models");
    this.llamaDir = path.join(this.resourcesPath, "llama");
    this.statusPath = path.join(this.userDataPath, "local-llm-status.json");
    this.commandPath = path.join(this.userDataPath, "local-llm-command.json");
    this.activeModelId = catalog.defaultModelId;
    /** @type {import('child_process').ChildProcess | null} */
    this.llamaProcess = null;
    /** @type {Map<string, { abort: AbortController, received: number, total: number }>} */
    this.downloads = new Map();
    this.runtime = {
      ready: false,
      activeModelId: null,
      baseUrl: `http://${LOCAL_LLM_HOST}:${LOCAL_LLM_PORT}/v1`,
      error: null,
      pid: null,
    };
  }

  ensureDirs() {
    fs.mkdirSync(this.modelsDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.statusPath), { recursive: true });
  }

  /** @returns {CatalogModel[]} */
  getCatalog() {
    return catalog.models;
  }

  getLlamaBinaryPath() {
    const name = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    return path.join(this.llamaDir, name);
  }

  /**
   * @param {CatalogModel} model
   */
  resolveModelPath(model) {
    const userPath = path.join(this.modelsDir, model.filename);
    if (fs.existsSync(userPath)) return userPath;
    const bundledPath = path.join(this.bundledModelsDir, model.filename);
    if (fs.existsSync(bundledPath)) return bundledPath;
    return null;
  }

  /**
   * @param {string} id
   */
  getCatalogModel(id) {
    return this.getCatalog().find((m) => m.id === id) || null;
  }

  listModels() {
    const totalMemGb = Math.round(os.totalmem() / (1024 ** 3));
    return this.getCatalog().map((model) => {
      const filePath = this.resolveModelPath(model);
      const downloading = this.downloads.get(model.id);
      return {
        ...model,
        installed: Boolean(filePath),
        path: filePath,
        active: this.runtime.activeModelId === model.id,
        canFit: totalMemGb >= model.minRamGb,
        totalMemGb,
        download: downloading
          ? {
              inProgress: true,
              received: downloading.received,
              total: downloading.total || model.sizeBytes,
              percent:
                downloading.total || model.sizeBytes
                  ? Math.min(
                      100,
                      Math.round(
                        (downloading.received /
                          (downloading.total || model.sizeBytes)) *
                          100,
                      ),
                    )
                  : 0,
            }
          : { inProgress: false, received: 0, total: model.sizeBytes, percent: 0 },
      };
    });
  }

  getRuntimeStatus() {
    return {
      ...this.runtime,
      models: this.listModels(),
      statusPath: this.statusPath,
      llamaBinaryPresent: fs.existsSync(this.getLlamaBinaryPath()),
    };
  }

  writeStatus() {
    this.ensureDirs();
    const payload = {
      updatedAt: new Date().toISOString(),
      ...this.getRuntimeStatus(),
    };
    fs.writeFileSync(this.statusPath, JSON.stringify(payload, null, 2), "utf8");
    this.emit("status", payload);
    return payload;
  }

  startCommandWatcher() {
    this.ensureDirs();
    if (!fs.existsSync(this.commandPath)) {
      fs.writeFileSync(this.commandPath, "{}\n", "utf8");
    }
    let last = "";
    this._commandTimer = setInterval(() => {
      try {
        const raw = fs.readFileSync(this.commandPath, "utf8");
        if (raw === last) return;
        last = raw;
        const cmd = JSON.parse(raw);
        if (cmd?.action === "setActive" && cmd.modelId) {
          const id = String(cmd.modelId);
          if (this.runtime.activeModelId === id && this.runtime.ready) {
            fs.writeFileSync(
              this.commandPath,
              JSON.stringify({ action: "noop", done: true, modelId: id }),
              "utf8",
            );
            return;
          }
          void this.setActiveModel(id)
            .then(() => {
              fs.writeFileSync(
                this.commandPath,
                JSON.stringify({
                  action: "noop",
                  done: true,
                  modelId: id,
                }),
                "utf8",
              );
            })
            .catch((err) => {
              fs.writeFileSync(
                this.commandPath,
                JSON.stringify({
                  action: "noop",
                  done: true,
                  error: err instanceof Error ? err.message : String(err),
                }),
                "utf8",
              );
            });
        }
      } catch {
        // ignore parse/watch errors
      }
    }, 500);
  }

  stopCommandWatcher() {
    if (this._commandTimer) clearInterval(this._commandTimer);
  }

  /**
   * @param {number} port
   */
  async waitForServer(port, timeoutMs = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ok = await new Promise((resolve) => {
        const req = http.get(
          { host: LOCAL_LLM_HOST, port, path: "/health", timeout: 1500 },
          (res) => {
            res.resume();
            resolve(res.statusCode && res.statusCode < 500);
          },
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }

  async stopLlama() {
    if (!this.llamaProcess) return;
    const child = this.llamaProcess;
    this.llamaProcess = null;
    await new Promise((resolve) => {
      const done = () => resolve(undefined);
      child.once("exit", done);
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        // ignore
      }
      setTimeout(done, 2000);
    });
  }

  /**
   * @param {string} [modelId]
   */
  async startLlama(modelId) {
    this.ensureDirs();
    const id = modelId || this.activeModelId || catalog.defaultModelId;
    const model = this.getCatalogModel(id);
    if (!model) {
      this.runtime = {
        ...this.runtime,
        ready: false,
        error: `Unknown model: ${id}`,
        activeModelId: null,
        pid: null,
      };
      this.writeStatus();
      throw new Error(this.runtime.error || "Unknown model");
    }

    const modelPath = this.resolveModelPath(model);
    if (!modelPath) {
      this.runtime = {
        ...this.runtime,
        ready: false,
        error: `Model file missing: ${model.filename}. Download it from Local Models.`,
        activeModelId: null,
        pid: null,
      };
      this.writeStatus();
      throw new Error(this.runtime.error || "Model missing");
    }

    const binary = this.getLlamaBinaryPath();
    if (!fs.existsSync(binary)) {
      this.runtime = {
        ...this.runtime,
        ready: false,
        error:
          "llama-server binary not found. Run npm run desktop:fetch-runtime to install it.",
        activeModelId: null,
        pid: null,
      };
      this.writeStatus();
      throw new Error(this.runtime.error || "llama-server missing");
    }

    await this.stopLlama();

    const args = [
      "-m",
      modelPath,
      "--host",
      LOCAL_LLM_HOST,
      "--port",
      String(LOCAL_LLM_PORT),
      "-c",
      "4096",
      "--jinja",
    ];

    this.llamaProcess = spawn(binary, args, {
      cwd: path.dirname(binary),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const pid = this.llamaProcess.pid || null;
    let stderr = "";
    this.llamaProcess.stderr?.on("data", (buf) => {
      stderr += buf.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    this.llamaProcess.stdout?.on("data", () => {});
    this.llamaProcess.on("exit", (code) => {
      if (this.llamaProcess && this.llamaProcess.pid === pid) {
        this.llamaProcess = null;
        this.runtime = {
          ...this.runtime,
          ready: false,
          error: `llama-server exited (code ${code}). ${stderr.slice(-500)}`,
          pid: null,
        };
        this.writeStatus();
      }
    });

    const ready = await this.waitForServer(LOCAL_LLM_PORT);
    if (!ready) {
      await this.stopLlama();
      this.runtime = {
        ...this.runtime,
        ready: false,
        error: `llama-server failed to become ready. ${stderr.slice(-500)}`,
        activeModelId: null,
        pid: null,
      };
      this.writeStatus();
      throw new Error(this.runtime.error || "llama-server not ready");
    }

    this.activeModelId = id;
    this.runtime = {
      ready: true,
      activeModelId: id,
      baseUrl: `http://${LOCAL_LLM_HOST}:${LOCAL_LLM_PORT}/v1`,
      error: null,
      pid,
    };
    this.writeStatus();
    return this.getRuntimeStatus();
  }

  /**
   * @param {string} modelId
   */
  async setActiveModel(modelId) {
    return this.startLlama(modelId);
  }

  /**
   * @param {string} modelId
   */
  async downloadModel(modelId) {
    const model = this.getCatalogModel(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    if (this.downloads.has(modelId)) {
      throw new Error("Download already in progress");
    }

    this.ensureDirs();
    const dest = path.join(this.modelsDir, model.filename);
    const partial = `${dest}.partial`;
    if (fs.existsSync(dest)) {
      return this.listModels().find((m) => m.id === modelId);
    }

    const abort = new AbortController();
    const state = { abort, received: 0, total: model.sizeBytes };
    this.downloads.set(modelId, state);
    this.writeStatus();

    try {
      await downloadFile(model.url, partial, abort.signal, (received, total) => {
        state.received = received;
        if (total) state.total = total;
        this.emit("download-progress", {
          id: modelId,
          received: state.received,
          total: state.total,
        });
        this.writeStatus();
      });
      fs.renameSync(partial, dest);
    } catch (err) {
      try {
        if (fs.existsSync(partial)) fs.unlinkSync(partial);
      } catch {
        // ignore
      }
      throw err;
    } finally {
      this.downloads.delete(modelId);
      this.writeStatus();
    }

    return this.listModels().find((m) => m.id === modelId);
  }

  /**
   * @param {string} modelId
   */
  cancelDownload(modelId) {
    const state = this.downloads.get(modelId);
    if (state) state.abort.abort();
  }

  async dispose() {
    this.stopCommandWatcher();
    for (const id of [...this.downloads.keys()]) {
      this.cancelDownload(id);
    }
    await this.stopLlama();
    this.writeStatus();
  }
}

/**
 * @param {string} url
 * @param {string} dest
 * @param {AbortSignal} signal
 * @param {(received: number, total: number) => void} onProgress
 */
function downloadFile(url, dest, signal, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      file.close(() => {
        try {
          fs.unlinkSync(dest);
        } catch {
          // ignore
        }
        reject(err);
      });
    };

    const follow = (currentUrl, redirects = 0) => {
      if (redirects > 8) return fail(new Error("Too many redirects"));
      const lib = currentUrl.startsWith("https") ? https : http;
      const req = lib.get(currentUrl, { signal }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          follow(new URL(res.headers.location, currentUrl).toString(), redirects + 1);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          fail(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers["content-length"] || 0);
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          onProgress(received, total);
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            if (settled) return;
            settled = true;
            resolve(undefined);
          });
        });
      });
      req.on("error", fail);
      signal.addEventListener(
        "abort",
        () => {
          req.destroy();
          fail(new Error("Download cancelled"));
        },
        { once: true },
      );
    };

    follow(url);
  });
}

module.exports = {
  ModelManager,
  LOCAL_LLM_PORT,
  LOCAL_LLM_HOST,
  catalog,
};
