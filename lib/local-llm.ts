import { readFileSync, existsSync, writeFileSync } from "fs";
import path from "path";
import catalog from "@/desktop/model-catalog.json";

export type LocalModelInfo = {
  id: string;
  label: string;
  filename: string;
  url: string;
  sizeBytes: number;
  minRamGb: number;
  license: string;
  bundled: boolean;
  description?: string;
  installed: boolean;
  path: string | null;
  active: boolean;
  canFit: boolean;
  totalMemGb?: number;
  download: {
    inProgress: boolean;
    received: number;
    total: number;
    percent: number;
  };
};

export type LocalLlmStatus = {
  updatedAt?: string;
  ready: boolean;
  activeModelId: string | null;
  baseUrl: string;
  error: string | null;
  pid: number | null;
  models: LocalModelInfo[];
  statusPath?: string;
  llamaBinaryPresent?: boolean;
  desktop?: boolean;
};

function statusPath() {
  return (
    process.env.LOCAL_LLM_STATUS_PATH ||
    path.join(process.cwd(), ".local-llm-status.json")
  );
}

function commandPath() {
  const status = statusPath();
  return status.replace(/local-llm-status\.json$/i, "local-llm-command.json");
}

export function readLocalLlmStatus(): LocalLlmStatus {
  const file = statusPath();
  if (existsSync(/*turbopackIgnore: true*/ file)) {
    try {
      const parsed = JSON.parse(
        readFileSync(/*turbopackIgnore: true*/ file, "utf8"),
      ) as LocalLlmStatus;
      return { ...parsed, desktop: true };
    } catch {
      // fall through
    }
  }

  return {
    ready: false,
    activeModelId: null,
    baseUrl: process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:11435/v1",
    error: process.env.AGENTPILOTS_DESKTOP
      ? "Local LLM status unavailable"
      : "Local models require the AgentPilots desktop app",
    pid: null,
    desktop: process.env.AGENTPILOTS_DESKTOP === "1",
    models: catalog.models.map((m) => ({
      ...m,
      installed: false,
      path: null,
      active: false,
      canFit: true,
      download: {
        inProgress: false,
        received: 0,
        total: m.sizeBytes,
        percent: 0,
      },
    })),
  };
}

export function listInstalledLocalModels() {
  return readLocalLlmStatus().models.filter((m) => m.installed);
}

/** Ask Electron Model Manager to load a model before inference. */
export async function ensureLocalModelActive(modelId: string, timeoutMs = 90000) {
  const status = readLocalLlmStatus();
  if (status.ready && status.activeModelId === modelId) return;

  const desktop =
    status.desktop ||
    process.env.AGENTPILOTS_DESKTOP === "1" ||
    Boolean(process.env.LOCAL_LLM_STATUS_PATH);

  if (!desktop) {
    if (process.env.LOCAL_LLM_BASE_URL) return;
    throw new Error("Local models require the AgentPilots desktop app");
  }

  const cmdFile = commandPath();
  writeFileSync(
    /*turbopackIgnore: true*/ cmdFile,
    JSON.stringify({
      action: "setActive",
      modelId,
      requestedAt: new Date().toISOString(),
    }),
    "utf8",
  );

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 400));
    const next = readLocalLlmStatus();
    if (next.ready && next.activeModelId === modelId) return;
    try {
      if (!existsSync(/*turbopackIgnore: true*/ cmdFile)) continue;
      const cmd = JSON.parse(
        readFileSync(/*turbopackIgnore: true*/ cmdFile, "utf8"),
      ) as {
        done?: boolean;
        error?: string;
      };
      if (cmd.done && cmd.error) throw new Error(cmd.error);
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
  }
  throw new Error(`Timed out activating local model ${modelId}`);
}
