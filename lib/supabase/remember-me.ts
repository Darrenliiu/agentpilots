/** Preference cookie: "1" = stay signed in across browser restarts, "0" = session only. */
export const REMEMBER_ME_COOKIE = "ap_remember_me";

/** Matches @supabase/ssr DEFAULT_COOKIE_OPTIONS.maxAge (400 days). */
export const REMEMBER_ME_MAX_AGE = 400 * 24 * 60 * 60;

export function parseRememberMe(value: string | undefined | null): boolean {
  // Absent cookie keeps existing sessions persistent (backward compatible).
  return value !== "0";
}

type CookieOptionBag = {
  path?: string;
  sameSite?: true | false | "lax" | "strict" | "none" | "Lax" | "Strict" | "None";
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  domain?: string;
  partitioned?: boolean;
  priority?: "low" | "medium" | "high";
  name?: string;
};

/**
 * When Remember Me is off, strip maxAge/expires so auth cookies are
 * browser-session cookies and clear when the browser closes.
 */
export function withRememberMeCookieOptions<T extends CookieOptionBag>(
  options: T | undefined,
  remember: boolean,
): T | undefined {
  if (!options || remember) return options;
  const next = { ...options };
  delete next.maxAge;
  delete next.expires;
  return next;
}

export function rememberMeCookieOptions(remember: boolean) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: REMEMBER_ME_MAX_AGE } : {}),
  };
}
