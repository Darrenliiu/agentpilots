"use strict";

const { dialog } = require("electron");

/**
 * @param {{
 *   isDev: boolean,
 *   getMainWindow: () => import('electron').BrowserWindow | null,
 * }} opts
 */
function setupAutoUpdater(opts) {
  if (opts.isDev) {
    return {
      check: async () => ({ status: "dev", message: "Updates disabled in development" }),
      install: () => false,
      getState: () => ({ status: "dev" }),
    };
  }

  // Lazy-load so this module can be required only inside Electron.
  const { autoUpdater } = require("electron-updater");

  /** @type {{
   *   status: string,
   *   version?: string,
   *   percent?: number,
   *   message?: string,
   *   error?: string,
   * }} */
  let state = { status: "idle" };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  const emit = () => {
    const win = opts.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("updates:status", state);
    }
  };

  autoUpdater.on("checking-for-update", () => {
    state = { status: "checking" };
    emit();
  });

  autoUpdater.on("update-available", (info) => {
    state = {
      status: "available",
      version: info.version,
      message: `Update ${info.version} available`,
    };
    emit();
  });

  autoUpdater.on("update-not-available", (info) => {
    state = {
      status: "up-to-date",
      version: info.version,
      message: "You are on the latest version",
    };
    emit();
  });

  autoUpdater.on("download-progress", (progress) => {
    state = {
      status: "downloading",
      percent: Math.round(progress.percent),
      message: `Downloading update… ${Math.round(progress.percent)}%`,
    };
    emit();
  });

  autoUpdater.on("update-downloaded", async (info) => {
    state = {
      status: "ready",
      version: info.version,
      message: `Update ${info.version} ready to install`,
    };
    emit();

    const win = opts.getMainWindow();
    const result = await dialog.showMessageBox(win || undefined, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "AgentPilots update ready",
      message: `Version ${info.version} has been downloaded.`,
      detail:
        "Restart to install the update and stay in sync with the latest web release.",
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on("error", (err) => {
    state = {
      status: "error",
      error: err?.message || String(err),
      message: err?.message || "Update check failed",
    };
    emit();
  });

  const check = async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { status: state.status, updateInfo: result?.updateInfo || null };
    } catch (err) {
      state = {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
      emit();
      return state;
    }
  };

  setTimeout(() => {
    void check();
  }, 8_000);
  setInterval(
    () => {
      void check();
    },
    6 * 60 * 60 * 1000,
  );

  return {
    check,
    install: () => {
      if (state.status === "ready") {
        autoUpdater.quitAndInstall(false, true);
        return true;
      }
      return false;
    },
    getState: () => ({ ...state }),
  };
}

module.exports = { setupAutoUpdater };
