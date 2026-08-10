import { createBrowserClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import {
  REMEMBER_ME_COOKIE,
  parseRememberMe,
  withRememberMeCookieOptions,
} from "@/lib/supabase/remember-me";

function readBrowserCookies() {
  if (typeof document === "undefined") return [] as { name: string; value: string }[];
  const parsed = parse(document.cookie);
  return Object.keys(parsed).map((name) => ({
    name,
    value: parsed[name] ?? "",
  }));
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return readBrowserCookies();
        },
        setAll(cookiesToSet) {
          if (typeof document === "undefined") return;
          const remember = parseRememberMe(
            parse(document.cookie)[REMEMBER_ME_COOKIE],
          );
          cookiesToSet.forEach(({ name, value, options }) => {
            document.cookie = serialize(
              name,
              value,
              withRememberMeCookieOptions(options, remember) ?? {},
            );
          });
        },
      },
    },
  );
}
