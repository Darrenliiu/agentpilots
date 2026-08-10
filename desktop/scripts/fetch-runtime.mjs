#!/usr/bin/env node
/**
 * Downloads llama-server (Windows x64) and optionally bundled GGUF models
 * into desktop/resources for local/desktop development and packaging.
 *
 * Usage:
 *   node desktop/scripts/fetch-runtime.mjs
 *   node desktop/scripts/fetch-runtime.mjs --models
 *   node desktop/scripts/fetch-runtime.mjs --models --all
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from "fs";
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

async function fetchLlamaServer() {
  mkdirSync(llamaDir, { recursive: true });
  const exe = path.join(llamaDir, "llama-server.exe");
  if (existsSync(exe)) {
    console.log("llama-server.exe already present");
    return;
  }

  const tag = process.env.LLAMA_CPP_TAG || "b10278";
  const zipName = `llama-${tag}-bin-win-cpu-x64.zip`;
  const url = `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${zipName}`;
  const zipPath = path.join(llamaDir, zipName);

  console.log(`Downloading llama.cpp ${tag}...`);
  try {
    await download(url, zipPath);
  } catch (err) {
    console.warn(
      `Failed to download ${url}. Place llama-server.exe manually in ${llamaDir}`,
    );
    console.warn(String(err));
    return;
  }

  try {
    if (process.platform === "win32") {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${llamaDir.replace(/'/g, "''")}' -Force`,
        ],
        { stdio: "inherit" },
      );
    } else {
      execFileSync("unzip", ["-o", zipPath, "-d", llamaDir], { stdio: "inherit" });
    }
  } catch (err) {
    console.warn("Failed to unzip llama.cpp release:", err);
    return;
  }

  const found = walkFind(llamaDir, "llama-server.exe");
  if (found && path.resolve(found) !== path.resolve(exe)) {
    copyFileSync(found, exe);
  }
  if (!existsSync(exe)) {
    console.warn(`Could not locate llama-server.exe after extract. Check ${llamaDir}`);
  } else {
    console.log("Installed", exe);
  }
}

async function fetchModels() {
  mkdirSync(modelsDir, { recursive: true });
  const models = catalog.models.filter((m) => (wantAllModels ? true : m.bundled));
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
      "Skipped GGUF downloads (pass --models to fetch bundled models, --all for full catalog).",
    );
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
