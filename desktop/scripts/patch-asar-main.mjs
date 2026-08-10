/**
 * Replace desktop/main.cjs inside an Electron app.asar without a full extract.
 * Keeps a .bak until the caller verifies the app boots.
 */
import asar from "@electron/asar";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const archive =
  process.argv[2] ||
  path.join(process.env.LOCALAPPDATA, "Programs", "AgentPilots", "resources", "app.asar");
const newMainPath = process.argv[3] || path.join(root, "desktop", "main.cjs");
const replaceRel = "desktop/main.cjs";
const outPath = `${archive}.new`;
const bakPath = `${archive}.bak`;

const newMainBuf = fs.readFileSync(newMainPath);
console.log("new main bytes:", newMainBuf.length);

const allPaths = asar.listPackage(archive);
/** @type {import('@electron/asar').AsarStreamType[]} */
const streams = [];
let fileCount = 0;
let dirCount = 0;
let skipped = 0;

for (const raw of allPaths) {
  // Windows asars store paths with backslashes; keep that form for lookup.
  const key = raw.replace(/^[\\/]+/, "");
  if (!key) continue;
  const keyPosix = key.replace(/\\/g, "/");

  let info;
  try {
    info = asar.statFile(archive, key, false);
  } catch {
    skipped += 1;
    continue;
  }

  if ("files" in info) {
    dirCount += 1;
    continue;
  }

  if ("link" in info) {
    streams.push({
      type: "link",
      path: key,
      unpacked: Boolean(info.unpacked),
      symlink: info.link,
      streamGenerator: () => Readable.from(Buffer.alloc(0)),
      stat: { mode: 0o644, size: 0 },
    });
    continue;
  }

  fileCount += 1;
  const isReplace = keyPosix === replaceRel;
  if (isReplace) {
    console.log("replacing", keyPosix, "old", info.size, "->", newMainBuf.length);
  }

  streams.push({
    type: "file",
    path: key,
    unpacked: Boolean(info.unpacked),
    streamGenerator: () =>
      Readable.from(isReplace ? newMainBuf : asar.extractFile(archive, key, false)),
    stat: {
      mode: info.executable ? 0o755 : 0o644,
      size: isReplace ? newMainBuf.length : info.size,
    },
  });
}

console.log({ fileCount, dirCount, skipped, streams: streams.length });
if (fileCount < 1000) {
  throw new Error(`Refusing to pack — only found ${fileCount} files (expected thousands)`);
}

console.log("writing", outPath, "...");
await asar.createPackageFromStreams(outPath, streams);

const oldSize = fs.statSync(archive).size;
const newSize = fs.statSync(outPath).size;
console.log("old MB", (oldSize / 1e6).toFixed(1), "new MB", (newSize / 1e6).toFixed(1));
if (newSize < oldSize * 0.5) {
  fs.unlinkSync(outPath);
  throw new Error(`New asar too small (${newSize}); aborting swap`);
}

if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
fs.renameSync(archive, bakPath);
fs.renameSync(outPath, archive);

let patched;
try {
  patched = asar.extractFile(archive, replaceRel).toString("utf8");
} catch {
  patched = asar.extractFile(archive, replaceRel.replace(/\//g, "\\")).toString("utf8");
}
if (!patched.includes("setApplicationMenu")) {
  fs.renameSync(archive, outPath);
  fs.renameSync(bakPath, archive);
  throw new Error("Patch verification failed; restored bak");
}

console.log(
  "ok sha",
  crypto.createHash("sha256").update(newMainBuf).digest("hex").slice(0, 12),
);
console.log("bak kept at", bakPath);
