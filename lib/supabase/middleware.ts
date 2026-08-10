import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  REMEMBER_ME_COOKIE,
  parseRememberMe,
  withRememberMeCookieOptions,
} from "@/lib/supabase/remember-me";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const remember = parseRememberMe(
    request.cookies.get(REMEMBER_ME_COOKIE)?.value,
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              withRememberMeCookieOptions(options, remember),
            ),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isDesktop = process.env.AGENTPILOTS_DESKTOP === "1";
  const isAuthPage =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/join") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/auth/");

  // Desktop: skip marketing surfaces — auth is the landing surface
  if (
    isDesktop &&
    (path === "/" || path.startsWith("/discover") || path.startsWith("/download"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/home" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isPublic =
    isAuthPage ||
    path.startsWith("/api") ||
    path === "/" ||
    path.startsWith("/discover") ||
    path.startsWith("/download") ||
    path.startsWith("/_next");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
