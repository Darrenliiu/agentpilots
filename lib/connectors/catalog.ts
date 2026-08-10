import type { ConnectorAuthType } from "@/lib/types";

const PRIVATE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

function isPrivateIp(hostname: string): boolean {
  if (PRIVATE_HOSTS.has(hostname.toLowerCase())) return true;
  // IPv4 private ranges
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Validate custom MCP URLs. Cloud: https only, no private hosts.
 * Desktop/local: optionally allow http://localhost.
 */
export function validateMcpUrl(
  raw: string,
  opts?: { allowLocalhost?: boolean },
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "MCP URL is required" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Invalid MCP URL" };
  }

  const allowLocal =
    opts?.allowLocalhost === true ||
    process.env.AGENTPILOTS_ALLOW_LOCAL_MCP === "1";

  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:")) {
    return { ok: false, error: "MCP URL must use HTTPS" };
  }

  if (isPrivateIp(url.hostname) && !allowLocal) {
    return { ok: false, error: "Private or localhost MCP URLs are not allowed" };
  }

  return { ok: true, url: url.toString() };
}

export function slugifyConnector(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "connector"
  );
}

export function isConnectorAuthType(v: string): v is ConnectorAuthType {
  return v === "oauth" || v === "bearer" || v === "none";
}
