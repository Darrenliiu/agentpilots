import { existsSync, readFileSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import path from "path";
import type { Agent } from "@/lib/types";

export const CLI_PROVIDERS = ["claude-cli", "codex-cli"] as const;
export type CliProvider = (typeof CLI_PROVIDERS)[number];

export type DesktopCliInfo = {
  id: string;
  label: string;
  provider: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  installUrl: string;
  installHint: string;
  loginHint: string;
};

export type DesktopCliStatus = {
  updatedAt?: string;
  desktop?: boolean;
  clis: DesktopCliInfo[];
};

export function isCliProvider(provider: string): provider is CliProvider {
  return (CLI_PROVIDERS as readonly string[]).includes(provider);
}

function statusPath() {
  return (
    process.env.AGENTPILOTS_CLI_STATUS_PATH ||
    path.join(process.cwd(), ".cli-status.json")
  );
}

export function readDesktopCliStatus(): DesktopCliStatus {
  const file = statusPath();
  if (existsSync(/*turbopackIgnore: true*/ file)) {
    try {
      const parsed = JSON.parse(
        readFileSync(/*turbopackIgnore: true*/ file, "utf8"),
      ) as DesktopCliStatus;
      return {
        ...parsed,
        desktop: true,
        clis: Array.isArray(parsed.clis) ? parsed.clis : [],
      };
    } catch {
      // fall through
    }
  }

  return {
    desktop: process.env.AGENTPILOTS_DESKTOP === "1",
    clis: [
      {
        id: "claude",
        label: "Claude Code CLI",
        provider: "claude-cli",
        installed: Boolean(process.env.AGENTPILOTS_CLAUDE_CLI_PATH),
        path: process.env.AGENTPILOTS_CLAUDE_CLI_PATH || null,
        version: null,
        installUrl: "https://code.claude.com/docs/en/setup",
        installHint:
          "Install Claude Code, then run `claude` once and sign in.",
        loginHint: "Open a terminal and run: claude",
      },
      {
        id: "codex",
        label: "OpenAI Codex CLI",
        provider: "codex-cli",
        installed: Boolean(process.env.AGENTPILOTS_CODEX_CLI_PATH),
        path: process.env.AGENTPILOTS_CODEX_CLI_PATH || null,
        version: null,
        installUrl: "https://developers.openai.com/codex/cli",
        installHint:
          "Install the Codex CLI, then run `codex` once and sign in.",
        loginHint: "Open a terminal and run: codex",
      },
    ],
  };
}

export function getCliForProvider(provider: string): DesktopCliInfo | null {
  return (
    readDesktopCliStatus().clis.find((c) => c.provider === provider) || null
  );
}

function resolveCliBinary(provider: CliProvider): string {
  const fromStatus = getCliForProvider(provider)?.path;
  if (fromStatus && existsSync(/*turbopackIgnore: true*/ fromStatus)) {
    return fromStatus;
  }
  if (provider === "claude-cli" && process.env.AGENTPILOTS_CLAUDE_CLI_PATH) {
    return process.env.AGENTPILOTS_CLAUDE_CLI_PATH;
  }
  if (provider === "codex-cli" && process.env.AGENTPILOTS_CODEX_CLI_PATH) {
    return process.env.AGENTPILOTS_CODEX_CLI_PATH;
  }
  throw new Error(
    provider === "claude-cli"
      ? "Claude Code CLI not found. Install it from the agent settings walkthrough, then reopen Desktop."
      : "Codex CLI not found. Install it from the agent settings walkthrough, then reopen Desktop.",
  );
}

function spawnText(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ text: string; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      reject(new Error(`CLI timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = stdout.trim();
      if (code !== 0 && !text) {
        reject(
          new Error(
            stderr.trim() || `CLI exited with code ${code ?? "unknown"}`,
          ),
        );
        return;
      }
      resolve({
        text: text || stderr.trim() || "(empty CLI response)",
        warnings:
          code !== 0
            ? [`CLI exited with code ${code}; used captured output.`]
            : [],
      });
    });
  });
}

/** Ask Electron to re-scan PATH (best-effort via status refresh file). */
export function requestCliRescan() {
  const file = statusPath().replace(/cli-status\.json$/i, "cli-command.json");
  writeFileSync(
    /*turbopackIgnore: true*/ file,
    JSON.stringify({
      action: "detect",
      requestedAt: new Date().toISOString(),
    }),
    "utf8",
  );
}

export async function generateAgentCliReply(opts: {
  agent: Agent;
  systemPrompt: string;
  userPrompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  timeoutMs?: number;
}): Promise<{ text: string; warnings: string[]; usage: null }> {
  if (!isCliProvider(opts.agent.provider)) {
    throw new Error(`Not a CLI provider: ${opts.agent.provider}`);
  }

  const desktop =
    process.env.AGENTPILOTS_DESKTOP === "1" ||
    Boolean(process.env.AGENTPILOTS_CLI_STATUS_PATH) ||
    readDesktopCliStatus().desktop;

  if (!desktop) {
    throw new Error(
      "Claude/Codex CLI agents require the AgentPilots desktop app",
    );
  }

  const historyBlock = opts.history.length
    ? opts.history
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n")
    : "";
  const prompt = [historyBlock, `User: ${opts.userPrompt}`]
    .filter(Boolean)
    .join("\n\n");

  const bin = resolveCliBinary(opts.agent.provider);
  const timeoutMs = opts.timeoutMs ?? 180000;
  const model = opts.agent.model?.trim() || undefined;

  if (opts.agent.provider === "claude-cli") {
    const args = ["-p", "--bare", "--output-format", "text"];
    if (opts.systemPrompt) {
      args.push("--append-system-prompt", opts.systemPrompt);
    }
    if (model) args.push("--model", model);
    args.push(prompt);
    const result = await spawnText(bin, args, timeoutMs);
    return { ...result, usage: null };
  }

  const combined = opts.systemPrompt
    ? `System instructions:\n${opts.systemPrompt}\n\n${prompt}`
    : prompt;
  const args = ["exec", "--ephemeral", "--skip-git-repo-check"];
  if (model) args.push("--model", model);
  args.push(combined);
  const result = await spawnText(bin, args, timeoutMs);
  return { ...result, usage: null };
}
