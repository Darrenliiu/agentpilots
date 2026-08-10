"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentpilots", {
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  models: {
    list: () => ipcRenderer.invoke("models:list"),
    status: () => ipcRenderer.invoke("models:status"),
    setActive: (id) => ipcRenderer.invoke("models:setActive", id),
    download: (id) => ipcRenderer.invoke("models:download", id),
    cancelDownload: (id) => ipcRenderer.invoke("models:cancelDownload", id),
    onStatus: (cb) => {
      const handler = (_event, payload) => cb(payload);
      ipcRenderer.on("models:status", handler);
      return () => ipcRenderer.removeListener("models:status", handler);
    },
    onDownloadProgress: (cb) => {
      const handler = (_event, payload) => cb(payload);
      ipcRenderer.on("models:download-progress", handler);
      return () => ipcRenderer.removeListener("models:download-progress", handler);
    },
  },
  updates: {
    status: () => ipcRenderer.invoke("updates:status"),
    check: () => ipcRenderer.invoke("updates:check"),
    install: () => ipcRenderer.invoke("updates:install"),
    onStatus: (cb) => {
      const handler = (_event, payload) => cb(payload);
      ipcRenderer.on("updates:status", handler);
      return () => ipcRenderer.removeListener("updates:status", handler);
    },
  },
});
