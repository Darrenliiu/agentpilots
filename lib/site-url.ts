/** Canonical production origin for shareable links, emails, and OAuth callbacks. */
export const DEFAULT_PUBLIC_SITE_URL = "https://agentpilots.ai";

function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

function isLoopbackOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

/**
 * Absolute public site origin for links that leave the app (invites, emails, Stripe).
 * Never returns a desktop/loopback origin.
 */
export function siteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(
      /\/$/,
      "",
    )}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  if (process.env.AGENTPILOTS_DESKTOP === "1") {
    return DEFAULT_PUBLIC_SITE_URL;
  }

  return "http://localhost:3000";
}

/**
 * Browser-safe origin for community share / invite URLs.
 * Prefers NEXT_PUBLIC_SITE_URL; falls back to the live domain when running
 * on desktop or any loopback host (e.g. Electron on 127.0.0.1:3847).
 */
export function publicShareOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);

  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const isDesktop =
      typeof window.agentpilots !== "undefined" && Boolean(window.agentpilots);
    if (isDesktop || isLoopbackOrigin(origin)) {
      return DEFAULT_PUBLIC_SITE_URL;
    }
    return origin;
  }

  return siteOrigin();
}

export function absoluteShareUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${publicShareOrigin()}${normalized}`;
}
