/** Server / Edge: Electron sets AGENTPILOTS_DESKTOP=1 on the Next process. */
export function isDesktopServer() {
  return process.env.AGENTPILOTS_DESKTOP === "1";
}

/** Browser: preload exposes window.agentpilots. */
export function isDesktopClient() {
  return typeof window !== "undefined" && Boolean(window.agentpilots);
}
