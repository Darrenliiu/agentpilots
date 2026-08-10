import { createBrowserClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import {
  REMEMBER_ME_COOKIE,
  parseRememberMe,
  withRememberMeCookieOptions,
} from "@/lib/supabase/remember-me";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const parsed = parse(document.cookie);
          return Object.keys(parsed).map((name) => ({
            name,
            value: parsed[name] ?? "",
          }));
        },
        setAll(cookiesToSet) {
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
