/**
 * Build Next with output: 'standalone' for the Electron packager.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = { ...process.env, AGENTPILOTS_STANDALONE: "1" };

const build = spawnSync("npx", ["next", "build"], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: true,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const prepare = spawnSync("node", ["desktop/scripts/prepare-standalone.mjs"], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: true,
});
process.exit(prepare.status ?? 1);
