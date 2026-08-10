#!/usr/bin/env node
/**
 * Copies static assets into the Next standalone output so Electron can run it.
 */
import { cpSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const standalone = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const publicSrc = path.join(root, "public");

if (!existsSync(standalone)) {
  console.error("Missing .next/standalone — run next build first (output: 'standalone').");
  process.exit(1);
}

const staticDest = path.join(standalone, ".next", "static");
mkdirSync(path.dirname(staticDest), { recursive: true });
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDest, { recursive: true });
  console.log("Copied .next/static -> standalone");
}

if (existsSync(publicSrc)) {
  cpSync(publicSrc, path.join(standalone, "public"), { recursive: true });
  console.log("Copied public -> standalone");
}

console.log("Standalone prepare complete.");
