"use strict";

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");

const CLI_DEFS = [
  {
    id: "claude",
    label: "Claude Code CLI",
    provider: "claude-cli",
    commands: ["claude"],
    installUrl: "https://code.claude.com/docs/en/setup",
    installHint:
      "Install Claude Code, then run `claude` once and sign in. AgentPilots will detect it automatically.",
    loginHint: "Open a terminal and run: claude",
  },
  {
    id: "codex",
    label: "OpenAI Codex CLI",
    provider: "codex-cli",
    commands: ["codex"],
    installUrl: "https://developers.openai.com/codex/cli",
    installHint:
      "Install the Codex CLI, then run `codex` once and sign in with ChatGPT or an API key.",
    loginHint: "Open a terminal and run: codex",
  },
];

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function homeDir() {
  return os.homedir();
}

function candidateDirs() {
  const home = homeDir();
  const dirs = [
    path.join(home, ".local", "bin"),
    path.join(home, "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, "AppData", "Roaming", "npm"),
    path.join(home, "AppData", "Local", "npm"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
  ];
  if (process.env.LOCALAPPDATA) {
    dirs.push(path.join(process.env.LOCALAPPDATA, "npm"));
  }
  if (process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, "npm"));
  }
  if (process.env.PATH) {
    dirs.push(...process.env.PATH.split(path.delimiter));
  }
  return unique(dirs);
}

function commandCandidates(base) {
  if (process.platform === "win32") {
    return [`${base}.cmd`, `${base}.exe`, base, `${base}.ps1`];
  }
  return [base];
}

function whichOnPath(command) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("where.exe", [command], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      });
      const first = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      return first || null;
    }
    const out = execFileSync("which", [command], {
      encoding: "utf8",
      timeout: 5000,
    });
    const first = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

function findBinary(commands) {
  for (const command of commands) {
    const fromPath = whichOnPath(command);
    if (fromPath && fs.existsSync(fromPath)) return fromPath;

    for (const dir of candidateDirs()) {
      for (const name of commandCandidates(command)) {
        const full = path.join(dir, name);
        try {
          if (fs.existsSync(full)) return full;
        } catch {
          // ignore
        }
      }
    }
  }
  return null;
}

function probeVersion(binPath) {
  try {
    const out = execFileSync(binPath, ["--version"], {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    return out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || null;
  } catch {
    return null;
  }
}

class CliManager extends EventEmitter {
  /**
   * @param {{ userDataPath: string }} opts
   */
  constructor(opts) {
    super();
    this.userDataPath = opts.userDataPath;
    this.statusPath = path.join(this.userDataPath, "cli-status.json");
    /** @type {Record<string, { id: string, label: string, provider: string, installed: boolean, path: string | null, version: string | null, installUrl: string, installHint: string, loginHint: string }>} */
    this.cache = {};
  }

  ensureDirs() {
    fs.mkdirSync(path.dirname(this.statusPath), { recursive: true });
  }

  detectAll() {
    const clis = CLI_DEFS.map((def) => {
      const binPath = findBinary(def.commands);
      const installed = Boolean(binPath);
      return {
        id: def.id,
        label: def.label,
        provider: def.provider,
        installed,
        path: binPath,
        version: installed ? probeVersion(binPath) : null,
        installUrl: def.installUrl,
        installHint: def.installHint,
        loginHint: def.loginHint,
      };
    });
    for (const cli of clis) {
      this.cache[cli.id] = cli;
    }
    return this.writeStatus(clis);
  }

  list() {
    if (!Object.keys(this.cache).length) {
      return this.detectAll().clis;
    }
    return Object.values(this.cache);
  }

  get(id) {
    return this.list().find((c) => c.id === id) || null;
  }

  getByProvider(provider) {
    return this.list().find((c) => c.provider === provider) || null;
  }

  writeStatus(clis = this.list()) {
    this.ensureDirs();
    const payload = {
      updatedAt: new Date().toISOString(),
      desktop: true,
      clis,
      env: {
        AGENTPILOTS_CLAUDE_CLI_PATH:
          clis.find((c) => c.id === "claude")?.path || "",
        AGENTPILOTS_CODEX_CLI_PATH:
          clis.find((c) => c.id === "codex")?.path || "",
      },
    };
    fs.writeFileSync(this.statusPath, JSON.stringify(payload, null, 2), "utf8");
    this.emit("status", payload);
    return payload;
  }

  /**
   * @param {{
   *   provider: string,
   *   prompt: string,
   *   systemPrompt?: string,
   *   model?: string,
   *   timeoutMs?: number,
   * }} opts
   */
  async runPrompt(opts) {
    const cli =
      this.getByProvider(opts.provider) ||
      (opts.provider === "claude-cli"
        ? this.get("claude")
        : opts.provider === "codex-cli"
          ? this.get("codex")
          : null);
    if (!cli?.installed || !cli.path) {
      throw new Error(
        `${cli?.label || "CLI"} is not installed. Open agent settings for the install walkthrough.`,
      );
    }

    const timeoutMs = opts.timeoutMs || 180000;
    if (cli.id === "claude") {
      return this._runClaude(cli.path, opts, timeoutMs);
    }
    if (cli.id === "codex") {
      return this._runCodex(cli.path, opts, timeoutMs);
    }
    throw new Error(`Unsupported CLI: ${cli.id}`);
  }

  _runClaude(bin, opts, timeoutMs) {
    const args = [
      "-p",
      "--bare",
      "--output-format",
      "text",
    ];
    if (opts.systemPrompt) {
      args.push("--append-system-prompt", opts.systemPrompt);
    }
    if (opts.model) {
      args.push("--model", opts.model);
    }
    args.push(opts.prompt);
    return this._spawnText(bin, args, timeoutMs);
  }

  _runCodex(bin, opts, timeoutMs) {
    const parts = [];
    if (opts.systemPrompt) {
      parts.push(`System instructions:\n${opts.systemPrompt}`);
    }
    parts.push(opts.prompt);
    const prompt = parts.join("\n\n");
    const args = ["exec", "--ephemeral", "--skip-git-repo-check"];
    if (opts.model) {
      args.push("--model", opts.model);
    }
    args.push(prompt);
    return this._spawnText(bin, args, timeoutMs);
  }

  /**
   * @param {string} bin
   * @param {string[]} args
   * @param {number} timeoutMs
   */
  _spawnText(bin, args, timeoutMs) {
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

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
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
}

module.exports = { CliManager, CLI_DEFS };
