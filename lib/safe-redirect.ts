/**
 * Only allow same-origin relative paths (reject protocol-relative //evil.com).
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/home",
): string {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
