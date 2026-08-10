import type { AgentPilotsDesktopApi } from "./desktop";

declare global {
  interface Window {
    agentpilots?: AgentPilotsDesktopApi;
  }
}

export {};
