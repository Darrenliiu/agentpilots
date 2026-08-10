import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  REMEMBER_ME_COOKIE,
  parseRememberMe,
  withRememberMeCookieOptions,
} from "@/lib/supabase/remember-me";

export async function createClient(opts?: { rememberMe?: boolean }) {
  const cookieStore = await cookies();
  const remember =
    opts?.rememberMe ??
    parseRememberMe(cookieStore.get(REMEMBER_ME_COOKIE)?.value);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(
                name,
                value,
                withRememberMeCookieOptions(options, remember),
              ),
            );
          } catch {
            // Called from a Server Component — middleware will refresh sessions.
          }
        },
      },
    },
  );
}
