import packageJson from "../package.json";

const DEFAULT_GITHUB_REPO = "Darrenliiu/agentpilots";
const DEFAULT_INSTALL_BRANCH = "main";

export function getDesktopVersionLabel() {
  const fromEnv = process.env.NEXT_PUBLIC_DESKTOP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  return typeof packageJson.version === "string" ? packageJson.version : "0.1.5";
}

export function getGithubRepo() {
  return (
    process.env.NEXT_PUBLIC_DESKTOP_GITHUB_REPO?.trim() || DEFAULT_GITHUB_REPO
  );
}

/** Public Windows installer URL (explicit env, legacy env, or GitHub Releases default). */
export function getWindowsDownloadUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_DESKTOP_WINDOWS_URL?.trim() ||
    process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL?.trim();
  if (explicit) return explicit;

  const version = getDesktopVersionLabel();
  const repo = getGithubRepo();
  return `https://github.com/${repo}/releases/latest/download/AgentPilots-Setup-${version}.exe`;
}

/** Public macOS Apple Silicon DMG URL (explicit env or GitHub Releases default). */
export function getMacDownloadUrl() {
  const explicit = process.env.NEXT_PUBLIC_DESKTOP_MAC_URL?.trim();
  if (explicit) return explicit;

  const version = getDesktopVersionLabel();
  const repo = getGithubRepo();
  return `https://github.com/${repo}/releases/latest/download/AgentPilots-${version}-arm64.dmg`;
}

/** Raw GitHub URL for the Mac Terminal install script. */
export function getMacInstallScriptUrl() {
  const repo = getGithubRepo();
  const branch =
    process.env.NEXT_PUBLIC_DESKTOP_INSTALL_BRANCH?.trim() ||
    DEFAULT_INSTALL_BRANCH;
  return `https://raw.githubusercontent.com/${repo}/${branch}/desktop/scripts/install-mac.sh`;
}

/** One-liner that downloads, installs, and clears Gatekeeper quarantine. */
export function getMacInstallCommand() {
  return `curl -fsSL ${getMacInstallScriptUrl()} | bash`;
}
