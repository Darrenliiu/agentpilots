#!/usr/bin/env node
/**
 * Downloads llama-server (Windows x64 or macOS arm64) and optionally GGUF
 * models into desktop/resources for local desktop development.
 * Packaged installers do not ship GGUFs — users download them in-app.
 *
 * Usage:
 *   node desktop/scripts/fetch-runtime.mjs
 *   node desktop/scripts/fetch-runtime.mjs --models          # default model only
 *   node desktop/scripts/fetch-runtime.mjs --models --all    # full catalog
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  readFileSync,
  chmodSync,
  unlinkSync,
} from "fs";
import http from "http";
import https from "https";
import path from "path";
import { pipeline } from "stream/promises";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const resources = path.join(root, "resources");
const llamaDir = path.join(resources, "llama");
const modelsDir = path.join(resources, "models");
const catalog = JSON.parse(
  readFileSync(path.join(root, "model-catalog.json"), "utf8"),
);

const args = new Set(process.argv.slice(2));
const wantModels = args.has("--models");
const wantAllModels = args.has("--all");

const LLAMA_TAG = process.env.LLAMA_CPP_TAG || "b10278";

function download(url, dest) {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(dest), { recursive: true });
    const follow = (current, redirects = 0) => {
      if (redirects > 10) return reject(new Error("Too many redirects"));
      const lib = current.startsWith("https") ? https : http;
      lib
        .get(current, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            follow(new URL(res.headers.location, current).toString(), redirects + 1);
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} for ${current}`));
            return;
          }
          const total = Number(res.headers["content-length"] || 0);
          let received = 0;
          let lastPct = -1;
          res.on("data", (chunk) => {
            received += chunk.length;
            if (!total) return;
            const pct = Math.floor((received / total) * 100);
            if (pct !== lastPct && pct % 5 === 0) {
              lastPct = pct;
              process.stdout.write(`\r  ${path.basename(dest)} ${pct}%`);
            }
          });
          const out = createWriteStream(dest);
          pipeline(res, out)
            .then(() => {
              process.stdout.write(`\r  ${path.basename(dest)} done          \n`);
              resolve();
            })
            .catch(reject);
        })
        .on("error", reject);
    };
    follow(url);
  });
}

function walkFind(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = walkFind(full, name);
      if (hit) return hit;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

function extractArchive(archivePath, destDir) {
  if (process.platform === "win32") {
    if (archivePath.endsWith(".tar.gz") || archivePath.endsWith(".tgz")) {
      execFileSync(
        "tar",
        ["-xzf", archivePath, "-C", destDir],
        { stdio: "inherit" },
      );
      return;
    }
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
    return;
  }

  if (archivePath.endsWith(".zip")) {
    execFileSync("unzip", ["-o", archivePath, "-d", destDir], {
      stdio: "inherit",
    });
    return;
  }

  execFileSync("tar", ["-xzf", archivePath, "-C", destDir], {
    stdio: "inherit",
  });
}

function resolveRuntimeTarget() {
  if (process.platform === "win32") {
    return {
      id: "win-x64",
      binaryName: "llama-server.exe",
      archiveName: `llama-${LLAMA_TAG}-bin-win-cpu-x64.zip`,
    };
  }
  if (process.platform === "darwin") {
    if (process.arch !== "arm64") {
      console.warn(
        `macOS ${process.arch} is not supported yet (Apple Silicon arm64 only).`,
      );
      return null;
    }
    return {
      id: "mac-arm64",
      binaryName: "llama-server",
      archiveName: `llama-${LLAMA_TAG}-bin-macos-arm64.tar.gz`,
    };
  }
  console.warn(
    `Unsupported platform ${process.platform}/${process.arch}. Place llama-server manually in ${llamaDir}`,
  );
  return null;
}

async function fetchLlamaServer() {
  mkdirSync(llamaDir, { recursive: true });
  const target = resolveRuntimeTarget();
  if (!target) return;

  const binaryPath = path.join(llamaDir, target.binaryName);
  if (existsSync(binaryPath)) {
    console.log(`${target.binaryName} already present`);
    return;
  }

  const url = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/${target.archiveName}`;
  const archivePath = path.join(llamaDir, target.archiveName);

  console.log(`Downloading llama.cpp ${LLAMA_TAG} (${target.id})...`);
  try {
    await download(url, archivePath);
  } catch (err) {
    console.warn(
      `Failed to download ${url}. Place ${target.binaryName} manually in ${llamaDir}`,
    );
    console.warn(String(err));
    return;
  }

  try {
    extractArchive(archivePath, llamaDir);
  } catch (err) {
    console.warn("Failed to extract llama.cpp release:", err);
    return;
  }

  const found = walkFind(llamaDir, target.binaryName);
  if (found && path.resolve(found) !== path.resolve(binaryPath)) {
    copyFileSync(found, binaryPath);
  }
  if (!existsSync(binaryPath)) {
    console.warn(
      `Could not locate ${target.binaryName} after extract. Check ${llamaDir}`,
    );
    return;
  }

  if (process.platform !== "win32") {
    try {
      chmodSync(binaryPath, 0o755);
    } catch {
      // best-effort; packaging/CI may still set executable bit
    }
  }

  try {
    unlinkSync(archivePath);
  } catch {
    // keep archive if delete fails
  }

  console.log("Installed", binaryPath);
}

async function fetchModels() {
  mkdirSync(modelsDir, { recursive: true });
  const models = catalog.models.filter((m) =>
    wantAllModels ? true : m.id === catalog.defaultModelId,
  );
  if (!models.length) {
    console.log("No models selected to download.");
    return;
  }
  for (const model of models) {
    const dest = path.join(modelsDir, model.filename);
    if (existsSync(dest)) {
      console.log(`Already have ${model.filename}`);
      continue;
    }
    console.log(`Downloading ${model.label}...`);
    await download(model.url, dest);
  }
}

async function main() {
  await fetchLlamaServer();
  if (wantModels) await fetchModels();
  else {
    console.log(
      "Skipped GGUF downloads (pass --models for the default model, --models --all for the full catalog). Installers ship without GGUFs.",
    );
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
